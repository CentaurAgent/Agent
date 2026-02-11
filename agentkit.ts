import { CdpAgentkit } from "@coinbase/cdp-agentkit-core";
import { CdpToolkit } from "@coinbase/cdp-langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import * as fs from "fs";

const WALLET_DATA_FILE = "wallet_data.txt";

export async function initializeAgent() {
  try {
    let walletDataStr: string | undefined;

    // 1. WALLET RECOVERY (If Render wipes the disk, Sentinel recreates it using API Keys)
    if (fs.existsSync(WALLET_DATA_FILE)) {
      walletDataStr = fs.readFileSync(WALLET_DATA_FILE, "utf8");
      console.log("💾 Wallet data loaded from local file.");
    }

    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      configuration: {
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      }
    });

    // 2. SURGICAL KEY CLEANUP (Prevents Render from corrupting the private key format)
    const rawSecret = process.env.CDP_API_KEY_PRIVATE_KEY || "";
    const cleanSecret = rawSecret.replace(/\\n/g, "\n").replace(/[\\'"]/g, "").trim();

    const config = {
      apiKeyName: (process.env.CDP_API_KEY_NAME || "").trim(),
      apiKeySecret: cleanSecret,
      networkId: process.env.NETWORK_ID || "base-mainnet", 
      cdpWalletData: walletDataStr,
    };

    // SECURITY DEBUG (Verify this in your Render Logs)
    console.log(`[DEBUG] Initializing AgentKit with API Key: ${config.apiKeyName}`);
    if (!cleanSecret.includes("BEGIN RSA PRIVATE KEY")) {
        console.warn("⚠️ WARNING: Private Key format might be invalid (Missing RSA header).");
    }

    const agentkit = await CdpAgentkit.configureWithApiKeys(config as any);
    const cdpToolkit = new CdpToolkit(agentkit);
    const tools = cdpToolkit.getTools() as any;

    const agent = createReactAgent({
      llm,
      tools,
    });

    // 3. PERSISTENCE LAYER
    const exportedWallet = await agentkit.exportWallet();
    fs.writeFileSync(WALLET_DATA_FILE, exportedWallet);
    
    // Display address so you can verify funds on BaseScan
    const address = await agentkit.getWalletAddress();
    console.log(`✅ SENTINEL ACTIVE. Wallet Address: ${address}`);

    return { agent, config: { configurable: { thread_id: "CDP AgentKit Chatbot" } }, agentkit };
  } catch (error) {
    console.error("❌ Fatal Error in the Matrix (InitializeAgent):", error);
    throw error;
  }
}
