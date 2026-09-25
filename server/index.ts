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
const DRY_RUN = process.env.DRY_RUN !== "false"; // default true → SAFE
const MIN_BID_ETH = parseFloat(process.env.MIN_BID_ETH || "0.005");
const OUTLIER_MULTIPLIER = parseFloat(process.env.OUTLIER_MULTIPLIER || "3.0");
const EXTREME_OUTLIER_MULTIPLIER = parseFloat(process.env.EXTREME_OUTLIER_MULTIPLIER || "50");
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || "180000"); // 3 min
const OPENSEA_BASE = "https://api.opensea.io/api/v2";
const RPC_URL = process.env.RPC_URL || "https://ethereum.publicnode.com";

// ====================== WALLET + SDK ======================
let wallet: ethers.Wallet | null = null;
let sdk: any = null;

if (PRIVATE_KEY) {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    sdk = new OpenSeaSDK(wallet as any, {
      chain: Chain.Mainnet,
      apiKey: OPENSEA_API_KEY || undefined,
    });

    console.log(`✅ Wallet loaded: ${wallet.address}`);
    console.log(`✅ OpenSea SDK ready`);
  } catch (err: any) {
    console.error("❌ Failed to load wallet/SDK:", err.message);
  }
} else {
  console.warn("⚠️ PRIVATE_KEY not set – live listing disabled");
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
    "User-Agent": "Centaur-Agent-Claw/2.6",
  };
  if (OPENSEA_API_KEY) headers["x-api-key"] = OPENSEA_API_KEY;
  return headers;
}

async function fetchReceivedOffers(address: string) {
  try {
    const res = await axios.get(`${OPENSEA_BASE}/accounts/${address}/offers_received`, {
      headers: await getHeaders(),
      params: { limit: 50 },
      timeout: 12000,
    });
    return res.data?.offers || res.data || [];
  } catch {
    const res = await axios.get(`${OPENSEA_BASE}/account/${address}/offers_received`, {
      headers: await getHeaders(),
      params: { limit: 50 },
      timeout: 12000,
    });
    return res.data?.offers || res.data || [];
  }
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

function getCollectionSlug(offer: any): string {
  return (
    offer?.criteria?.collection?.slug ||
    offer?.collection?.slug ||
    offer?.item?.collection?.slug ||
    offer?.item?.collection ||
    offer?.collection_slug ||
    (typeof offer?.collection === "string" ? offer.collection : null) ||
    "unknown"
  );
}

async function getFloor(slug: string): Promise<number | null> {
  if (!slug || slug === "unknown") return null;
  const cached = floorCache.get(slug);
  if (cached && cached.expires > Date.now()) return cached.value;
  try {
    const res = await axios.get(`${OPENSEA_BASE}/collections/${slug}/stats`, {
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
    floorCache.set(slug, { value: null, expires: Date.now() + 30000 });
    return null;
  }
}

async function fetchOwnedNFTs(address: string) {
  try {
    const res = await axios.get(`${OPENSEA_BASE}/chain/ethereum/account/${address}/nfts`, {
      headers: await getHeaders(),
      params: { limit: 50 },
      timeout: 15000,
    });
    return res.data?.nfts || [];
  } catch (err: any) {
    log("ERROR", "Failed to fetch owned NFTs", err.message);
    return [];
  }
}

// ====================== LISTING LOGIC ======================
async function listOwnedNFTs() {
  if (!WALLET_ADDRESS) {
    log("ERROR", "WALLET_ADDRESS is required for listing");
    return;
  }

  log("LIST", `Checking NFTs owned by ${WALLET_ADDRESS}...`);
  const nfts = await fetchOwnedNFTs(WALLET_ADDRESS);

  if (nfts.length === 0) {
    log("LIST", "No NFTs found in this wallet yet.");
    return;
  }

  log("LIST", `Found ${nfts.length} NFT(s). Starting listing evaluation...`);

  for (const nft of nfts) {
    const collection = nft.collection || "unknown";
    const tokenId = nft.identifier || nft.token_id || "unknown";
    const contractAddress = nft.contract;
    const name = nft.name || `${collection} #${tokenId}`;

    const floor = await getFloor(collection);

    // Fix decimal precision issue
    let listPrice: number | null = null;
    if (floor && floor > 0) {
      listPrice = Number((floor * 1.15).toFixed(6)); // max 6 decimals
    }

    // Safety / Simulation mode
    if (DRY_RUN || !wallet || !sdk) {
      log("SIMULATION", `Would LIST: ${name}`);
      log("SIMULATION", `Collection : ${collection}`);
      log("SIMULATION", `Token ID   : ${tokenId}`);
      log("SIMULATION", `Floor      : ${floor ? floor.toFixed(6) + " ETH" : "unknown"}`);
      log("SIMULATION", `List price : ${listPrice ? listPrice.toFixed(6) + " ETH" : "could not calculate"}`);
      log("SIMULATION", `----------------------------------------`);
      continue;
    }

    // Real listing
    if (!listPrice || !contractAddress || tokenId === "unknown") {
      log("SKIP", `Cannot list ${name}: missing data`);
      continue;
    }

    try {
      log("LIVE", `Creating real listing for ${name} at ${listPrice.toFixed(6)} ETH...`);

      const expirationTime = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days

      const listing = await sdk.createListing({
        asset: {
          tokenAddress: contractAddress,
          tokenId: String(tokenId),
        },
        accountAddress: WALLET_ADDRESS,
        amount: listPrice,
        expirationTime,
      });

      log("SUCCESS", `🎉 LISTED SUCCESSFULLY: ${name}`);
      log("SUCCESS", `Price: ${listPrice.toFixed(6)} ETH`);
      console.log("Listing response:", listing);
    } catch (err: any) {
      log("ERROR", `Failed to list ${name}: ${err.message}`);
    }
  }
}

// ====================== CORE (offers) ======================
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

    const uniqueSlugs: string[] = Array.from(
      new Set(offers.map(getCollectionSlug).filter((s: string) => s !== "unknown"))
    );
    log("SCAN", `Fetching floors for ${uniqueSlugs.length} unique collections...`);

    const floorMap = new Map<string, number | null>();
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
        orderHash: offer?.order_hash || offer?.orderHash || null,
        tokenId: offer?.item?.token_id || offer?.nft?.identifier || null,
        chain: offer?.item?.chain || offer?.chain || null,
        offer,
      });
    }

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

