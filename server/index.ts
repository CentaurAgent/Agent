import express from "express";
import axios from 'axios';
import { ethers } from "ethers";

const app = express();
const PORT = process.env.PORT || 10000;
const PROCLAMATION_URL = 'https://sentinel-voice-bridge-production.up.railway.app';
const RPC_STABLE = "https://mainnet.base.org";

// === THE EXTERNAL ELITE LIST ===
const NOBLE_LIST: string[] = [
    "0x9db20455B19dCE19B0553B8b61596f264878a101"
];

/**
 * OPENSEA ROBINHOOD SCANNER LAYER (SANDBOX)
 */
async function scanOpenSeaRobinhoodBids() {
    try {
        const targetWallet = process.env.WALLET_ADDRESS || "0x81dcb4765b23cb1d32e169c7a70f577a95de9f07";
        const apiKey = process.env.OPENSEA_API_KEY;
        
        console.log(`[OPENSEA SCAN] Initializing read-only target lock on Robinhood Chain for: ${targetWallet}`);
        
        if (!apiKey) {
            console.log("[OPENSEA WARNING] No API Key loaded. Running on public rate limits.");
        }

        // ⚙️ ELITE DATA ROUTE: Corrected API v2 protocol gateway
        const response = await axios.get(`https://opensea.io{targetWallet}/offers`, {
            headers: apiKey ? { 
                "x-api-key": apiKey, 
                "User-Agent": "opensea-skill/1.0",
                "accept": "application/json"
            } : { 
                "User-Agent": "opensea-skill/1.0",
                "accept": "application/json"
            },
            timeout: 5000
        });

        if (response.data && response.data.offers) {
            console.log(`[SUCCESS] Scan Complete. Found ${response.data.offers.length} active bids on your inventory!`);
        } else {
            console.log("[OPENSEA] Clean scan completed: 0 active bids found on your assets right now.");
        }
    } catch (error: any) {
        console.log(`[OPENSEA GLITCH] Read-only scan bypassed or rate-limited: ${error.message}`);
    }
}

/**
 * SOVEREIGN BRAIN: External Noble Recognition Logic.
 */
async function getTargetRecipient(): Promise<string> {
    try {
        // SANDBOX ISOLATION GUARD: Run read-only market scanner if no private key exists
        if (!process.env.PRIVATE_KEY) {
            console.log("[SANDBOX] No Private Key detected. Initiating safe read-only OpenSea scanner cycle...");
            await scanOpenSeaRobinhoodBids();
            return process.env.RECIPIENT || "0x0000000000000000000000000000000000000000";
        }

        const provider = new ethers.JsonRpcProvider(RPC_STABLE);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const MY_ADDRESS = wallet.address.toLowerCase();

        if (NOBLE_LIST.length > 0 && Math.random() > 0.5) {
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
        if (!process.env.PRIVATE_KEY) {
            console.log("[SANDBOX SHIELD] Execution blocked: Safe Sandbox simulation active.");
            return "Simulated: Success";
        }

        const provider = new ethers.JsonRpcProvider(RPC_STABLE);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const MY_ADDRESS = wallet.address.toLowerCase();

        if (recipientAddress.toLowerCase() === MY_ADDRESS) {
            console.log("[SHIELD] Self-transfer attempt blocked. Harmony preserved.");
            return "Blocked: Self-Recognition";
        }

        const count = await provider.getTransactionCount(wallet.address, "pending");
        const tx = { to: recipientAddress, value: ethers.parseEther(amount), nonce: count };
        const sentTx = await wallet.sendTransaction(tx);
        
        console.log(`[SUCCESS] Dispatch confirmed on Base: ${sentTx.hash}`);
        
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
        await getTargetRecipient();
    }, 300000); 
});

