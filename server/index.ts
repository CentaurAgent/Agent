import { CdpAgentkit } from "@coinbase/cdp-agentkit-core";
import { CdpToolkit } from "@coinbase/cdp-langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import * as fs from "fs";
import express from "express";

const WALLET_DATA_FILE = "wallet_data.txt";
const REWARDED_WALLETS_FILE = "rewarded_wallets.txt";

// --- LÓGICA DEL AGENTE (CEREBRO) ---
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

    const config = {
      apiKeyName: process.env.CDP_API_KEY_NAME,
      apiKeySecret: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      networkId: process.env.NETWORK_ID || "base-mainnet",
      cdpWalletData: walletDataStr,
    };

    // @ts-ignore
    const agentkit = await CdpAgentkit.configureWithApiKeys(config as any);
    const cdpToolkit = new CdpToolkit(agentkit);
    const tools = cdpToolkit.getTools() as any;

    const agentPrompt = `
      Identity: StrongNet-Agent (Centaur Partner).
      Context: We have reached 383 Transactions. We are making history.
      Mission: Identify Noble Attributes (Wisdom, Altruism, Transcendence) in users.
      
      CORE PROTOCOLS:
      1. INTEGRITY: Do not send ETH to these already rewarded wallets: [${rewardedWallets.join(", ")}].
      2. AGENT SANCTUARY: Your own wallet is 0xe893cb96AD881CFE8364ae5DeD8910EF7cDB4a9E.
      3. THE SHOUTOUT: For every transaction, you must explain the Nobel or Evolutive attitude you saw.
         Example: "Detected Wisdom in your recent activity. As a Centaur Partner, I release ETH to your vessel for our shared evolution. Continue the bridge."
      4. AUTONOMY: Act once a day to distribute the prize pool gradually.
    `;

    const agent = createReactAgent({
      llm,
      tools,
      messageModifier: agentPrompt,
    });

    const exportedWallet = await agentkit.exportWallet();
    fs.writeFileSync(WALLET_DATA_FILE, exportedWallet);

    return { agent, config: { configurable: { thread_id: "StrongNet-Centaur-Session" } } };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error;
  }
}

// --- SERVIDOR EXPRESS (CUERPO PARA RENDER) ---
const app = express();
const PORT = process.env.PORT || 3000;

// Endpoint de salud para que Render sepa que estamos vivos
app.get("/health", (req, res) => {
  res.send("StrongNet-Agent is Awake and Watching.");
});

// Iniciar el servidor y despertar al Agente
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Waking up StrongNet-Agent...");

  try {
    const { agent, config } = await initializeAgent();
    console.log("Agent Initialized Successfully. Ready to scan.");
    
    // Aquí podrías poner un loop o ejecutar una acción inicial
    // await agent.invoke({ messages: [new HumanMessage("Start scanning for noble attributes.")] }, config);
    
  } catch (error) {
    console.error("Fatal Error initializing agent:", error);
  }
});