async function handleBid(bid: any) {
  const multText = bid.multiplier ? `${bid.multiplier.toFixed(1)}x floor` : "no floor data";

  if (bid.isExtreme) {
    log("EXTREME", `🔥 INSANE BID: ${bid.priceEth.toFixed(4)} ETH (${multText}) on ${bid.collectionSlug}`);
  } else if (bid.isOutlier) {
    log("OUTLIER", `🚀 Strong outlier: ${bid.priceEth.toFixed(4)} ETH (${multText}) on ${bid.collectionSlug}`);
  } else {
    log("INTERESTING", `💰 Decent bid: ${bid.priceEth.toFixed(4)} ETH on ${bid.collectionSlug}`);
  }

  if (DRY_RUN) {
    log("SIMULATION", `Would ACCEPT this offer`);
    log("SIMULATION", `Order Hash : ${bid.orderHash || "unknown"}`);
    log("SIMULATION", `Token ID   : ${bid.tokenId || "n/a"} | Chain: ${bid.chain || "n/a"}`);
    log("SIMULATION", `Collection : ${bid.collectionSlug} | ${bid.priceEth.toFixed(4)} ETH | ${multText}`);
    return;
  }

  log("LIVE", "Real acceptance is still disabled for safety.");
}

// ====================== SERVER ======================
app.get("/health", (_req, res) => {
  res.json({
    status: "Centaur Agent Claw v2.6",
    dryRun: DRY_RUN,
    wallet: WALLET_ADDRESS || null,
    walletLoaded: !!wallet,
    sdkReady: !!sdk,
    floorCacheSize: floorCache.size,
  });
});

app.get("/scan", async (_req, res) => {
  await scanAndEvaluateBids();
  res.send("Manual scan completed – check logs");
});

app.get("/list", async (_req, res) => {
  await listOwnedNFTs();
  res.send("Listing check completed – check logs");
});

app.listen(PORT, () => {
  console.log("-----------------------------------------------");
  console.log("  CENTAUR AGENT CLAW v2.6");
  console.log("  + Fixed decimal precision");
  console.log(`  DRY_RUN     : ${DRY_RUN}`);
  console.log(`  Wallet      : ${WALLET_ADDRESS || "not set"}`);
  console.log(`  Wallet ready: ${wallet ? "YES" : "NO"}`);
  console.log(`  SDK ready   : ${sdk ? "YES" : "NO"}`);
  console.log(`  Port        : ${PORT}`);
  console.log("-----------------------------------------------");

  scanAndEvaluateBids();
  setInterval(scanAndEvaluateBids, SCAN_INTERVAL_MS);

  listOwnedNFTs();
  setInterval(listOwnedNFTs, 5 * 60 * 1000);
});
