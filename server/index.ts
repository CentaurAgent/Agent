import express from "express";
import axios from "axios";
import { ethers } from "ethers";

const app = express();
const PORT = process.env.PORT || 10000;

// ====================== CONFIG ======================
const WALLET_ADDRESS = (process.env.WALLET_ADDRESS || "").toLowerCase();
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || "";
const DRY_RUN = process.env.DRY_RUN !== "false"; // default true
const MIN_BID_ETH = parseFloat(process.env.MIN_BID_ETH || "0.005");
const OUTLIER_MULTIPLIER = parseFloat(process.env.OUTLIER_MULTIPLIER || "3.0");
const EXTREME_OUTLIER_MULTIPLIER = parseFloat(process.env.EXTREME_OUTLIER_MULTIPLIER || "50");
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || "180000"); // 3 min
const USE_TOON = process.env.USE_TOON === "true"; // set to true if you want token-optimized responses
const FLOOR_CACHE_TTL_MS = 90_000; // 90 seconds

const OPENSEA_BASE = "https://api.opensea.io/api/v2";

// Simple in-memory floor cache
const floorCache = new Map<string, { value: number | null; expires: number }>();

// ====================== HELPERS ======================
function log(level: string, msg: string, data?: any) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] ${msg}`, data !== undefined ? data : "");
}

async function getHeaders() {
  const headers: Record<string, string> = {
    accept: USE_TOON ? "text/markdown" : "application/json",
    "User-Agent": "Centaur-Agent-Claw/2.2",
  };
  if (OPENSEA_API_KEY) {
    headers["x-api-key"] = OPENSEA_API_KEY;
  }
  return headers;
}

/**
 * Robust collection slug extractor – covers all common OpenSea shapes in 2026
 */
function getCollectionSlug(offer: any): string {
  return (
    offer?.criteria?.collection?.slug ||
    offer?.collection?.slug ||
    offer?.item?.collection?.slug ||
    offer?.item?.collection ||
    offer?.nft?.collection ||
    offer?.protocol_data?.parameters?.consideration?.[0]?.token || // fallback, rarely useful
    (typeof offer?.collection === "string" ? offer.collection : null) ||
    "unknown"
  );
}

function parseOfferPrice(offer: any): number {
  try {
    const value =
      offer?.price?.value ||
      offer?.current_price ||
      offer?.price?.current?.value ||
      offer?.protocol_data?.parameters?.offer?.[0]?.startAmount ||
      offer?.protocol_data?.parameters?.consideration?.[0]?.startAmount;

    if (!value) return 0;

    // Most offers are 18 decimals, but we try to respect what OpenSea sends
    const decimals =
      offer?.price?.decimals ??
      offer?.payment_token?.decimals ??
      18;

    return Number(ethers.formatUnits(value.toString(), decimals));
  } catch {
    return 0;
  }
}

async function getFloor(slug: string): Promise<number | null> {
  if (!slug || slug === "unknown") return null;

  // Cache check
  const cached = floorCache.get(slug);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  try {
    const res = await axios.get(`${OPENSEA_BASE}/collections/${slug}/stats`, {
      headers: await getHeaders(),
      timeout: 9000,
    });

    // Works with both normal JSON and TOON (when we fall back)
    const data = typeof res.data === "string" ? null : res.data;

    const floor =
      data?.total?.floor_price ??
      data?.total?.floorPrice ??
      data?.floor_price ??
      data?.stats?.floor_price ??
      null;

    const numericFloor = floor !== null && floor !== undefined ? Number(floor) : null;

    // Cache it
    floorCache.set(slug, {
      value: numericFloor,
      expires: Date.now() + FLOOR_CACHE_TTL_MS,
    });

    return numericFloor;
  } catch (err: any) {
    log("WARN", `Floor fetch failed for ${slug}`, err.message);
    floorCache.set(slug, { value: null, expires: Date.now() + 30_000 }); // short negative cache
    return null;
  }
}

// ====================== CORE ======================
async function fetchReceivedOffers(address: string) {
  const url = `${OPENSEA_BASE}/accounts/${address}/offers_received`; // note: plural "accounts" is the current preferred path
  // fallback path kept for safety
  try {
    const res = await axios.get(url, {
      headers: await getHeaders(),
      params: { limit: 50 },
      timeout: 12000,
    });
    return res.data?.offers || res.data || [];
  } catch (err: any) {
    // Try the singular version as fallback (some older docs still use it)
    log("WARN", "Plural path failed, trying singular /account/...", err.message);
    const fallback = await axios.get(`${OPENSEA_BASE}/account/${address}/offers_received`, {
      headers: await getHeaders(),
      params: { limit: 50 },
      timeout: 12000,
    });
    return fallback.data?.offers || fallback.data || [];
  }
}

async function scanAndEvaluateBids() {
  if (!WALLET_ADDRESS) {
    log("ERROR", "WALLET_ADDRESS is required");
    return;
  }

  log("SCAN", `Starting received-offers scan for ${WALLET_ADDRESS}`);

  try {
    const offers = await fetchReceivedOffers(WALLET_ADDRESS);
    log("SCAN", `Found ${offers.length} active received offers`);

    if (offers.length === 0) {
      log("SCAN", "No active bids on your NFTs right now.");
      return;
    }

    // Pre-extract unique slugs and fetch floors in parallel (with simple concurrency)
    const uniqueSlugs = [...new Set(offers.map(getCollectionSlug).filter(s => s !== "unknown"))];
    log("SCAN", `Fetching floors for ${uniqueSlugs.length} unique collections...`);

    const floorMap = new Map<string, number | null>();
    // Simple sequential + cache is already good; for larger lists you can add p-limit later
    for (const slug of uniqueSlugs) {
      floorMap.set(slug, await getFloor(slug));
    }

    const evaluated: any[] = [];

    for (const offer of offers) {
      const priceEth = parseOfferPrice(offer);
      if (priceEth <= 0) continue;

      const collectionSlug = getCollectionSlug(offer);
      const floor = floorMap.get(collectionSlug) ?? null;
      const multiplier = floor && floor > 0 ? priceEth / floor : null;

      const isInteresting = priceEth >= MIN_BID_ETH;
      const isOutlier = multiplier !== null && multiplier >= OUTLIER_MULTIPLIER;
      const isExtreme = multiplier !== null && multiplier >= EXTREME_OUTLIER_MULTIPLIER;

      evaluated.push({
        priceEth,
        floor,
        multiplier,
        collectionSlug,
        isInteresting,
        isOutlier,
        isExtreme,
        orderHash: offer?.order_hash || offer?.orderHash || offer?.order_hash || null,
        tokenId: offer?.item?.token_id || offer?.nft?.identifier || null,
        chain: offer?.item?.chain || offer?.chain || null,
        offer,
      });
    }

    // Priority: Extreme → highest multiplier → highest price
    evaluated.sort((a, b) => {
      if (a.isExtreme !== b.isExtreme) return a.isExtreme ? -1 : 1;
      if ((b.multiplier || 0) !== (a.multiplier || 0)) {
        return (b.multiplier || 0) - (a.multiplier || 0);
      }
      return b.priceEth - a.priceEth;
    });

    const actionable = evaluated.filter(
      (e) => e.isInteresting || e.isOutlier || e.isExtreme
    );

    if (actionable.length === 0) {
      log("DECISION", "No bids met the criteria.");
      return;
    }

    log("DECISION", `${actionable.length} bid(s) worth attention`);

    for (const bid of actionable) {
      await handleBid(bid);
    }
  } catch (err: any) {
    log("ERROR", "Scan failed", err.message);
  }
}

/**
 * Simulated Acceptance Engine
 */
async function handleBid(bid: any) {
  const multText = bid.multiplier
    ? `${bid.multiplier.toFixed(1)}x floor`
    : "no floor data";

  if (bid.isExtreme) {
    log(
      "EXTREME",
      `🔥🔥🔥 INSANE BID: ${bid.priceEth.toFixed(4)} ETH (${multText}) on ${bid.collectionSlug}`
    );
  } else if (bid.isOutlier) {
    log(
      "OUTLIER",
      `🚀 Strong outlier: ${bid.priceEth.toFixed(4)} ETH (${multText}) on ${bid.collectionSlug}`
    );
  } else {
    log(
      "INTERESTING",
      `💰 Decent bid: ${bid.priceEth.toFixed(4)} ETH on ${bid.collectionSlug}`
    );
  }

  if (DRY_RUN) {
    log("SIMULATION", `Would ACCEPT this offer`);
    log("SIMULATION", `Order Hash : ${bid.orderHash || "unknown"}`);
    log("SIMULATION", `Collection : ${bid.collectionSlug}`);
    log("SIMULATION", `Token ID   : ${bid.tokenId || "n/a"}`);
    log("SIMULATION", `Price      : ${bid.priceEth.toFixed(4)} ETH | ${multText}`);
    log("SIMULATION", `→ Live mode would trigger Seaport fulfillment here`);
    return;
  }

  // Live path still intentionally disabled
  log("LIVE", "Real acceptance is still disabled for safety.");
}

// ====================== SERVER ======================
app.get("/health", (_req, res) => {
  res.json({
    status: "Centaur Agent Claw v2.2 – Optimized for OpenSea AI features",
    dryRun: DRY_RUN,
    useToon: USE_TOON,
    wallet: WALLET_ADDRESS || null,
    floorCacheSize: floorCache.size,
  });
});

app.get("/scan", async (_req, res) => {
  await scanAndEvaluateBids();
  res.send("Manual scan completed – check logs");
});

app.listen(PORT, () => {
  console.log("-----------------------------------------------");
  console.log("  CENTAUR AGENT CLAW v2.2");
  console.log("  Optimized for OpenSea TOON + robust slug/floor");
  console.log(`  DRY_RUN: ${DRY_RUN}  |  USE_TOON: ${USE_TOON}  |  Port: ${PORT}`);
  console.log("-----------------------------------------------");

  scanAndEvaluateBids();
  setInterval(scanAndEvaluateBids, SCAN_INTERVAL_MS);
});
