import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function lastUser(messages = []) {
  return messages.filter(m => m.role === "user").at(-1)?.content?.trim() || "";
}

function previousUser(messages = []) {
  const list = messages.filter(m => m.role === "user");
  return list.length > 1 ? list.at(-2).content.trim() : "";
}

function containsAny(text, words) {
  return words.some(w => text.toLowerCase().includes(w.toLowerCase()));
}

function numbered(items) {
  return items.map((x, i) => `${i + 1}. ${x}`).join("\n");
}

function smartJapanese(q, history) {
  const lower = q.toLowerCase();
  const prev = previousUser(history);

  if (!q) return "質問や相談を入力してください。";
  if (containsAny(q, ["こんにちは", "こんばんは", "おはよう", "やあ", "hello", "hi"])) {
    return "こんにちは！ALIFO AIです。\n\n質問、勉強、アイデア、文章作成、プログラミング、雑談など、いろいろ相談してください。\n\nたとえば「文化祭のアイデアを考えて」「数学の勉強方法を教えて」のように自由に入力できます。";
  }
  if (containsAny(q, ["ありがとう", "サンキュー", "助かった"])) return "どういたしまして！😊\nほかにも聞きたいことがあれば、続けてどうぞ。";
  if (containsAny(q, ["あなたは誰", "何ができる", "できること", "何できる", "どんなこと"])) {
    return "ALIFO AIの無料スマートモードです。\n\nできることの例：\n" + numbered([
      "アイデアを一緒に考える",
      "勉強方法や問題の考え方を整理する",
      "文章・作文・発表原稿の下書きを作る",
      "英語の表現や練習をする",
      "プログラミングの考え方を説明する",
      "予定・ToDo・企画を整理する",
      "日常のちょっとした疑問について話す"
    ]) + "\n\n完全な生成AIではないため、難しい質問では答えられないこともあります。";
  }
  if (containsAny(q, ["アイデア", "案を", "企画", "思いつかない"])) {
    const topic = q.replace(/アイデア|案を|考えて|出して|ください|ほしい|欲しい/g, "").trim() || "新しい企画";
    return `「${topic}」について考えてみます！\n\n` + numbered([
      `${topic}を小さく始められるシンプルな案`,
      `${topic}にゲーム・投票・ランキングなどの参加要素を加える案`,
      `${topic}を友達と協力して作る案`,
      `${topic}をSNSやWebで紹介できる形にする案`,
      `${topic}を1週間だけ試して改善する案`
    ]) + "\n\n気に入った番号を教えてくれれば、具体的な内容にしていきます。";
  }
  if (containsAny(q, ["勉強", "宿題", "学習", "テスト", "覚え方"])) {
    return "もちろんです。まずは「何を・いつまでに・どこまで」を小さく分けるのがおすすめです。\n\n例：\n" + numbered([
      "今日やる範囲を1つ決める",
      "20〜25分だけ集中する",
      "分からないところに印を付ける",
      "答えを見る前にもう一度考える",
      "最後に3行で今日の内容をまとめる"
    ]) + "\n\n科目や問題を教えてくれれば、もっと具体的に整理できます。";
  }
  if (containsAny(q, ["自己紹介", "作文", "文章", "レポート", "スピーチ", "発表原稿"])) {
    return "文章作成を手伝えます。まず下書きの型を作ると簡単です。\n\n【基本の型】\n① はじめ：テーマ・結論\n② なか：理由や具体例を2〜3個\n③ おわり：まとめ・これから\n\nたとえば「学校で発表する○○について、300字で」のように、テーマ・文字数・用途を教えてください。";
  }
  if (containsAny(q, ["英語", "english", "英文", "翻訳", "translate"])) {
    return "英語の練習もできます。\n\nたとえば、\n・日本語を自然な英語にする\n・英作文をチェックする\n・単語や文法を説明する\n・会話練習をする\n\n翻訳したい文や、練習したいテーマを送ってください。";
  }
  if (containsAny(q, ["プログラミング", "コード", "javascript", "html", "css", "python", "プログラム"])) {
    return "プログラミングの相談ですね。\n\n「何を作りたいか」「使っている言語」「今どうなっているか」の3つが分かると、整理しやすいです。\n\n例：『HTMLでボタンを押したら文字を変えたい』のように書いてください。";
  }
  if (containsAny(q, ["予定", "スケジュール", "todo", "やること", "計画"])) {
    return "計画を一緒に整理できます。\n\nまず、やることを全部書き出して、次に「今日・今週・あとで」に分けると簡単です。\n\nやることを箇条書きで送ってくれれば、順番を整理します。";
  }
  if (containsAny(q, ["どうして", "なぜ", "理由", "意味", "とは"] ) || q.endsWith("？") || q.endsWith("?")) {
    return `「${q}」についてですね。\n\n無料スマートモードでは、まず質問を「意味・理由・具体例」の3方向から整理して考えます。\n\n・意味：何を指している？\n・理由：なぜそうなる？\n・具体例：実際にはどうなる？\n\nもう少し具体的な対象や、知りたいポイントを教えてくれれば、さらに絞って説明します。`;
  }
  if (containsAny(q, ["面白い", "暇", "雑談", "話そう", "相談"])) {
    return "いいですね！😊\n\n雑談でも相談でも大丈夫です。\n\n今の気分に近いものを選ぶなら：\n1. 面白いことを考える\n2. 新しいアイデアを出す\n3. 勉強について話す\n4. ALIFO AIをもっと改良する\n\n番号か、話したいことをそのまま送ってください。";
  }

  if (prev) {
    return `「${q}」についてですね。\n\n前の話「${prev.slice(0, 40)}${prev.length > 40 ? "…" : ""}」につなげて考えるなら、まず目的を1つに絞ると進めやすいです。\n\n「もっと具体的に」「例を出して」「短くして」「別の案」などと送ってくれれば、その方向に変えます。`;
  }

  return `「${q}」について考えてみます。\n\nこの無料スマートモードでは、質問をテーマ・目的・具体例に分けて整理することができます。\n\nたとえば「もっと詳しく」「例を3つ」「小学生にも分かるように」「短くまとめて」のような追加指示にも対応します。\n\n※この版は外部の生成AI APIを使わないため、どんな質問にも完全に答えられるわけではありません。`;
}

