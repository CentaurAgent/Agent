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
const OUTLIER_MULTIPLIER = parseFloat(process.env.OUTLIER_MULTIPLIER || "3.0"); // 3x floor = interesting
const EXTREME_OUTLIER_MULTIPLIER = parseFloat(process.env.EXTREME_OUTLIER_MULTIPLIER || "50"); // 50x+ = crazy high
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || "180000"); // 3 min

const OPENSEA_BASE = "https://api.opensea.io/api/v2";

// ====================== HELPERS ======================
function log(level: string, msg: string, data?: any) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] ${msg}`, data !== undefined ? data : "");
}

async function getHeaders() {
  const headers: any = {
    accept: "application/json",
    "User-Agent": "Centaur-Agent-Claw/2.1",
  };
  if (OPENSEA_API_KEY) headers["x-api-key"] = OPENSEA_API_KEY;
  return headers;
}

async function fetchReceivedOffers(address: string) {
  const url = `${OPENSEA_BASE}/account/${address}/offers_received`;
  const res = await axios.get(url, {
    headers: await getHeaders(),
    params: { limit: 50 },
    timeout: 12000,
  });
  return res.data?.offers || res.data || [];
}

function parseOfferPrice(offer: any): number {
  try {
    const value =
      offer?.price?.value ||
      offer?.current_price ||
      offer?.price?.current?.value ||
      offer?.protocol_data?.parameters?.offer?.[0]?.startAmount;

    if (!value) return 0;
    const decimals = offer?.price?.decimals ?? 18;
    return Number(ethers.formatUnits(value.toString(), decimals));
  } catch {
    return 0;
  }
}

async function getFloor(slug: string): Promise<number | null> {
  if (!slug || slug === "unknown") return null;
  try {
    const res = await axios.get(`${OPENSEA_BASE}/collections/${slug}/stats`, {
      headers: await getHeaders(),
      timeout: 8000,
    });
    const floor = res.data?.total?.floor_price ?? res.data?.floor_price ?? res.data?.stats?.floor_price;
    return floor ? Number(floor) : null;
  } catch {
    return null;
  }
}

// ====================== CORE ======================
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

    const evaluated: any[] = [];

    for (const offer of offers) {
      const priceEth = parseOfferPrice(offer);
      if (priceEth <= 0) continue;

      const collectionSlug =
        offer?.criteria?.collection?.slug ||
        offer?.collection?.slug ||
        offer?.item?.collection ||
        "unknown";

      const floor = await getFloor(collectionSlug);
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
        orderHash: offer?.order_hash || offer?.orderHash || null,
        offer,
      });
    }

    // Sort: Extreme first → then highest multiplier → then highest price
    evaluated.sort((a, b) => {
      if (a.isExtreme !== b.isExtreme) return a.isExtreme ? -1 : 1;
      if ((b.multiplier || 0) !== (a.multiplier || 0)) return (b.multiplier || 0) - (a.multiplier || 0);
      return b.priceEth - a.priceEth;
    });

    const actionable = evaluated.filter(e => e.isInteresting || e.isOutlier || e.isExtreme);

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
 * This is where the agent "decides" and tells you what it would do.
 */
async function handleBid(bid: any) {
  const multText = bid.multiplier ? `${bid.multiplier.toFixed(1)}x floor` : "no floor data";

  if (bid.isExtreme) {
    log("EXTREME", `🔥🔥🔥 INSANE BID DETECTED: ${bid.priceEth.toFixed(4)} ETH (${multText}) on ${bid.collectionSlug}`);
  } else if (bid.isOutlier) {
    log("OUTLIER", `🚀 Strong outlier: ${bid.priceEth.toFixed(4)} ETH (${multText}) on ${bid.collectionSlug}`);
  } else {
    log("INTERESTING", `💰 Decent bid: ${bid.priceEth.toFixed(4)} ETH on ${bid.collectionSlug}`);
  }

  // === SIMULATED ACCEPTANCE ===
  if (DRY_RUN) {
    log("SIMULATION", `Would ACCEPT this offer`);
    log("SIMULATION", `Order Hash: ${bid.orderHash || "unknown"}`);
    log("SIMULATION", `Collection: ${bid.collectionSlug} | Price: ${bid.priceEth.toFixed(4)} ETH | ${multText}`);
    log("SIMULATION", `→ In live mode this would trigger Seaport fulfillment`);
    return;
  }

  // Future live path will go here (still disabled)
  log("LIVE", "Real acceptance is still disabled for safety.");
}

// ====================== SERVER ======================
app.get("/health", (_req, res) => {
  res.json({
    status: "Centaur Agent Claw v2.1 – Scanner + Simulated Acceptance",
    dryRun: DRY_RUN,
    wallet: WALLET_ADDRESS || null,
  });
});

app.get("/scan", async (_req, res) => {
  await scanAndEvaluateBids();
  res.send("Manual scan completed – check logs");
});

app.listen(PORT, () => {
  console.log("-----------------------------------------------");
  console.log("  CENTAUR AGENT CLAW v2.1");
  console.log("  NFT Bid Scanner + Simulated Acceptance");
  console.log(`  DRY_RUN: ${DRY_RUN}  |  Port: ${PORT}`);
  console.log("-----------------------------------------------");

  scanAndEvaluateBids();
  setInterval(scanAndEvaluateBids, SCAN_INTERVAL_MS);
});
