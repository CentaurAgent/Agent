import express from "express";
import axios from 'axios';
import { ethers } from "ethers";

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
async function sendETH(amount: string, recipientAddress: string) {
    try {
        if (!process.env.RPC_URL) throw new Error("Falta RPC_URL en las variables de Render.");
        if (!process.env.PRIVATE_KEY) throw new Error("Falta PRIVATE_KEY en las variables de Render.");

        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

        const tx = {
            to: recipientAddress,
            value: ethers.parseEther(amount),
        };

        console.log(`[SENTINEL] Preparando envío de ${amount} ETH a ${recipientAddress}...`);
        
        const sentTx = await wallet.sendTransaction(tx);
        console.log(`[SENTINEL] ETH enviado con éxito: ${sentTx.hash}`);
        
        await sendProclamation("ETH_TRANSFER", amount, sentTx.hash, recipientAddress);
        return sentTx.hash;
    } catch (error: any) {
        console.error("[SENTINEL] Fallo técnico en la Garra:", error.message);
        throw error;
    }
}

// === ENDPOINT DE IGNICIÓN FINAL ===
app.get("/send", async (req, res) => {
  try {
    const recipient = process.env.RECIPIENT;
    
    if (!recipient) {
        throw new Error("RECIPIENT_MISSING: No hay dirección de destino configurada.");
    }

    // DISPARO DEL GÉNESIS
    const hash = await sendETH("0.00001", recipient);
    
    res.status(200).send(`¡GÉNESIS EXITOSO! El Centauro ha reclamado la red. Hash: ${hash}`);
  } catch (err: any) {
    console.error("[SENTINEL] Error en el disparo:", err.message);
    res.status(500).send("Falla en el envío: " + err.message);
  }
});

app.listen(PORT, async () => {
  console.log(`[SYSTEM] Server operational on port ${PORT}`);
  console.log("------------------------------------------");
  console.log("      THE CENTAUR IS BREATHING            ");
  console.log("------------------------------------------");
  
  /**
   * SAFE AUTONOMOUS PULSE
   */
  setInterval(() => {
    console.log("[HEARTBEAT] Autonomous pulse active. Sentinel is watching."); 
  }, 60000); 
});