function smartEnglish(q, history) {
  const lower = q.toLowerCase();
  if (!q) return "Type a question or idea and I'll help you organize it.";
  if (containsAny(lower, ["hello", "hi", "hey"])) return "Hi! I'm ALIFO AI. You can ask about ideas, studying, writing, English, coding, planning, or everyday questions.";
  if (containsAny(lower, ["idea", "ideas", "brainstorm"])) return "Let's brainstorm!\n\n1. Start with a simple version.\n2. Add a game, poll, or interactive element.\n3. Make a version friends can build together.\n4. Turn it into a small website or project.\n5. Test it for a week and improve it.\n\nTell me the topic and I can make the ideas more specific.";
  if (containsAny(lower, ["study", "homework", "test", "learn"])) return "A simple study routine is:\n1. Pick one small goal.\n2. Focus for 20–25 minutes.\n3. Mark what you don't understand.\n4. Try again before checking the answer.\n5. Summarize what you learned in three lines.\n\nTell me the subject if you want a more specific plan.";
  if (containsAny(lower, ["write", "essay", "speech", "introduction", "paragraph"])) return "I can help with writing. A useful structure is:\n1. Opening: topic and main point.\n2. Middle: two or three reasons or examples.\n3. Ending: summary and next step.\n\nSend me the topic, purpose, and approximate length.";
  if (containsAny(lower, ["code", "coding", "javascript", "html", "css", "python"])) return "I can help organize a coding problem. Tell me what you want to build, which language you use, and what is going wrong. For example: 'I want an HTML button that changes text when clicked.'";
  if (containsAny(lower, ["plan", "schedule", "todo"])) return "Let's make a simple plan. List everything you need to do, and I can help group it into today, this week, and later.";
  if (q.endsWith("?") || containsAny(lower, ["why", "what is", "how do"])) return `About “${q}”: try breaking the question into meaning, reason, and example. If you tell me which part you want, I can make the explanation more focused.`;
  return `I got your message: “${q}”.\n\nThis is ALIFO AI's free smart mode. It can help brainstorm, organize ideas, study, write, practice English, plan tasks, and discuss everyday questions.\n\nTry: “give me three examples”, “make it shorter”, “explain simply”, or “give me another idea”.`;
}

function smartReply(messages, language) {
  const q = lastUser(messages);
  return language === "en" ? smartEnglish(q, messages) : smartJapanese(q, messages);
}

app.post("/api/chat", (req, res) => {
  try {
    const { messages = [], language = "ja" } = req.body || {};
    const text = smartReply(Array.isArray(messages) ? messages : [], language === "en" ? "en" : "ja");
    res.json({ text });
  } catch (error) {
    res.status(400).json({ error: "メッセージを処理できませんでした。" });
  }
});


app.post("/api/image", async (req, res) => {
  const { prompt = "", size = "1024x1024" } = req.body || {};
  if (!prompt.trim()) {
    return res.status(400).json({ error: "画像の説明を入力してください。" });
  }

  // No external API is used here. Create a simple SVG illustration locally.
  const safe = prompt.trim().replace(/[&<>"]/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
  }[ch]));

  const width = size === "1024x1536" ? 1024 : size === "1536x1024" ? 1536 : 1024;
  const height = size === "1024x1536" ? 1536 : size === "1536x1024" ? 1024 : 1024;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e8f1ff"/>
      <stop offset="100%" stop-color="#f7e8ff"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="${width*0.18}" cy="${height*0.2}" r="${Math.min(width,height)*0.09}" fill="#ffffff" opacity="0.8"/>
  <circle cx="${width*0.82}" cy="${height*0.72}" r="${Math.min(width,height)*0.13}" fill="#ffffff" opacity="0.55"/>
  <rect x="${width*0.1}" y="${height*0.33}" width="${width*0.8}" height="${height*0.34}" rx="36" fill="#ffffff" opacity="0.92"/>
  <text x="${width/2}" y="${height*0.46}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.min(width,height)*0.045}" font-weight="700" fill="#25324a">ALIFO AI</text>
  <text x="${width/2}" y="${height*0.54}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.min(width,height)*0.025}" fill="#4d5b73">ローカル画像メーカー</text>
  <text x="${width/2}" y="${height*0.61}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.min(width,height)*0.018}" fill="#64748b">${safe}</text>
</svg>`;

  const dataUrl = "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64");
  res.json({ image: dataUrl, mode: "local" });
});

app.listen(process.env.PORT || 3000, () =>
  console.log(`ALIFO AI smart free mode running on http://localhost:${process.env.PORT || 3000}`)
);
