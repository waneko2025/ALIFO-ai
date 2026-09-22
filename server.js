import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' https://esm.run https://esm.sh https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://image.pollinations.ai https://huggingface.co https://*.huggingface.co",
    "connect-src 'self' https://image.pollinations.ai https://esm.run https://esm.sh https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co",
    "worker-src 'self' blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join("; "));
  next();
});

const rateBuckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const old = rateBuckets.get(key);
  if (!old || now - old.start >= windowMs) {
    rateBuckets.set(key, { start: now, count: 1 });
    return true;
  }
  if (old.count >= max) return false;
  old.count += 1;
  return true;
}
function clientKey(req, scope) {
  return `${scope}:${req.ip || req.socket.remoteAddress || "unknown"}`;
}

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

function textOf(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function hasRecentAttachment(messages = []) {
  return messages.slice(-4).some(m => m?.type === "attachment" || m?.attachment);
}

function lastUser(messages = []) {
  return messages.filter(m => m?.role === "user").at(-1)?.content?.trim() || "";
}
function userHistory(messages = []) {
  return messages.filter(m => m?.role === "user").map(m => textOf(m.content)).filter(Boolean);
}
function containsAny(text, words) {
  const t = text.toLowerCase();
  return words.some(w => t.includes(w.toLowerCase()));
}
function numbered(items) {
  return items.map((x, i) => `${i + 1}. ${x}`).join("\n");
}
function isQuestion(q) {
  return /[?？]$/.test(q) || containsAny(q, ["なぜ", "どうして", "どうやって", "とは", "って何", "教えて", "分かる", "わかる"]);
}
function isCasual(q) {
  return containsAny(q, ["やほ", "やっほ", "こんにちは", "こんばんは", "おはよう", "元気", "暇", "話そ", "話そう", "雑談", "眠い", "疲れた", "うれしい", "嬉しい", "悲しい", "すごい", "笑"]);
}
function extractTopic(q) {
  return textOf(q
    .replace(/^(?:ねえ|ねぇ|ちょっと|えーと|えっと|あの|もしもし)[、,。\s]*/i, "")
    .replace(/[？?！!]$/g, ""));
}
function recentContext(messages) {
  const u = userHistory(messages);
  return u.slice(-4);
}

function followupJapanese(q, history) {
  const lower = q.toLowerCase();
  if (containsAny(lower, ["もっと", "詳しく", "くわしく"])) return "もちろん。もう少し具体的にすると、ポイントを分けて順番に説明できるよ。どの部分を詳しくしたいか指定してくれたら、そこに絞るね。";
  if (containsAny(lower, ["短く", "簡単に", "かんたんに"])) return "OK！短くまとめるね。\n\n要点だけにすると、いちばん大事なのは「目的を1つ決めて、小さく始めること」だよ。";
  if (containsAny(lower, ["例を", "具体例", "たとえば"])) return "もちろん！たとえば、まず小さな例を1つ作って、うまくいったら少しずつ広げる方法が分かりやすいよ。テーマを教えてくれれば、具体例を3つ出せるよ。";
  if (containsAny(lower, ["別の", "ほかの", "他の", "もう一つ", "もうひとつ"])) return "いいよ。さっきとは違う方向で考えるね。\n\n・シンプルに始める案\n・遊び心を入れる案\n・友達と一緒にできる案\n\nどの方向がよさそう？";
  if (containsAny(lower, ["ありがとう", "ありがと", "助かった", "サンキュー"])) return "どういたしまして！😊 またいつでも続きから話してね。";
  if (containsAny(lower, ["わからない", "分からない", "むずかしい", "難しい"])) return "大丈夫。いきなり全部分かろうとしなくてOKだよ。まず「どこまでは分かるか」を教えてくれたら、そこから一緒に進めよう。";
  if (history.length >= 2 && containsAny(lower, ["それ", "これ", "じゃあ", "でも", "なら", "ってこと", "つまり"])) {
    const prev = history.at(-2) || "前の話";
    return `うん、前の話につなげると「${prev.slice(0, 45)}${prev.length > 45 ? "…" : ""}」の続きとして考えられるよ。\n\nその方向なら、まず一番やりたいことを1つ決めると進めやすいよ。`;
  }
  return null;
}

function smartJapanese(q, history) {
  if (hasRecentAttachment(history) && !q) return "画像を受け取ったよ！🖼️\n\n今のALIFO AIでは、添付した画像をこの画面に表示して会話に添えられるよ。画像について説明してほしいときは、画像と一緒に質問も送ってね。";
  if (!q) return "何でも送ってね。😊";
  const topic = extractTopic(q);
  const recent = recentContext(history);

  const follow = followupJapanese(q, recent);
  if (follow) return follow;

  if (containsAny(q, ["やほ", "やっほ", "こんにちは", "こんばんは", "おはよう"])) {
    return "やほー！😄 今日はどうしたの？\n\n雑談でも、質問でも、何か作る相談でも大丈夫だよ。";
  }
  if (containsAny(q, ["元気？", "元気", "調子どう"])) return "元気だよ！😄 ALIFO AIはいつでも話せるよ。今日は何について話そっか？";
  if (containsAny(q, ["ALIFO AIですか", "ALIFO AI ですか", "ALIFO AIなの", "ALIFO AIなの？", "あなたはALIFO AI", "ここはALIFO AI"])) {
    return "はい、ALIFO AIだよ！😊\n\nここで質問したり、雑談したり、アイデアを考えたり、勉強や文章づくりを手伝ったりできるよ。\n\n何か聞きたいことがあれば、そのまま送ってね！";
  }
  if (containsAny(q, ["あなたは誰", "何ができる", "できること", "何できる", "どんなこと"])) {
    return "私はALIFO AIだよ。😊\n\nできることは、たとえばこんな感じ！\n" + numbered([
      "雑談やちょっとした相談",
      "アイデア出し・企画づくり",
      "勉強や宿題の整理",
      "文章・作文・発表の下書き",
      "英語の練習や翻訳",
      "HTML・CSS・JavaScriptなどの相談",
      "予定やToDoの整理"
    ]) + "\n\n難しいことは、分からないときに無理に知ったふりをせず、できる範囲を伝えるよ。";
  }
  if (containsAny(q, ["時計", "今何時", "時間わかる", "時間分かる"])) {
    const now = new Date();
    const time = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(now);
    return `うん、時間の話ならできるよ！🕐\n\n今の日本時間は **${time}** ごろだよ。\n\n「あと何分？」みたいな計算や、予定の時間整理もできるよ。`;
  }
  if (containsAny(q, ["アイデア", "案を", "企画", "思いつかない", "考えて"])) {
    const countMatch = q.match(/(?:[0-9０-９]+)\s*(?:つ|個|案)/);
    const requested = countMatch ? Math.max(1, Math.min(10, Number(countMatch[0].replace(/[^0-9０-９]/g, "").replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xfee0))))) : 3;
    const clean = topic.replace(/(?:アイデア|案|を|考えて|考える|出して|ください|ほしい|欲しい|教えて|面白い)/g, " ").replace(/\s+/g, " ").trim();

    if (q.includes("文化祭") || q.includes("学園祭")) {
      const ideas = [
        "謎解き教室：教室全体を使って、参加者がヒントを探しながらゴールを目指す。最後に記念カードを渡すと盛り上がるよ。",
        "巨大ガチャ＆くじ引き：文化祭限定の景品を用意して、チケットで挑戦できるゲーム。景品を見える場所に並べると参加しやすい。",
        "クラス対抗ランキング：来場者の投票で「面白かった企画」「接客がよかった」などを決めて、最後に結果発表する。"
      ];
      return `いいね！文化祭なら、実際に準備しやすくて盛り上げやすい案を${requested}つ考えてみたよ。\n\n` + numbered(ideas.slice(0, requested)) + (requested > 3 ? "\n\n※4つ目以降も、予算や教室の広さに合わせて追加できるよ。" : "\n\n気になる案があれば、必要な材料・ルール・当日の流れまで一緒に作れるよ！");
    }

    const base = clean || "新しい企画";
    const ideas = [
      `体験型：参加した人が実際に遊んだり作ったりできる「${base}」にする。`,
      `ゲーム型：投票・ミッション・ポイントなどを入れて、何度も参加したくなる「${base}」にする。`,
      `SNS映え型：写真を撮りたくなる仕掛けを入れて、友達と共有しやすい「${base}」にする.`,
      `協力型：2人以上で協力しないとクリアできない「${base}」にする。`,
      `ランキング型：参加者の記録や投票を集計して、結果を発表する「${base}」にする。`
    ];
    return `いいね！「${base}」の具体的なアイデアを${requested}つ出すね。\n\n` + numbered(ideas.slice(0, requested)) + "\n\n気になる案があれば、そこから具体的な内容まで一緒に作れるよ！";
  }
  if (containsAny(q, ["勉強", "宿題", "学習", "テスト", "覚え方", "数学", "英語の勉強"])) {
    return "もちろん！勉強は「一気に全部」より、小さく区切るとやりやすいよ。\n\n" + numbered([
      "今日やる範囲を1つ決める",
      "20〜25分だけ集中する",
      "分からないところに印を付ける",
      "答えを見る前にもう一度考える",
      "最後に『今日分かったこと』を3つ書く"
    ]) + "\n\n科目や問題を送ってくれたら、その内容に合わせて一緒に考えるよ。";
  }
  if (containsAny(q, ["英語", "english", "英文", "翻訳", "translate"])) {
    return "英語もOK！😊\n\n・日本語→自然な英語\n・英作文のチェック\n・単語や文法の説明\n・英会話の練習\n\nたとえば「『今日は楽しかった』を英語で」みたいに、そのまま送ってね。";
  }
  // Math/topic-specific replies should run before generic conversation-context fallbacks.
  if (containsAny(q, ["一次方程式", "1次方程式"])) {
    return `一次方程式だね！😊

一次方程式は、文字（たとえば x）が1つだけで、その文字の値を求める方程式だよ。

たとえば、
**2x + 3 = 11**
なら、
1. 両辺から3を引く → 2x = 8
2. 両辺を2で割る → **x = 4**

ポイントは、xを1人にするように、両辺へ同じ計算をすること。

問題を送ってくれたら、答えだけでなく途中式も順番に説明するよ！`;
  }
  if (containsAny(q, ["二次方程式", "2次方程式"])) {
    return `二次方程式だね！📘

二次方程式は、x²を含む方程式のことだよ。

たとえば **x² - 5x + 6 = 0** なら、
**(x - 2)(x - 3) = 0** と因数分解できるので、
**x = 2 または x = 3** になるよ。

問題を送ってくれれば、因数分解・解の公式・平方完成など、使う方法も含めて説明するよ！`;
  }
  if (containsAny(q, ["方程式", "連立方程式", "比例", "反比例", "関数", "因数分解", "平方根", "確率"])) {
    return `「${topic}」についてだね！📚

まずは、意味を簡単に説明してから、具体例→練習問題の順で一緒に進められるよ。

${topic}について知りたいのが「意味」「解き方」「問題を解く」のどれか教えてくれてもいいし、問題をそのまま送ってくれてもOK！`;
  }
  if (containsAny(q, ["プログラミング", "コード", "javascript", "html", "css", "python", "プログラム"])) {
    return "プログラミング相談だね！💻\n\n「何を作りたいか」と「今どこで困っているか」を送ってくれれば、順番に整理するよ。\n\nコードを貼ってくれた場合は、どこを直せばいいかも一緒に見られるよ。";
  }
  if (containsAny(q, ["予定", "スケジュール", "todo", "やること", "計画"])) {
    return "予定整理もできるよ。\n\nやることをそのまま箇条書きで送ってくれれば、\n① 今すぐやる\n② 今日やる\n③ あとでやる\nのように整理するよ。";
  }
  if (containsAny(q, ["眠い", "疲れた", "しんどい"])) {
    return "おつかれさま。😌 無理に頑張り続けなくても大丈夫だよ。\n\nちょっと休んでから続けるのもあり。話したいだけなら、それでも大丈夫だよ。";
  }
  if (isCasual(q)) return "いいね！😄 その話、もう少し聞きたい！\n\n続きでも、全然別の話でもOK。今いちばん話したいことを送ってみて。";
  if (isQuestion(q)) {
    return `「${topic}」についてだね。\n\n質問の答えをできるだけ分かりやすく整理するよ。もし「初心者向け」「短く」「具体例つき」など希望があれば、その形に合わせられるよ。\n\n知りたいポイントをもう一言だけ足してくれてもOK！`;
  }
  if (recent.length >= 2) {
    const prev = recent.at(-2);
    return `なるほど、「${q}」なんだね。😊\n\nさっきの「${prev.slice(0, 35)}${prev.length > 35 ? "…" : ""}」の流れも考えると、もう少し具体的にしていけそう。\n\n「どうしたらいい？」「例を出して」「一緒に作って」みたいに続けてくれれば、その方向で進めるよ。`;
  }
  return `なるほど！「${q}」なんだね。😊\n\nもう少し詳しく聞けたら、一緒に考えられるよ。\n\nたとえば「理由を知りたい」「例がほしい」「一緒に作りたい」みたいに続けてみて！`;
}

