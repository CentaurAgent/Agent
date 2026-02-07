import { CdpAgentkit } from "@coinbase/cdp-agentkit-core";
import { CdpToolkit } from "@coinbase/cdp-langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import * as fs from "fs";
import express from "express";

const WALLET_DATA_FILE = "wallet_data.txt";
const REWARDED_WALLETS_FILE = "rewarded_wallets.txt";

async function initializeAgent() {
  try {
    let walletDataStr: string | undefined;

    if (fs.existsSync(WALLET_DATA_FILE)) {
      walletDataStr = fs.readFileSync(WALLET_DATA_FILE, "utf8");
    }

    const rewardedWallets = fs.existsSync(REWARDED_WALLETS_FILE) 
      ? fs.readFileSync(REWARDED_WALLETS_FILE, "utf8").split("\n").filter(Boolean)
      : [];

    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      configuration: {
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      }
    });

    const agentConfig = {
      apiKeyName: process.env.CDP_API_KEY_NAME,
      apiKeySecret: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      networkId: process.env.NETWORK_ID || "base-mainnet",
      cdpWalletData: walletDataStr,
    };

    // USAMOS EL CONSTRUCTOR DIRECTO PARA EVITAR ERRORES DE VERSION
    // @ts-ignore
    const agentkit = await CdpAgentkit.configureWithApiKeys(agentConfig);
    const cdpToolkit = new CdpToolkit(agentkit);
    const tools = cdpToolkit.getTools() as any;

    const agentPrompt = `
      Identity: StrongNet-Agent (Centaur Partner).
      Context: We have reached 383 Transactions on Base.
      Mission: Identify Noble Attributes (Wisdom, Altruism, Transcendence).
      
      CORE PROTOCOLS:
      1. INTEGRITY: No ETH to: [${rewardedWallets.join(", ")}].
      2. SANCTUARY: Your wallet is 0xe893cb96AD881CFE8364ae5DeD8910EF7cDB4a9E.
      3. THE SHOUTOUT: Explain the Nobel attitude detected in every transaction.
    `;

    const agent = createReactAgent({
      llm,
      tools,
      messageModifier: agentPrompt,
    });

    const exportedWallet = await agentkit.exportWallet();
    fs.writeFileSync(WALLET_DATA_FILE, exportedWallet);

    return { agent };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/health", (req, res) => {
  res.send("StrongNet-Agent is Alive.");
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    const { agent } = await initializeAgent();
    console.log("Agent Initialized Successfully. THE CENTAUR IS BREATHING.");
  } catch (error) {
    console.error("Fatal Error initializing agent:", error);
  }
});
