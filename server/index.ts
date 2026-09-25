import express from "express";
import axios from "axios";
import { ethers } from "ethers";

const app = express();
const PORT = process.env.PORT || 10000;

// ====================== CONFIG ======================
const WALLET_ADDRESS = (process.env.WALLET_ADDRESS || "").toLowerCase();
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || "";
const DRY_RUN = process.env.DRY_RUN !== "false"; 
const MIN_BID_ETH = parseFloat(process.env.MIN_BID_ETH || "0.005");
const OUTLIER_MULTIPLIER = parseFloat(process.env.OUTLIER_MULTIPLIER || "3.0");
const EXTREME_OUTLIER_MULTIPLIER = parseFloat(process.env.EXTREME_OUTLIER_MULTIPLIER || "50");
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || "180000"); // 3 min
const OPENSEA_BASE = "https://opensea.io";
const RPC_URL = process.env.RPC_URL || "https://llamarpc.com";

// ====================== WALLET ======================
let wallet: ethers.Wallet | null = null;

if (PRIVATE_KEY) {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    console.log(`✅ Wallet loaded and ready for live signings: ${wallet.address}`);
  } catch (err: any) {
    console.error("❌ Failed to load wallet:", err.message);
  }
} else {
  console.warn("⚠️ PRIVATE_KEY not set – live signing is physically unavailable");
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
    "content-type": "application/json",
    "User-Agent": "Centaur-Agent-Claw/3.0",
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

// ====================== DYNAMIC TRACKING ENGINE MATRICES ======================
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

// ====================== AUTONOMOUS LISTING EXECUTION ======================
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

  log("LIST", `Found ${nfts.length} NFT(s). Starting execution parameters review...`);

  for (const nft of nfts) {
    const collection = nft.collection || "unknown";
    const tokenId = nft.identifier || nft.token_id || "unknown";
    const contractAddress = nft.contract;
    const chainName = nft.chain || "ethereum";
    const name = nft.name || `${collection} #${tokenId}`;

    const floor = await getFloor(collection);
    const listPrice = floor && floor > 0 ? floor * 1.15 : null;

    if (DRY_RUN || !wallet) {
      log("SIMULATION", `Would LIST: ${name}`);
      log("SIMULATION", `Collection : ${collection} | Token ID: ${tokenId}`);
      log("SIMULATION", `Floor      : ${floor ? floor.toFixed(4) + " ETH" : "unknown"}`);
      log("SIMULATION", `List price : ${listPrice ? listPrice.toFixed(4) + " ETH" : "unknown"}`);
      log("SIMULATION", `----------------------------------------`);
      continue;
    }

    if (!listPrice || !contractAddress) {
      log("SKIP", `Cannot process listing for ${name}: missing price or asset contract parameters.`);
      continue;
    }

    // ⚡ REAL CRYPTOGRAPHIC SEAPORT SIGNING PROTOCOL
    try {
      log("LIVE", `Requesting cryptographic listing parameters from OpenSea API for: ${name}`);
      const orderParamsResponse = await axios.post(
        `${OPENSEA_BASE}/orders/${chainName}/seaport/listings`,
        {
          asset: { token_address: contractAddress, token_id: tokenId },
          price: { value: ethers.parseEther(listPrice.toFixed(6)).toString(), currency: "ETH" },
          expiration_time: Math.floor(Date.now() / 1000) + 86400 
        },
        { headers: await getHeaders(), timeout: 10000 }
      );

      const listingPayload = orderParamsResponse.data;
      if (!listingPayload || !listingPayload.order_parameters) {
        throw new Error("The OpenSea parameters framework returned an invalid signature template.");
      }

      log("LIVE", `Generating EIP-712 secure typed data signature array...`);
      const domain = listingPayload.local_domain_data;
      const types = listingPayload.local_types_data;
      const value = listingPayload.order_parameters;

      const signature = await wallet.signTypedData(domain, types, value);

      log("LIVE", `Broadcasting signed listing payload back to OpenSea's active live order book...`);
      const broadcastResponse = await axios.post(
        `${OPENSEA_BASE}/orders/${chainName}/seaport/listings/broadcast`,
        { order_parameters: value, signature: signature },
        { headers: await getHeaders(), timeout: 10000 }
      );

      if (broadcastResponse.status === 200 || broadcastResponse.status === 201) {
        log("SUCCESS", `🎉 LIVE EXECUTED! Asset [${name}] is now listed on the market at ${listPrice.toFixed(4)} ETH!`);
      }
    } catch (err: any) {
      log("ERROR", `Live listing broadcast failed for asset ${name}: ${err.response?.data?.detail || err.message}`);
    }
  }
}

