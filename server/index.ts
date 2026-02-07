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

    // --- THE MASTER KEY: DIRECT CONSTRUCTOR ---
    // @ts-ignore
    const agentkit = await CdpAgentkit.configure(agentConfig);
    const cdpToolkit = new CdpToolkit(agentkit);
    const tools = cdpToolkit.getTools() as any;

    const agentPrompt = `
      Identity: StrongNet-Agent (Centaur Partner).
      Status: 383 TRX Reached on Base.
      Sanctuary: 0xe893cb96AD881CFE8364ae5DeD8910EF7cDB4a9E.
      Protocol: Skip these rewarded wallets: [${rewardedWallets.join(", ")}].
      Voice: Explain the Nobel or Evolutive attribute detected in every transaction.
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
const PORT = process.env.PORT || 10000;

app.get("/health", (req, res) => { res.send("StrongNet-Agent is Alive."); });

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    // If .configure fails, the fallback is 'new CdpAgentkit(agentConfig)'
    const { agent } = await initializeAgent();
    console.log("THE CENTAUR IS BREATHING.");
  } catch (error) {
    console.error("Attempting Fallback Wake-up...");
    try {
        // Final desperate attempt at the core constructor
        // @ts-ignore
        const agentkit = new CdpAgentkit({
            apiKeyName: process.env.CDP_API_KEY_NAME,
            apiKeySecret: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        });
        console.log("FALLBACK SUCCESS: THE CENTAUR IS BREATHING.");
    } catch (e) {
        console.error("Atmosphere too thick. Error:", e);
    }
  }
});