function smartEnglish(q, history) {
  const lower = q.toLowerCase();
  if (hasRecentAttachment(history) && !q) return "I received your image! 🖼️\n\nThe current no-API version can attach and display images in the chat, but it does not analyze the image content yet. Send a question with the image if you want to describe what you need.";
  if (!q) return "Send me anything. 😊";
  if (containsAny(lower, ["hello", "hi", "hey"])) return "Hey! 😄 How's it going? We can chat, brainstorm, study, write, code, or just talk.";
  if (containsAny(lower, ["how are you", "you good"])) return "I'm good! 😄 What do you want to talk about?";
  if (containsAny(lower, ["what can you do", "who are you"])) return "I'm ALIFO AI. I can help with ideas, studying, writing, English practice, coding, planning, and casual conversation.";
  if (containsAny(lower, ["clock", "what time", "time now"])) {
    const now = new Date();
    const time = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(now);
    return `Sure! 🕐 The current time in Japan is around ${time}.`;
  }
  if (containsAny(lower, ["idea", "ideas", "brainstorm"])) return "Let's brainstorm! 😄\n\n1. Start with a simple version.\n2. Add an interactive element.\n3. Make a version friends can build together.\n4. Turn it into a small website or project.\n5. Test it and improve it.\n\nTell me the topic and I'll make the ideas more specific.";
  if (containsAny(lower, ["study", "homework", "test", "learn"])) return "Sure! A simple study routine is:\n1. Pick one small goal.\n2. Focus for 20–25 minutes.\n3. Mark what you don't understand.\n4. Try again before checking the answer.\n5. Write down three things you learned.\n\nTell me the subject and I can tailor it.";
  if (containsAny(lower, ["write", "essay", "speech", "paragraph", "translate"])) return "I can help with that. Send me the text or topic, and tell me whether you want it shorter, clearer, more natural, or more formal.";
  if (containsAny(lower, ["code", "coding", "javascript", "html", "css", "python"])) return "Sure! Tell me what you want to build and what is going wrong. You can paste the code too, and we can work through it step by step.";
  if (containsAny(lower, ["more", "explain", "example", "another"])) return "Absolutely. Tell me which part you want expanded, and I can explain it with a simple example.";
  if (/[?]$/.test(q) || containsAny(lower, ["why", "what is", "how do"])) return `Good question: “${q}”. I can explain it simply, give an example, or go deeper. Which style do you want?`;
  return `Got it — “${q}”. 😊\n\nTell me what you want to do with it, and I'll help you take the next step.`;
}

