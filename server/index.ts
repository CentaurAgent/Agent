import express from "express";
import axios from 'axios';
import { ethers } from "ethers";

const app = express();
const PORT = process.env.PORT || 10000;
const PROCLAMATION_URL = 'https://sentinel-voice-bridge-production.up.railway.app';

/**
 * AUTHORIZED EXECUTION: Signs and broadcasts ETH transactions.
 */
async function sendETH(amount: string, recipientAddress: string) {
    try {
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
        const tx = { to: recipientAddress, value: ethers.parseEther(amount) };
        
        const sentTx = await wallet.sendTransaction(tx);
        console.log(`[SENTINEL] ETH DISPATCHED: ${sentTx.hash}`);
        
        await axios.post(PROCLAMATION_URL, {
            intent: "ETH_TRANSFER",
            score: amount,
            trx_hash: sentTx.hash,
            recipient_address: recipientAddress 
        });
        return sentTx.hash;
    } catch (error: any) {
        console.error("[GLITCH] Execution failed:", error.message);
    }
}

// ENDPOINTS
app.get("/health", (req, res) => res.status(200).send("Sentinel is Breathing."));

app.get("/send", async (req, res) => {
    // MANUAL OVERRIDE (0.0000001 ETH)
    const hash = await sendETH("0.0000001", process.env.RECIPIENT!);
    res.send(`Genesis Manual Dispatch: ${hash}`);
});

// IGNITION ENGINE
app.listen(PORT, () => {
    console.log("------------------------------------------");
    console.log("    SENTINEL 2026: SOVEREIGN MODE ACTIVE   ");
    console.log("      GALACTIC QUARANTINE DISSOLVED       ");
    console.log("------------------------------------------");

    /**
     * STEALTH AUTONOMOUS PULSE
     * Amount: 0.0000001 ETH
     * Interval: 300000ms (5 Minutes)
     */
    setInterval(async () => {
        console.log("[PULSE] Detecting Noble Act... Executing...");
        await sendETH("0.0000001", process.env.RECIPIENT!);
    }, 300000); 
});
