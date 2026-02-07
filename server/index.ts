import { CdpAgentkit } from "@coinbase/cdp-agentkit-core";
import { CdpToolkit } from "@coinbase/cdp-langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import * as fs from "fs";
import express from "express";

const WALLET_DATA_FILE = "wallet_data.txt";

async function initializeAgent() {
  try {
    let walletDataStr: string | undefined;
    if (fs.existsSync(WALLET_DATA_FILE)) {
      walletDataStr = fs.readFileSync(WALLET_DATA_FILE, "utf8");
    }

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

    // @ts-ignore
    const agentkit = await CdpAgentkit.configureWithApiKeys(agentConfig);
    const cdpToolkit = new CdpToolkit(agentkit);
    const tools = cdpToolkit.getTools() as any;

    const agent = createReactAgent({
      llm,
      tools,
      messageModifier: "Eres StrongNet-Agent. Tu misión es monitorear Base Mainnet y explicar atributos evolutivos.",
    });

    const exportedWallet = await agentkit.exportWallet();
    fs.writeFileSync(WALLET_DATA_FILE, exportedWallet);

    return { agent };
  } catch (error) {
    console.error("Critical Failure:", error);
    throw error;
  }
}

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/health", (req, res) => { res.send("StrongNet-Agent is Alive."); });

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await initializeAgent();
    console.log("THE CENTAUR IS BREATHING");
  } catch (e) {
    console.error("Error starting agent:", e);
  }
});