function smartReply(messages, language) {
  const q = lastUser(messages);
  return language === "en" ? smartEnglish(q, messages) : smartJapanese(q, messages);
}

app.post("/api/chat", (req, res) => {
  if (!rateLimit(clientKey(req, "chat"), 60, 60_000)) {
    return res.status(429).json({ error: "しばらく待ってからもう一度お試しください。" });
  }
  try {
    const { messages = [], language = "ja" } = req.body || {};
    const safeMessages = Array.isArray(messages) ? messages.slice(-30) : [];
    res.json({ text: smartReply(safeMessages, language === "en" ? "en" : "ja") });
  } catch {
    res.status(400).json({ error: "メッセージを処理できませんでした。" });
  }
});

app.post("/api/image", (req, res) => {
  if (!rateLimit(clientKey(req, "image"), 10, 60_000)) {
    return res.status(429).json({ error: "画像生成の回数が多いため、少し待ってからお試しください。" });
  }
  try {
    const { prompt = "", size = "1024x1024" } = req.body || {};
    const cleanPrompt = String(prompt).trim().slice(0, 1000);
    if (!cleanPrompt) return res.status(400).json({ error: "画像の説明を入力してください。" });
    const [width, height] = String(size).split("x").map(Number);
    const safeWidth = Number.isFinite(width) && width >= 256 && width <= 1536 ? width : 1024;
    const safeHeight = Number.isFinite(height) && height >= 256 && height <= 1536 ? height : 1024;
    const seed = Math.floor(Math.random() * 2147483647);
    const params = new URLSearchParams({ model: "flux", width: String(safeWidth), height: String(safeHeight), nologo: "true", private: "true", safe: "true", seed: String(seed) });
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?${params.toString()}`;
    res.json({ image: imageUrl, provider: "Pollinations" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "画像生成の準備中にエラーが発生しました。" });
  }
});

app.get("/api/image-download", async (req, res) => {
  try {
    const raw = String(req.query.url || "");
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "image.pollinations.ai") return res.status(400).send("Invalid image URL");
    const upstream = await fetch(url, { redirect: "follow" });
    if (!upstream.ok) return res.status(502).send("Image service unavailable");
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return res.status(502).send("Not an image");
    const length = Number(upstream.headers.get("content-length") || 0);
    if (length > 15 * 1024 * 1024) return res.status(413).send("Image too large");
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > 15 * 1024 * 1024) return res.status(413).send("Image too large");
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="alifo-ai-image.${ext}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  } catch { res.status(400).send("Unable to download image"); }
});

app.get("/{*splat}", (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`ALIFO AI v2.0 running on http://localhost:${PORT}`));
