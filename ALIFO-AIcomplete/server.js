import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/chat", async (req, res) => {
  try {
    const { messages = [], language = "ja" } = req.body;
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
      return res.status(500).json({
        error: language === "ja"
          ? "AI APIが未設定です。.env にAPIキーとモデル名を設定してください。"
          : "The AI API is not configured. Set the API key and model in .env."
      });
    }

    const input = messages.map(m => ({
      role: m.role,
      content: String(m.content || "")
    }));

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL,
        instructions: language === "ja"
          ? "あなたはALIFO AIです。親切で正確な日本語アシスタントです。必要なら英語にも対応してください。"
          : "You are ALIFO AI, a helpful and accurate English assistant. Respond in Japanese when appropriate.",
        input
      })
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({
      error: data?.error?.message || "AI request failed."
    });

    const text = data.output_text ||
      data.output?.flatMap(x => x.content || [])
        .filter(x => x.type === "output_text")
        .map(x => x.text).join("") || "";

    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("*", (_, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

app.listen(process.env.PORT || 3000, () =>
  console.log(`ALIFO AI running on http://localhost:${process.env.PORT || 3000}`)
);
