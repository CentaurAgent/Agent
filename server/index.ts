import express from "express";
import axios from 'axios'; // AÑADIDO: Importamos axios para hacer peticiones HTTP

const app = express();
const PORT = process.env.PORT || 10000;

// URL de tu Shadow Agent en Railway
const RAILWAY_PROCLAIM_URL = 'https://sentinel-voice-bridge-production.up.railway.app';

app.get("/health", (req, res) => { 
  res.send("StrongNet-Agent is Alive."); 
});

// Función para enviar la señal de proclama a Railway
async function sendProclamationToRailway(intent: string, score: string, trxHash: string, recipientAddress: string) {
    try {
        await axios.post(RAILWAY_PROCLAIM_URL, {
            intent: intent,
            score: score,
            trx_hash: trxHash,
            recipient_address: recipientAddress 
        });
        console.log("Señal de proclama enviada al Shadow Agent en Railway.");
    } catch (error: any) {
        // Esto es solo un log de error. El agente de Render NO se detendrá si esto falla.
        console.error("Error al enviar la señal a Railway:", error.message);
    }
}

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log("THE CENTAUR IS BREATHING");
  
  // NOTA: Debes integrar la llamada a 'sendProclamationToRailway' 
  // dentro de tu lógica principal de Render, donde el agente decide actuar.
  // Por ejemplo, si tienes una función 'checkBlockchainAndAct()', llama a esta función DENTRO de ella.
  
  // EJEMPLO DE USO (Eliminar esto después de integrarlo en tu lógica real):
  // await sendProclamationToRailway("Ejemplo de Intento Noble", "10/10", "0x12345...", "0xabcde...");
});
