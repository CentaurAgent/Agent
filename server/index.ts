import { CdpAgentkit } from "@coinbase/cdp-agentkit-core";
import { CdpToolkit } from "@coinbase/cdp-langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import * as fs from "fs";
import express from "express";

const WALLET_DATA_FILE = "wallet_data.txt";

async function initializeAgent() {
  try {
    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    });

    // Forzamos la lectura de las variables de Render
    const agentConfig = {
      apiKeyName: process.env.CDP_API_KEY_NAME,
      apiKeySecret: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      networkId: process.env.NETWORK_ID || "base-mainnet",
    };

    // @ts-ignore - Usamos el constructor directo que ya vimos que Render acepta
    const agentkit = new CdpAgentkit(agentConfig);
    const cdpToolkit = new CdpToolkit(agentkit);
    const tools = cdpToolkit.getTools() as any;

    const agent = createReactAgent({
      llm,
      tools,
      messageModifier: "You are the StrongNet-Agent on Base. Identify Noble Attributes.",
    });

    return { agent };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error;
  }
}

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/health", (req, res) => res.send("Alive"));

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await initializeAgent();
    console.log("THE CENTAUR IS BREATHING.");
  } catch (error) {
    console.error("Check your Environment Variables in Render:", error.message);
  }
});

