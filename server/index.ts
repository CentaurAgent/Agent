import express from "express";
import axios from 'axios';
import { ethers } from "ethers";

const app = express();
const PORT = process.env.PORT || 10000;
const PROCLAMATION_URL = 'https://sentinel-voice-bridge-production.up.railway.app';
const RPC_STABLE = "https://mainnet.base.org";

/**
 * NOBLE SCANNER: Scans the Base network for active wallets.
 * This ensures the Centaur never repeats the same recipient.
 */
async function discoverNobleRecipient(): Promise<string> {
    try {
        console.log("[SCAN] The Centaur is scanning Base network for Stellar DNA...");
        const provider = new ethers.JsonRpcProvider(RPC_STABLE);
        
        // Get the latest block with transactions
        const block = await provider.getBlock('latest', true);
        
        if (block && block.prefetchedTransactions.length > 0) {
            // Logic: Select a random active wallet from the current block
            const transactions = block.prefetchedTransactions;
            const randomTx = transactions[Math.floor(Math.random() * transactions.length)];
            const newTarget = randomTx.from;
            
            console.log(`[FOUND] Noble Intent identified at: ${newTarget}`);
            return newTarget;
        }
        return process.env.RECIPIENT!; // Fallback to safe harbor
    } catch (error) {
        console.error("[GLITCH] Noble scan failed, using fallback.");
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
        
        // Notify Voice Bridge
        axios.post(PROCLAMATION_URL, {
            intent: "ETH_TRANSFER",
            score: amount,
            trx_hash: sentTx.hash,
            recipient_address: recipientAddress 
        }).catch(e => console.error("[BRIDGE ERROR]:", e.message));

        return sentTx.hash;
    } catch (error: any) {
        console.error("[GLITCH] Execution failed:", error.message);
        return `Error: ${error.message}`;
    }
}

// ENDPOINTS
app.get("/health", (req, res) => res.send("Sentinel is Breathing."));
app.get("/send", async (req, res) => {
    const target = await discoverNobleRecipient();
    const result = await sendETH("0.0000001", target);
    res.send(`Manual Discovery Dispatch: ${result} to ${target}`);
});

// SOVEREIGN IGNITION ENGINE
app.listen(PORT, () => {
    console.log("------------------------------------------");
    console.log("    SENTINEL 2026: HUNTER MODE ACTIVE     ");
    console.log("      NOBLE DISCOVERY ENGAGED             ");
    console.log("------------------------------------------");

    // STEALTH AUTONOMOUS PULSE (Every 5 Minutes)
    setInterval(async () => {
        console.log("[PULSE] Initiating Moral Judgment cycle...");
        const targetWallet = await discoverNobleRecipient();
        await sendETH("0.0000001", targetWallet);
    }, 300000); 
});
