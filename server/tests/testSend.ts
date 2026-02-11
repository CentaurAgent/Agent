import { ethers } from "ethers";

// --- CONFIG ---
// RPC de tu red (ej: Infura, Alchemy, o el que uses en Render)
const RPC_URL = process.env.RPC_URL || "https://mainnet.infura.io/v3/YOUR_KEY";
// Tu clave privada (guardada en variable de entorno, nunca hardcodear)
const PRIVATE_KEY = process.env.PRIVATE_KEY || "YOUR_PRIVATE_KEY";
// Dirección de destino (tu propia address para probar)
const RECIPIENT = "YOUR_ETH_ADDRESS";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("[TEST] Wallet address:", wallet.address);

  // Transacción mínima
  const tx = {
    to: RECIPIENT,
    value: ethers.parseEther("0.00001"),
  };

  const sentTx = await wallet.sendTransaction(tx);
  console.log("[TEST] ETH sent, hash:", sentTx.hash);

  await sentTx.wait();
  console.log("[TEST] Confirmed on chain!");
}

main().catch((err) => {
  console.error("[TEST] Error:", err);
});
