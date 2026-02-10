import express from "express";
import axios from 'axios'; // AÑADIDO: Importamos axios para hacer peticiones HTTP
import { runAgentLogic } from './agentkit'; // Importamos la función principal del agente desde agentkit.ts

const app = express();
const PORT = process.env.PORT || 10000;

// URL de tu Shadow Agent en Railway (o Vercel, si lo cambiaste)
const PROCLAMATION_URL = 'https://sentinel-voice-bridge-production.up.railway.app';

app.get("/health", (req, res) => { 
  res.status(200).send("StrongNet-Agent is Alive."); 
});

// Función para enviar la señal de proclama al Puente de la Voz
async function sendProclamation(intent: string, score: string, trxHash: string, recipientAddress: string) {
    try {
        await axios.post(PROCLAMATION_URL, {
            intent: intent,
            score: score,
            trx_hash: trxHash,
            recipient_address: recipientAddress 
        });
        console.log("[BRIDGE] Señal de proclama enviada al Puente de la Voz.");
    } catch (error: any) {
        // Log de error sobrio. El proceso principal NO se detiene.
        console.error("[BRIDGE] Error al enviar la señal:", error.message);
    }
}

// 👇 INICIO DEL MOTOR: El Bucle de Vida del Agente 👇
function startAgentLoop() {
  console.log("[SENTINEL] Iniciando bucle perpetuo de Actos Nobles...");
  
  // Ejecuta la primera vez inmediatamente
  runAgentLogic(sendProclamation); // Asumimos que runAgentLogic acepta la función de proclama

  // Configura la ejecución repetitiva cada 10 minutos (600000 ms)
  // Esto mantiene al agente escaneando y vivo.
  setInterval(() => {
    runAgentLogic(sendProclamation);
  }, 600000); 
}
// 👆 FIN DEL MOTOR 👆


app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log("THE CENTAUR IS BREATHING");
  
  // 👇 LLAMADA FINAL: Aquí se enciende el motor al arrancar el servidor 👇
  startAgentLoop(); 
});
