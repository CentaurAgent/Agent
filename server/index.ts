import express from "express";
import axios from "axios";
import { ethers } from "ethers";
import { OpenSeaSDK, Chain } from "@opensea/sdk";

const app = express();
const PORT = process.env.PORT || 10000;

// ====================== CONFIG ======================
const WALLET_ADDRESS = (process.env.WALLET_ADDRESS || "").toLowerCase();
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || "";
const DRY_RUN = process.env.DRY_RUN !== "false"; // default = SAFE (true)
const MIN_BID_ETH = parseFloat(process.env.MIN_BID_ETH || "0.005");
const OUTLIER_MULTIPLIER = parseFloat(process.env.OUTLIER_MULTIPLIER || "3.0");
const EXTREME_OUTLIER_MULTIPLIER = parseFloat(process.env.EXTREME_OUTLIER_MULTIPLIER || "50");
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || "180000"); // 3 min
const RPC_URL = process.env.RPC_URL || "https://eth.llamarpc.com";
const LIST_PRICE_MULTIPLIER = parseFloat(process.env.LIST_PRICE_MULTIPLIER || "1.15"); // 15% above floor
const LISTING_EXPIRATION_DAYS = parseInt(process.env.LISTING_EXPIRATION_DAYS || "7");

// ====================== WALLET + SDK ======================
let wallet: ethers.Wallet | null = null;
let sdk: OpenSeaSDK | null = null;

if (PRIVATE_KEY) {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    // Pass the signer (wallet) so the SDK can sign listings
    sdk = new OpenSeaSDK(wallet, {
      chain: Chain.Mainnet,
      apiKey: OPENSEA_API_KEY || undefined,
    });

    console.log(`✅ Wallet loaded: ${wallet.address}`);
    console.log(`✅ OpenSea SDK ready`);
  } catch (err: any) {
    console.error("❌ Failed to load wallet/SDK:", err.message);
  }
} else {
  console.warn("⚠️ PRIVATE_KEY not set – live listing & signing disabled");
}

// Floor cache
const floorCache = new Map<string, { value: number | null; expires: number }>();
const FLOOR_CACHE_TTL = 90_000;

// ====================== HELPERS ======================
function log(level: string, msg: string, data?: any) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] ${msg}`, data !== undefined ? data : "");
}

async function getHeaders() {
  const headers: any = {
    accept: "application/json",
    "User-Agent": "Centaur-Agent-Claw/3.1",
  };
  if (OPENSEA_API_KEY) headers["x-api-key"] = OPENSEA_API_KEY;
  return headers;
}

async function getFloor(slug: string): Promise<number | null> {
  if (!slug || slug === "unknown") return null;
  const cached = floorCache.get(slug);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const res = await axios.get(`https://api.opensea.io/api/v2/collections/${slug}/stats`, {
      headers: await getHeaders(),
      timeout: 8000,
    });
    const floor =
      res.data?.total?.floor_price ??
      res.data?.total?.floorPrice ??
      res.data?.floor_price ??
      res.data?.stats?.floor_price ??
      null;
    const value = floor != null ? Number(floor) : null;
    floorCache.set(slug, { value, expires: Date.now() + FLOOR_CACHE_TTL });
    return value;
  } catch {
    floorCache.set(slug, { value: null, expires: Date.now() + 30_000 });
    return null;
  }
}

async function fetchOwnedNFTs(address: string) {
  try {
    const res = await axios.get(
      `https://api.opensea.io/api/v2/chain/ethereum/account/${address}/nfts`,
      {
        headers: await getHeaders(),
        params: { limit: 50 },
        timeout: 15000,
      }
    );
    return res.data?.nfts || [];
  } catch (err: any) {
    log("ERROR", "Failed to fetch owned NFTs", err.message);
    return [];
  }
}

