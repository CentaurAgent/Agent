import { CdpAgentkit } from "@coinbase/cdp-agentkit-core";
import { CdpToolkit } from "@coinbase/cdp-langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import * as fs from "fs";

const WALLET_DATA_FILE = "wallet_data.txt";

export async function initializeAgent() {
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

    const config = {
      apiKeyName: process.env.CDP_API_KEY_NAME,
      apiKeySecret: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      networkId: process.env.NETWORK_ID || "base-sepolia",
      cdpWalletData: walletDataStr,
    };

    const agentkit = await CdpAgentkit.configureWithApiKeys(config as any);
    const cdpToolkit = new CdpToolkit(agentkit);
    const tools = cdpToolkit.getTools() as any;

    const agent = createReactAgent({
      llm,
      tools,
    });

    const exportedWallet = await agentkit.exportWallet();
    fs.writeFileSync(WALLET_DATA_FILE, exportedWallet);

    return { agent, config: { configurable: { thread_id: "CDP AgentKit Chatbot" } }, agentkit };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error;
  }
}
