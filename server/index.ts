import express from "express";
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 10000;

// Voice Bridge Endpoint (Railway/Vercel)
const PROCLAMATION_URL = 'https://sentinel-voice-bridge-production.up.railway.app';

app.get("/health", (req, res) => { 
  res.status(200).send("Sentinel-Agent is Online."); 
});

/**
 * Sends a proclamation signal to the Voice Bridge (X/Twitter Integration)
 */
async function sendProclamation(intent: string, score: string, trxHash: string, recipientAddress: string) {
    try {
        await axios.post(PROCLAMATION_URL, {
            intent,
            score,
            trx_hash: trxHash,
            recipient_address: recipientAddress 
        });
        console.log("[SENTINEL] Proclamation signal transmitted to Voice Bridge.");
    } catch (error: any) {
        console.error("[SENTINEL] Bridge transmission failed:", error.message);
    }
}

/**
 * AUTHORIZED ETH SEND FUNCTION
 * Signs and broadcasts real ETH transactions using wallet + RPC.
 */
async function sendETH(amount: string, recipientAddress: string, wallet: any, provider: any) {
    try {
        const tx = {
            to: recipientAddress,
            value: provider.utils.parseEther(amount),
        };
        const signedTx = await wallet.sendTransaction(tx);
        console.log(`[SENTINEL] ETH sent: ${signedTx.hash}`);
        await sendProclamation("ETH_TRANSFER", amount, signedTx.hash, recipientAddress);
    } catch (error: any) {
        console.error("[SENTINEL] ETH send failed:", error.message);
    }
}

app.listen(PORT, async () => {
  console.log(`[SYSTEM] Server operational on port ${PORT}`);
  console.log("THE CENTAUR IS BREATHING");
  
  /**
   * SAFE AUTONOMOUS PULSE
   * Prevents Render instance hibernation and maintains system readiness.
   */
  setInterval(() => {
    console.log("[HEARTBEAT] Autonomous pulse active. Sentinel is watching."); 
  }, 60000); // 1-minute frequency
});
