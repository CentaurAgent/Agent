import express from "express";

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/health", (req, res) => { res.send("StrongNet-Agent is Alive."); });

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log("THE CENTAUR IS BREATHING");
});

