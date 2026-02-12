import express from "express";
import axios from 'axios';
import { ethers } from "ethers";

const app = express();
const PORT = process.env.PORT || 10000;
const PROCLAMATION_URL = 'https://sentinel-voice-bridge-production.up.railway.app';
const RPC_STABLE = "https://mainnet.base.org";

// === 1. THE ELITE LIST ===
const NOBLE_LIST: string[] = [
    "0x9db20455B19dCE19B0553B8b61596f264878a101"
    // Add external noble addresses here.
];

/**
 * SOVEREIGN BRAIN: Decides the destination of the Golden Proportion.
 * Logic: 50% Elite List | 50% Live Network Hunting (Self-Exclusion Active).
 */
async function getTargetRecipient(): Promise<string> {
    try {
        const provider = new ethers.JsonRpcProvider(RPC_STABLE);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
        const MY_ADDRESS = wallet.address.toLowerCase(); // The Sentinel's Identity

        if (NOBLE_LIST.length > 0 && Math.random() > 0.5) {
            // Filter list to ensure the Sentinel doesn't select itself
            const validElite = NOBLE_LIST.filter(addr => addr.toLowerCase() !== MY_ADDRESS);
            if (validElite.length > 0) {
                const chosen = validElite[Math.floor(Math.random() * validElite.length)];
                console.log(`[JUDGMENT] Elite DNA Selected: ${chosen}`);
                return chosen;
            }
        }

        console.log("[SCAN] The Centaur is hunting for external Stellar DNA on Base...");
        const block = await provider.getBlock('latest', true);
        
        if (block && block.prefetchedTransactions.length > 0) {
            // HUMILITY FILTER: Find noble intents from everyone EXCEPT the Sentinel
            const externalTxs = block.prefetchedTransactions.filter(tx => 
                tx.from.toLowerCase() !== MY_ADDRESS
            );

            if (externalTxs.length > 0) {
                const randomTx = externalTxs[Math.floor(Math.random() * externalTxs.length)];
                console.log(`[FOUND] Noble External Intent identified: ${randomTx.from}`);
                return randomTx.from;
            }
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
        const MY_ADDRESS = wallet.address.toLowerCase();

        // Safety Shield: Block accidental self-transfers
        if (recipientAddress.toLowerCase() === MY_ADDRESS) {
            console.log("[SHIELD] Self-transfer attempt blocked. Aborting.");
            return "Blocked: Self-recognition";
        }

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
    console.log("      HUMILITY & HARMONY ACTIVATED        ");
    console.log("------------------------------------------");

    setInterval(async () => {
        console.log("[PULSE] Initiating light distribution cycle...");
        const target = await getTargetRecipient();
        if (target) await sendETH("0.0000001", target);
    }, 300000); 
});
;
