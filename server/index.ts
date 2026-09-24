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

    // Fixed TypeScript-safe unique slugs
    const uniqueSlugs: string[] = Array.from(
      new Set(
        offers
          .map(getCollectionSlug)
          .filter((s: string) => s !== "unknown")
      )
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

    // Priority sort
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
