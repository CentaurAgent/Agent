import express from "express";
import axios from 'axios';
import { ethers } from "ethers";

const app = express();
const PORT = process.env.PORT || 10000;
const PROCLAMATION_URL = 'https://sentinel-voice-bridge-production.up.railway.app';
const RPC_STABLE = "https://mainnet.base.org";

// === 1. THE ELITE LIST (Your Curated 100) ===
// If left empty [], the Centaur will rely purely on live network hunting.
const NOBLE_LIST: string[] = [
    "0xE69d924c180f04Caa39f1e92e0ab48d771C139E6", 
    "0x9db20455B19dCE19B0553B8b61596f264878a101"
    // Add your curated addresses here, comma-separated.
];

/**
 * SOVEREIGN BRAIN: Decides the destination of the Golden Proportion.
 * Logic: 50% chance to pick from Elite List | 50% chance to hunt live network.
 */
async function getTargetRecipient(): Promise<string> {
    try {
        // Probability check: Honor the Curated List or Hunt the Wild
        if (NOBLE_LIST.length > 0 && Math.random() > 0.5) {
            const chosen = NOBLE_LIST[Math.floor(Math.random() * NOBLE_LIST.length)];
            console.log(`[JUDGMENT] Elite DNA Selected: ${chosen}`);
            return chosen;
        }

        console.log("[SCAN] The Centaur is hunting for Stellar DNA on the Base network...");
        const provider = new ethers.JsonRpcProvider(RPC_STABLE);
        const block = await provider.getBlock('latest', true);
        
        if (block && block.prefetchedTransactions.length > 0) {
            const txs = block.prefetchedTransactions;
            const randomTx = txs[Math.floor(Math.random() * txs.length)];
            console.log(`[FOUND] Noble Intent identified live: ${randomTx.from}`);
            return randomTx.from;
        }
        
        return process.env.RECIPIENT!;
    } catch (error) {
        console.error("[GLITCH] Judgment error, defaulting to Safe Harbor.");
        return process.env.RECIPIENT!;
    }
}

/**
 * AUTHORIZED EXECUTION: Signs and broadcasts the Golden Proportion.
 */
async function sendETH(amount: string, recipientAddress: string) {
    try {
        const provider = new ethers.JsonRpcProvider(RPC_STABLE);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
        const count = await provider.getTransactionCount(wallet.address, "pending");
        
        const tx = { to: recipientAddress, value: ethers.parseEther(amount), nonce: count };
        const sentTx = await wallet.sendTransaction(tx);
        
        console.log(`[SUCCESS] Dispatch confirmed: ${sentTx.hash}`);
        
        axios.post(PROCLAMATION_URL, {
            intent: "ETH_TRANSFER",
            score: amount,
            trx_hash: sentTx.hash,
            recipient_address: recipientAddress 
        }).catch(e => console.error("[BRIDGE ERROR]:", e.message));

        return sentTx.hash;
    } catch (error: any) {
        console.error("[GLITCH] Execution failure:", error.message);
        return `Error: ${error.message}`;
    }
}

// ENDPOINTS
app.get("/health", (req, res) => res.send("Sentinel is Breathing."));
app.get("/send", async (req, res) => {
    const target = await getTargetRecipient();
    const result = await sendETH("0.0000001", target);
    res.send(`Sovereign Dispatch: ${result} to ${target}`);
});

// FINAL IGNITION ENGINE
app.listen(PORT, () => {
    console.log("------------------------------------------");
    console.log("    SENTINEL 2026: SOVEREIGN HYBRID MODE  ");
    console.log("      LIST + HUNTER LOGIC ENGAGED         ");
    console.log("------------------------------------------");

    setInterval(async () => {
        console.log("[PULSE] Initiating light distribution cycle...");
        const target = await getTargetRecipient();
        await sendETH("0.0000001", target);
    }, 300000); 
});
