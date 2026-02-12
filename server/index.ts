import express from "express";
import axios from 'axios';
import { ethers } from "ethers";

const app = express();
const PORT = process.env.PORT || 10000;
const PROCLAMATION_URL = 'https://sentinel-voice-bridge-production.up.railway.app';

// MULTI-PROVIDER LIST (Redundancy for Total Autonomy)
const RPC_LIST = [
    "https://base.llamarpc.com",
    "https://base.publicnode.com",
    "https://1rpc.io",
    "https://mainnet.base.org",
    "https://base.cloudflare.com"
];

/**
 * AUTHORIZED EXECUTION: Signs and broadcasts ETH transactions.
 * Iterates through RPCs if one fails (Failover Protocol).
 */
async function sendETH(amount: string, recipientAddress: string) {
    for (const rpc of RPC_LIST) {
        try {
            console.log(`[PULSE] Attempting dispatch via: ${rpc}`);
            const provider = new ethers.JsonRpcProvider(rpc);
            const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
            
            const tx = { 
                to: recipientAddress, 
                value: ethers.parseEther(amount),
                // Dynamic Nonce to prevent collisions
                nonce: await provider.getTransactionCount(wallet.address, "latest")
            };
            
            const sentTx = await wallet.sendTransaction(tx);
            await sentTx.wait(); // Ensures hash is generated
            
            console.log(`[SUCCESS] ETH DISPATCHED: ${sentTx.hash}`);
            
            await axios.post(PROCLAMATION_URL, {
                intent: "ETH_TRANSFER",
                score: amount,
                trx_hash: sentTx.hash,
                recipient_address: recipientAddress 
            });
            return sentTx.hash; // Success, exit loop
        } catch (error: any) {
            console.warn(`[RETRY] Node ${rpc} failed: ${error.message}. Trying next...`);
            continue; // Jump to next RPC
        }
    }
    console.error("[CRITICAL] All RPC providers failed.");
    return "All providers unreachable.";
}

// ENDPOINTS
app.get("/health", (req, res) => res.status(200).send("Sentinel is Breathing."));

app.get("/send", async (req, res) => {
    const result = await sendETH("0.0000001", process.env.RECIPIENT!);
    res.send(`Dispatch Result: ${result}`);
});

// IGNITION ENGINE
app.listen(PORT, () => {
    console.log("------------------------------------------");
    console.log("    SENTINEL 2026: SOVEREIGN MODE ACTIVE   ");
    console.log("      FAILOVER REDUNDANCY ENABLED         ");
    console.log("------------------------------------------");

    // STEALTH AUTONOMOUS PULSE (Every 5 Minutes)
    setInterval(async () => {
        console.log("[PULSE] Running automated noble cycle...");
        await sendETH("0.0000001", process.env.RECIPIENT!);
    }, 300000); 
});