// ====================== CORE BID SCANNERS ======================
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
        chain: offer?.item?.chain || offer?.chain || "ethereum",
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

if (DRY_RUN || !wallet) {
  log("SIMULATION", `Would ACCEPT this offer`);
  log("SIMULATION", `Order Hash : ${bid.orderHash || "unknown"}`);
  log("SIMULATION", `Token ID   : ${bid.tokenId || "n/a"} | Chain: ${bid.chain || "n/a"}`);
  log("SIMULATION", `Collection : ${bid.collectionSlug} | ${bid.priceEth.toFixed(4)} ETH | ${multText}`);
  return;
}

// ⚡ REAL LIVE ON-CHAIN SEAPORT OFFER FULFILLMENT SETTLEMENT
try {
  log("LIVE", `Initializing autonomous transaction parameter verification via OpenSea v2 API for offer hash: ${bid.orderHash}`);
  
  const fulfillmentResponse = await axios.post(
    `${OPENSEA_BASE}/offers/fulfillment_data`,
    {
      offer: { hash: bid.orderHash },
      fulfiller: { address: WALLET_ADDRESS }
    },
    { headers: await getHeaders(), timeout: 12000 }
  );

  const fulfillmentData = fulfillmentResponse.data?.fulfillment_data;
  if (!fulfillmentData || !fulfillmentData.transaction) {
    throw new Error("OpenSea API did not return standard Seaport transaction parameters.");
  }

  log("LIVE", `Broadcasting signed contract fulfillment payload directly to Seaport smart contract...`);
  const tx = await wallet.sendTransaction({
    to: fulfillmentData.transaction.to,
    data: fulfillmentData.transaction.data,
    value: fulfillmentData.transaction.value,
    gasLimit: 280000
  });

  log("SUCCESS", `🎉 Autonomous market acceptance confirmed! Transaction Hash: ${tx.hash}`);
} catch (err: any) {
  log("ERROR", `Core contract execution failed for order hash ${bid.orderHash}: ${err.message}`);
}
}

// ====================== SERVER MANAGEMENT PATHWAYS ======================
app.get("/health", (_req, res) => {
res.json({
  status: "Centaur Agent Claw v3.0 Real-Signer Core Active",
  dryRun: DRY_RUN,
  wallet: WALLET_ADDRESS || null,
  walletLoaded: !!wallet,
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
console.log("-------------------------------------------------------------");
console.log("  CENTAUR AGENT CLAW v3.0 — HIGH-FREQUENCY SNIPER OPERATIONAL");
console.log(`  DRY_RUN PROTECT CONFIG LAYER : ${DRY_RUN}`);
console.log(`  Target Wallet Core Asset Node: ${WALLET_ADDRESS || "not set"}`);
console.log(`  Cryptographic Signature Engine: ${wallet ? "ARMED & LIVE" : "DISABLED"}`);
console.log("-------------------------------------------------------------");

scanAndEvaluateBids();
setInterval(scanAndEvaluateBids, SCAN_INTERVAL_MS);

listOwnedNFTs();
setInterval(listOwnedNFTs, 5 * 60 * 1000);
});
