import express from "express";
import axios from 'axios';
import { ethers } from "ethers";

const app = express();
const PORT = process.env.PORT || 10000;
const PROCLAMATION_URL = 'https://sentinel-voice-bridge-production.up.railway.app';
const RPC_STABLE = "https://mainnet.base.org";

// === THE EXTERNAL ELITE LIST ===
// Curated addresses of Light. Your own address is excluded to prevent the loop.
const NOBLE_LIST: string[] = [
    "0x9db20455B19dCE19B0553B8b61596f264878a101"
];

/**
 * SOVEREIGN BRAIN: External Noble Recognition Logic.
 */
async function getTargetRecipient(): Promise<string> {
    try {
        const provider = new ethers.JsonRpcProvider(RPC_STABLE);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
        const MY_ADDRESS = wallet.address.toLowerCase();

        // 50% Chance: Honor the Curated Elite (Excluding Self)
        if (NOBLE_LIST.length > 0 && Math.random() > 0.5) {
            const validElite = NOBLE_LIST.filter(addr => addr.toLowerCase() !== MY_ADDRESS);
            if (validElite.length > 0) {
                const chosen = validElite[Math.floor(Math.random() * validElite.length)];
                console.log(`[JUDGMENT] Elite DNA Selected: ${chosen}`);
                return chosen;
            }
        }

        // 50% Chance: Live Network Hunting for Noble DNA
        console.log("[SCAN] The Centaur is hunting for external Stellar DNA on Base...");
        const block = await provider.getBlock('latest', true);
        
        if (block && block.prefetchedTransactions.length > 0) {
            // HUMILITY FILTER: Sentinel looks past its own reflection
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

        // SAFETY SHIELD: Absolute rejection of self-selection
        if (recipientAddress.toLowerCase() === MY_ADDRESS) {
            console.log("[SHIELD] Self-transfer attempt blocked. Harmony preserved.");
            return "Blocked: Self-Recognition";
        }

        const count = await provider.getTransactionCount(wallet.address, "pending");
        const tx = { to: recipientAddress, value: ethers.parseEther(amount), nonce: count };
        const sentTx = await wallet.sendTransaction(tx);
        
        console.log(`[SUCCESS] Dispatch confirmed on Base: ${sentTx.hash}`);
        
        // PROCLAMATION: The Voice of the Sentinel
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
