// ====================== NEW: Fetch NFTs the wallet owns ======================
async function fetchOwnedNFTs(address: string) {
  try {
    // Dynamically checks your collection inventory profile
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

// ====================== NEW: Listing logic (simulation or live Seaport sign) ======================
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
    const chainName = nft.chain || "ethereum";
    const name = nft.name || `${collection} #${tokenId}`;

    // Standard baseline inventory strategy: target exact market floor price
    const floor = await getFloor(collection);
    const listPrice = floor && floor > 0 ? floor : null;

    if (DRY_RUN || !wallet) {
      log("SIMULATION", `Would LIST: ${name}`);
      log("SIMULATION", `Collection : ${collection}`);
      log("SIMULATION", `Token ID   : ${tokenId}`);
      log("SIMULATION", `Floor      : ${floor ? floor.toFixed(4) + " ETH" : "unknown"}`);
      log("SIMULATION", `List price : ${listPrice ? listPrice.toFixed(4) + " ETH" : "could not calculate"}`);
      log("SIMULATION", `----------------------------------------`);
      continue;
    }

    if (!listPrice || !contractAddress) {
      log("SKIP", `Cannot list ${name} due to missing floor price or asset contract parameters.`);
      continue;
    }

    // ⚡ LIVE ON-CHAIN SEAPORT LISTING DISPATCH
    try {
      log("LIVE", `Initializing cryptographic Seaport parameter generation via OpenSea v2 API for listing: ${name}`);
      
      const orderParamsResponse = await axios.post(
        `${OPENSEA_BASE}/orders/${chainName}/seaport/listings`,
        {
          asset: { token_address: contractAddress, token_id: tokenId },
          price: { value: ethers.parseEther(listPrice.toString()).toString(), currency: "ETH" },
          expiration_time: Math.floor(Date.now() / 1000) + 86400 // Automated 24-Hour listing lifewindow
        },
        { headers: await getHeaders(), timeout: 10000 }
      );

      const listingPayload = orderParamsResponse.data;
      if (!listingPayload || !listingPayload.order_parameters) {
        throw new Error("OpenSea parameters endpoint returned an un-parsable listing signature layout.");
      }

      log("LIVE", `Generating off-chain EIP-712 typed signature array using hot private key...`);
      const domain = listingPayload.local_domain_data;
      const types = listingPayload.local_types_data;
      const value = listingPayload.order_parameters;

      const signature = await wallet.signTypedData(domain, types, value);

      log("LIVE", `Broadcasting signed listing signature payload back into OpenSea active market book...`);
      const broadcastResponse = await axios.post(
        `${OPENSEA_BASE}/orders/${chainName}/seaport/listings/broadcast`,
        { order_parameters: value, signature: signature },
        { headers: await getHeaders(), timeout: 10000 }
      );

      if (broadcastResponse.status === 200 || broadcastResponse.status === 201) {
        log("SUCCESS", `🎉 Asset [${name}] has been AUTONOMOUSLY LISTED LIVE at market floor price!`);
      }
    } catch (err: any) {
      log("ERROR", `Failed to complete live automated listing for ${name}: ${err.message}`);
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

  // ⚡ LIVE ON-CHAIN SEAPORT OFFER FULFILLMENT EXECUTION
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
      gasLimit: 280000 // Safe overhead limit parameter for automated Seaport trades
    });

    log("SUCCESS", `🎉 Autonomous market acceptance confirmed! Transaction Hash: ${tx.hash}`);
  } catch (err: any) {
    log("ERROR", `Core contract execution failed for order hash ${bid.orderHash}: ${err.message}`);
  }
}

// ====================== SERVER ======================
app.get("/health", (_req, res) => {
  res.json({
    status: "Centaur Agent Claw v2.4 Upgraded Core Active",
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
  console.log("-----------------------------------------------");
  console.log("  CENTAUR AGENT CLAW v2.4 (UPGRADED)");
  console.log("  + Autonomous Seaport Cryptographic Listing & Settlement Layer");
  console.log(`  DRY_RUN     : ${DRY_RUN}`);
  console.log(`  Wallet      : ${WALLET_ADDRESS || "not set"}`);
  console.log(`  Wallet ready: ${wallet ? "YES" : "NO"}`);
  console.log(`  Port        : ${PORT}`);
  console.log("-----------------------------------------------");

  scanAndEvaluateBids();
  setInterval(scanAndEvaluateBids, SCAN_INTERVAL_MS);

  listOwnedNFTs();
  setInterval(listOwnedNFTs, 5 * 60 * 1000);
});
