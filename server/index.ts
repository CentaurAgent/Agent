import express from "express";
import axios from "axios";
import { ethers } from "ethers";

const app = express();
const PORT = process.env.PORT || 10000;

// ====================== CONFIG ======================
const RPC_URL = process.env.RPC_URL || "https://mainnet.base.org";
const WALLET_ADDRESS = (process.env.WALLET_ADDRESS || "").toLowerCase();
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || ""; // ONLY for future real fulfillment

// Safety & behavior flags
const DRY_RUN = process.env.DRY_RUN !== "false"; // default TRUE = safe
const MIN_BID_ETH = parseFloat(process.env.MIN_BID_ETH || "0.01");
const OUTLIER_MULTIPLIER = parseFloat(process.env.OUTLIER_MULTIPLIER || "2.0"); // 2x floor
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || "300000"); // 5 min

const OPENSEA_BASE = "https://api.opensea.io/api/v2";

// ====================== HELPERS ======================
function log(msg: string, data?: any) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`, data !== undefined ? data : "");
}

async function getOpenSeaHeaders() {
  const headers: any = {
    accept: "application/json",
    "User-Agent": "Centaur-Agent-Claw/2.0",
  };
  if (OPENSEA_API_KEY) headers["x-api-key"] = OPENSEA_API_KEY;
  return headers;
}

/**
 * Correct endpoint: offers RECEIVED on items you own
 * Docs: GET /api/v2/account/{address}/offers_received
 */
async function fetchReceivedOffers(address: string) {
  const url = `${OPENSEA_BASE}/account/${address}/offers_received`;
  const headers = await getOpenSeaHeaders();

  const response = await axios.get(url, {
    headers,
    params: {
      limit: 50,
      // You can add collection_slugs or chains filters here later
    },
    timeout: 10000,
  });

  return response.data?.offers || response.data || [];
}

/**
 * Optional: get a rough floor for a collection (simple version)
 * You can expand this later with better floor sources.
 */
async function getCollectionFloor(slug: string): Promise<number | null> {
  try {
    const headers = await getOpenSeaHeaders();
    const res = await axios.get(`${OPENSEA_BASE}/collections/${slug}/stats`, {
      headers,
      timeout: 8000,
    });
    // Adjust path depending on exact response shape
    const floor = res.data?.total?.floor_price || res.data?.floor_price;
    return floor ? Number(floor) : null;
  } catch {
    return null;
  }
}

function parseOfferPrice(offer: any): number {
  try {
    // Common shapes in OpenSea responses
    const value =
      offer?.price?.value ||
      offer?.current_price ||
      offer?.price?.current?.value ||
      offer?.protocol_data?.parameters?.offer?.[0]?.startAmount;

    if (!value) return 0;

    // Most OpenSea prices are in wei (or with decimals field)
    const decimals = offer?.price?.decimals ?? 18;
    return Number(ethers.formatUnits(value.toString(), decimals));
  } catch {
    return 0;
  }
}

// ====================== CORE SCANNER ======================
async function scanAndEvaluateBids() {
  if (!WALLET_ADDRESS) {
    log("[ERROR] WALLET_ADDRESS is required");
    return;
  }

  log(`[SCAN] Starting received-offers scan for ${WALLET_ADDRESS}`);

  try {
    const offers = await fetchReceivedOffers(WALLET_ADDRESS);
    log(`[SCAN] Found ${offers.length} active received offers`);

    if (offers.length === 0) {
      log("[SCAN] No active bids on your NFTs right now.");
      return;
    }

    const candidates: any[] = [];

    for (const offer of offers) {
      const priceEth = parseOfferPrice(offer);
      if (priceEth <= 0) continue;

      // Try to get collection context
      const collectionSlug =
        offer?.criteria?.collection?.slug ||
        offer?.collection?.slug ||
        offer?.item?.collection ||
        "unknown";

      let floor = null;
      if (collectionSlug !== "unknown") {
        floor = await getCollectionFloor(collectionSlug);
      }

      const isAboveMin = priceEth >= MIN_BID_ETH;
      const isOutlier = floor ? priceEth >= floor * OUTLIER_MULTIPLIER : false;

      const decision = {
        priceEth,
        collectionSlug,
        floor,
        isAboveMin,
        isOutlier,
        shouldConsider: isAboveMin || isOutlier,
        orderHash: offer?.order_hash || offer?.orderHash || null,
        raw: offer,
      };

      candidates.push(decision);

      log(
        `[EVAL] ${priceEth.toFixed(4)} ETH | floor: ${
          floor?.toFixed(4) ?? "n/a"
        } | outlier: ${isOutlier} | consider: ${decision.shouldConsider}`,
        { collection: collectionSlug }
      );
    }

    // Sort best first
    candidates.sort((a, b) => b.priceEth - a.priceEth);

    const actionable = candidates.filter((c) => c.shouldConsider);

    if (actionable.length === 0) {
      log("[DECISION] No bids met the criteria.");
      return;
    }

    log(`[DECISION] ${actionable.length} bid(s) worth considering`);

    for (const bid of actionable) {
      await handleBid(bid);
    }
  } catch (err: any) {
    log("[SCAN ERROR]", err.message);
  }
}

/**
 * Decision + execution stub
 * Currently always simulates unless you explicitly enable real mode later
 */
async function handleBid(bid: any) {
  log(`🚨 [CANDIDATE] ${bid.priceEth.toFixed(4)} ETH on ${bid.collectionSlug}`);

  if (DRY_RUN || !PRIVATE_KEY) {
    log(
      `[SIMULATION] Would accept this offer (orderHash: ${
        bid.orderHash || "n/a"
      }). Real fulfillment is disabled.`
    );
    // Here you would later call Seaport fulfillment or OpenSea fulfillment_data endpoint
    return;
  }

  // === REAL FULFILLMENT PLACEHOLDER ===
  // WARNING: Do NOT enable this until you fully understand Seaport + gas + royalties
  log("[LIVE MODE] Real acceptance not implemented yet for safety.");
  // Future: use OpenSea SDK or Seaport-js + fulfillment_data endpoint
}

// ====================== SERVER ======================
app.get("/health", (_req, res) => {
  res.json({
    status: "Centaur Agent Claw v2 alive",
    dryRun: DRY_RUN,
    wallet: WALLET_ADDRESS || null,
    hasApiKey: !!OPENSEA_API_KEY,
  });
});

app.get("/scan", async (_req, res) => {
  await scanAndEvaluateBids();
  res.send("Scan completed – check logs");
});

app.listen(PORT, () => {
  console.log("-----------------------------------------------");
  console.log("   CENTAUR AGENT CLAW v2 – NFT Bid Scanner");
  console.log(`   DRY_RUN: ${DRY_RUN}  |  Port: ${PORT}`);
  console.log("-----------------------------------------------");

  // Initial scan
  scanAndEvaluateBids();

  // Periodic pulse
  setInterval(scanAndEvaluateBids, SCAN_INTERVAL_MS);
});