// ====================== REAL LISTING (using official SDK) ======================
async function listOwnedNFTs() {
  if (!WALLET_ADDRESS) {
    log("ERROR", "WALLET_ADDRESS is required");
    return;
  }

  log("LIST", `Checking NFTs owned by ${WALLET_ADDRESS}...`);
  const nfts = await fetchOwnedNFTs(WALLET_ADDRESS);

  if (nfts.length === 0) {
    log("LIST", "No NFTs found.");
    return;
  }

  log("LIST", `Found ${nfts.length} NFT(s). Evaluating listings...`);

  for (const nft of nfts) {
    const collection = nft.collection || "unknown";
    const tokenId = nft.identifier || nft.token_id || "unknown";
    const contractAddress = nft.contract;
    const name = nft.name || `${collection} #${tokenId}`;

    const floor = await getFloor(collection);
    const listPrice = floor && floor > 0 ? floor * LIST_PRICE_MULTIPLIER : null;

    if (!listPrice || !contractAddress || tokenId === "unknown") {
      log("SKIP", `Cannot list ${name}: missing floor/contract/tokenId`);
      continue;
    }

    // ---------- SIMULATION MODE ----------
    if (DRY_RUN || !wallet || !sdk) {
      log("SIMULATION", `Would LIST: ${name}`);
      log("SIMULATION", `Collection : ${collection}`);
      log("SIMULATION", `Token ID   : ${tokenId}`);
      log("SIMULATION", `Contract   : ${contractAddress}`);
      log("SIMULATION", `Floor      : ${floor!.toFixed(4)} ETH`);
      log("SIMULATION", `List price : ${listPrice.toFixed(4)} ETH (${LIST_PRICE_MULTIPLIER}x floor)`);
      log("SIMULATION", `----------------------------------------`);
      continue;
    }

    // ---------- LIVE MODE ----------
    try {
      log("LIVE", `Creating real listing for ${name} at ${listPrice.toFixed(4)} ETH...`);

      const expirationTime = Math.floor(Date.now() / 1000) + LISTING_EXPIRATION_DAYS * 24 * 60 * 60;

      const listing = await sdk.createListing({
        asset: {
          tokenAddress: contractAddress,
          tokenId: tokenId.toString(),
        },
        accountAddress: WALLET_ADDRESS,
        amount: listPrice,          // in ETH (decimal)
        expirationTime,
      });

      log("SUCCESS", `🎉 LIVE LISTED! ${name}`);
      log("SUCCESS", `Order Hash : ${listing.orderHash || listing.hash || "see response"}`);
      log("SUCCESS", `Price      : ${listPrice.toFixed(4)} ETH`);
      log("SUCCESS", `Expires    : ${LISTING_EXPIRATION_DAYS} days`);
    } catch (err: any) {
      log("ERROR", `Failed to list ${name}: ${err.message}`);
      if (err.response?.data) {
        log("ERROR", "API details:", JSON.stringify(err.response.data, null, 2));
      }
    }
  }
}

// ====================== BID SCANNER (kept mostly as-is) ======================
// ... (you can keep your existing scanAndEvaluateBids + handleBid functions)
// I left them out here for brevity — paste your existing ones back in.
// Just make sure DRY_RUN still protects the accept-offer path.

// ====================== SERVER ======================
app.get("/health", (_req, res) => {
  res.json({
    status: "Centaur Agent Claw v3.1 (SDK)",
    dryRun: DRY_RUN,
    wallet: WALLET_ADDRESS || null,
    walletLoaded: !!wallet,
    sdkReady: !!sdk,
    floorCacheSize: floorCache.size,
  });
});

app.get("/list", async (_req, res) => {
  await listOwnedNFTs();
  res.send("Listing check completed – check logs");
});

app.get("/scan", async (_req, res) => {
  // await scanAndEvaluateBids();
  res.send("Manual scan completed – check logs");
});

app.listen(PORT, () => {
  console.log("-------------------------------------------------------------");
  console.log("  CENTAUR AGENT CLAW v3.1 — OpenSea SDK Edition");
  console.log(`  DRY_RUN          : ${DRY_RUN}  ${DRY_RUN ? "(SAFE)" : "⚠️  LIVE MODE"}`);
  console.log(`  Wallet           : ${WALLET_ADDRESS || "not set"}`);
  console.log(`  Wallet + SDK     : ${wallet && sdk ? "READY" : "DISABLED"}`);
  console.log(`  List multiplier  : ${LIST_PRICE_MULTIPLIER}x floor`);
  console.log("-------------------------------------------------------------");

  // Start loops
  listOwnedNFTs();
  setInterval(listOwnedNFTs, 5 * 60 * 1000); // every 5 min
});
