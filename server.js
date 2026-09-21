import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function localReply(message, language) {
  const q = String(message || "").trim();
  const lower = q.toLowerCase();

  if (language === "en") {
    if (/hello|hi|hey/.test(lower)) return "Hello! I'm ALIFO AI's free demo mode. Ask me something!";
    if (lower.includes("idea")) return "Here are three simple ideas:\n1. Make a small personal website.\n2. Build a study timer.\n3. Create a daily idea notebook.\n\nTell me your theme and I can help shape it.";
    if (lower.includes("study") || lower.includes("learn")) return "A simple study plan is: choose one small goal, work for 25 minutes, take a short break, then review what you learned.";
    if (lower.includes("self introduction") || lower.includes("introduction")) return "Hi! I'm ____. I enjoy ____. I'm currently interested in ____. Nice to meet you!";
    return `I received: “${q}”\n\nThis is ALIFO AI's free mode, so it uses built-in responses rather than a paid AI API. Try asking for an idea, study help, or a self-introduction.`;
  }

  if (/こんにちは|こんばんは|おはよう|やあ/.test(q)) return "こんにちは！ALIFO AIの無料モードです。質問してみてください！";
  if (q.includes("アイデア")) return "3つ考えてみました！\n1. 自分だけのプロフィールサイトを作る\n2. 勉強用タイマーを作る\n3. 毎日のアイデアを記録するノートを作る\n\nテーマを教えてくれれば、もう少し具体的にできます。";
  if (q.includes("勉強") || q.includes("学習")) return "シンプルな勉強法なら、①小さな目標を1つ決める → ②25分集中する → ③短く休憩する → ④最後に今日覚えたことを確認する、がおすすめです。";
  if (q.includes("自己紹介")) return "こんにちは！私は＿＿です。＿＿が好きです。今は＿＿に興味があります。よろしくお願いします！";
  if (q.includes("ALIFO")) return "ALIFO AIは、今回作っているあなたのAIチャットサイトです。この無料モードではAPI料金なしでサイトを公開できます。";
  return `「${q}」を受け取りました。\n\nこれはALIFO AIの無料モードです。料金のかかるAI APIは使わず、サイト内の組み込み回答で動いています。\n\n「アイデア」「勉強」「自己紹介」などを試してみてください。`;
}

app.post("/api/chat", (req, res) => {
  const { messages = [], language = "ja" } = req.body;
  const last = messages.filter(m => m.role === "user").at(-1)?.content || "";
  res.json({ text: localReply(last, language) });
});

app.get("/{*splat}", (_, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

app.listen(process.env.PORT || 3000, () =>
  console.log(`ALIFO AI free mode running on http://localhost:${process.env.PORT || 3000}`)
);
