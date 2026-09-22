import { CreateMLCEngine, prebuiltAppConfig } from "@mlc-ai/web-llm";
let language = localStorage.getItem("alifo_lang") || "ja";
let chats = JSON.parse(localStorage.getItem("alifo_chats") || "[]");
let currentId = null;

const $ = s => document.querySelector(s);
const messages = $("#messages"), empty = $("#empty"), prompt = $("#prompt"), send = $("#send"), generateImageBtn = $("#generateImage"), attachImageBtn = $("#attachImage"), imageInput = $("#imageInput");
let pendingAttachment = null;
let localEngine = null;
let localEnginePromise = null;
const LOCAL_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

async function getLocalEngine() {
  if (localEngine) return localEngine;
  if (localEnginePromise) return localEnginePromise;
  localEnginePromise = (async () => {
    const status = (text) => {
      const el = document.querySelector("#localAiStatus");
      if (el) el.textContent = text;
    };

    if (!navigator.gpu) {
      throw new Error(language === "ja"
        ? "このブラウザではWebGPUが利用できません。Chrome/Edgeのハードウェアアクセラレーションを確認してください。"
        : "WebGPU is not available. Check browser hardware acceleration.");
    }

    status(language === "ja" ? "WebGPUを確認しています…" : "Checking WebGPU…");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error(language === "ja"
        ? "WebGPUアダプターを取得できませんでした。Chromeのハードウェアアクセラレーションを有効にしてください。"
        : "Could not obtain a WebGPU adapter. Enable hardware acceleration in Chrome.");
    }

    const record = prebuiltAppConfig?.model_list?.find(m => m.model_id === LOCAL_MODEL);
    if (!record) {
      throw new Error(language === "ja"
        ? "ローカルAIモデルの設定が見つかりませんでした。"
        : "The local AI model configuration was not found.");
    }

    status(language === "ja"
      ? "端末内AIを読み込んでいます… 初回は約900MBのモデルをダウンロードします"
      : "Loading on-device AI… the first run downloads about 900 MB");

    const engine = await CreateMLCEngine(LOCAL_MODEL, {
      appConfig: {
        cacheBackend: "cache",
        model_list: [record]
      },
      initProgressCallback: (p) => {
        const pct = Math.max(0, Math.min(100, Math.round((p.progress || 0) * 100)));
        status(language === "ja" ? `AIモデルを準備中… ${pct}%` : `Preparing local AI… ${pct}%`);
      }
    });

    localEngine = engine;
    status(language === "ja" ? "端末内AIを使用中" : "Using on-device AI");
    return engine;
  })();
  try { return await localEnginePromise; } finally { localEnginePromise = null; }
}

function save() {
  try { localStorage.setItem("alifo_chats", JSON.stringify(chats)); }
  catch { /* keep the current session usable if localStorage is full */ }
}
function applyLanguage() {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-ja][data-en]").forEach(el => {
    el.textContent = language === "ja" ? el.dataset.ja : el.dataset.en;
  });
  prompt.placeholder = language === "ja" ? prompt.dataset.placeholderJa : prompt.dataset.placeholderEn;
  $("#language").textContent = language === "ja" ? "English" : "日本語";
  $("#settingLanguage").value = language;
  renderHistory();
}
function newChat() {
  currentId = Date.now().toString();
  chats.unshift({ id: currentId, title: language === "ja" ? "新しいチャット" : "New chat", messages: [] });
  save(); renderChat(); renderHistory();
}
function ensureChat() {
  if (!currentId || !chats.find(c => c.id === currentId)) newChat();
  return chats.find(c => c.id === currentId);
}
function renderHistory() {
  const box = $("#history"); box.innerHTML = "";
  chats.forEach(c => {
    const b = document.createElement("button");
    b.className = "history-item" + (c.id === currentId ? " active" : "");
    b.textContent = c.title;
    b.onclick = () => { currentId = c.id; renderChat(); renderHistory(); $("#sidebar").classList.remove("open"); };
    box.appendChild(b);
  });
}
function renderChat() {
  const c = chats.find(x => x.id === currentId);
  messages.innerHTML = "";
  if (!c || !c.messages.length) { empty.style.display = "block"; return; }
  empty.style.display = "none";
  c.messages.forEach(m => {
    if (m.type === "image") addImageMessage(m.src, m.prompt, false);
    else if (m.type === "attachment") addAttachmentMessage(m.src, m.name, m.caption || "", false);
    else addMessage(m.role, m.content, false);
  });
  scrollToBottom();
}
function scrollToBottom() {
  messages.parentElement.scrollTop = messages.parentElement.scrollHeight;
}
function addMessage(role, text, store = true) {
  const row = document.createElement("div"); row.className = "message " + role;
  if (role === "ai") { const a = document.createElement("div"); a.className = "avatar"; a.textContent = "A"; row.appendChild(a); }
  const b = document.createElement("div"); b.className = "bubble"; b.textContent = text; row.appendChild(b); messages.appendChild(row);
  scrollToBottom();
  if (store) {
    const c = ensureChat(); c.messages.push({ role, content: text });
    if (c.messages.length === 1) c.title = text.replace(/^🖼\s*/, "").slice(0, 28);
    save(); renderHistory();
  }
  return row;
}
function addAttachmentMessage(src, name, caption = "", store = true) {
  const row = document.createElement("div"); row.className = "message user attachment-message";
  const wrap = document.createElement("div"); wrap.className = "bubble attachment-bubble";
  const img = document.createElement("img"); img.className = "attached-image"; img.src = src; img.alt = name || (language === "ja" ? "添付画像" : "Attached image");
  wrap.appendChild(img);
  const meta = document.createElement("div"); meta.className = "attachment-meta";
  const icon = document.createElement("span"); icon.textContent = "📎";
  const label = document.createElement("span"); label.textContent = name || (language === "ja" ? "画像" : "Image");
  meta.append(icon, label); wrap.appendChild(meta);
  if (caption) { const cap = document.createElement("div"); cap.className = "attachment-caption"; cap.textContent = caption; wrap.appendChild(cap); }
  row.appendChild(wrap); messages.appendChild(row); scrollToBottom();
  if (store) { const c = ensureChat(); c.messages.push({ role: "user", type: "attachment", src, name, content: caption, caption }); save(); renderHistory(); }
  return row;
}

function addImageMessage(src, promptText, store = true) {
  const row = document.createElement("div"); row.className = "message ai";
  const a = document.createElement("div"); a.className = "avatar"; a.textContent = "A"; row.appendChild(a);
  const wrap = document.createElement("div"); wrap.className = "bubble image-bubble";
  const img = document.createElement("img"); img.className = "generated-image"; img.src = src; img.alt = promptText; img.loading = "lazy";
  img.onerror = () => { wrap.classList.add("image-error"); status.textContent = language === "ja" ? "画像を読み込めませんでした。もう一度生成してください。" : "The image could not be loaded. Please try again."; };
  wrap.appendChild(img);
  const actions = document.createElement("div"); actions.className = "image-actions";
  const open = document.createElement("a"); open.href = src; open.target = "_blank"; open.rel = "noopener noreferrer"; open.className = "image-action"; open.textContent = language === "ja" ? "↗ 開く" : "↗ Open";
  const download = document.createElement("a"); download.href = `/api/image-download?url=${encodeURIComponent(src)}`; download.className = "image-action primary"; download.textContent = language === "ja" ? "↓ 保存" : "↓ Save";
  actions.append(open, download); wrap.appendChild(actions);
  const status = document.createElement("div"); status.className = "image-note"; status.textContent = language === "ja" ? "生成画像 · Pollinations" : "Generated image · Pollinations"; wrap.appendChild(status);
  row.appendChild(wrap); messages.appendChild(row); scrollToBottom();
  if (store) { const c = ensureChat(); c.messages.push({ type: "image", src, prompt: promptText }); save(); }
  return row;
}
async function generateImage() {
  const text = prompt.value.trim(); if (!text) return;
  ensureChat(); addMessage("user", `🖼 ${text}`);
  prompt.value = ""; prompt.style.height = "auto"; send.disabled = true; generateImageBtn.disabled = true;
  const loading = addMessage("ai", language === "ja" ? "画像を生成しています…" : "Generating image…");
  try {
    const r = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text, size: "1024x1024" }) });
    const d = await r.json(); if (!r.ok) throw Error(d.error || "Image request failed");
    loading.remove(); addImageMessage(d.image, text, true);
  } catch (e) {
    loading.querySelector(".bubble").textContent = language === "ja" ? `画像生成エラー: ${e.message}` : `Image error: ${e.message}`;
  } finally { send.disabled = false; generateImageBtn.disabled = false; prompt.focus(); }
}
async function sendMessage(text) {
  const c = ensureChat();
  const attachment = pendingAttachment;
  if (attachment) {
    addAttachmentMessage(attachment.src, attachment.name, text, true);
    pendingAttachment = null;
    updateAttachmentState();
  } else {
    addMessage("user", text);
  }
  prompt.value = ""; prompt.style.height = "auto"; send.disabled = true;
  const loading = addMessage("ai", language === "ja" ? "AIを準備しています…" : "Preparing AI…", false);
  try {
    const engine = await getLocalEngine();
    const history = c.messages
      .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-12)
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    const system = language === "ja"
      ? "あなたはALIFO AIです。日本語で自然に会話してください。質問されたらまず直接答えてください。ユーザーの質問文をそのまま言い換えるだけの返答は避けてください。『3つ』など数を指定されたら、その数だけ具体的な案を出してください。必要なときだけ短い確認質問をしてください。前の話題に無理につなげず、新しい質問は新しい話題として扱ってください。説明は分かりやすく、親しみやすくしてください。"
      : "You are ALIFO AI. Reply naturally in English. Answer the user's question directly first. Do not merely restate the user's question. If the user asks for a specific number of items, provide exactly that number of concrete items. Ask a short clarification only when necessary. Do not force a new question into the previous topic; treat it as a new topic when appropriate. Be clear and friendly.";
    const reply = await engine.chat.completions.create({
      messages: [{ role: "system", content: system }, ...history],
      temperature: 0.7,
      max_tokens: 500
    });
    const textOut = reply?.choices?.[0]?.message?.content?.trim();
    if (!textOut) throw new Error(language === "ja" ? "AIから回答を受け取れませんでした。" : "The AI did not return a response.");
    loading.querySelector(".bubble").textContent = textOut;
    c.messages.push({ role: "assistant", content: textOut });
    save();
  } catch (e) {
    // If WebLLM cannot be loaded (for example, a CDN/network issue), keep ALIFO AI usable
    // by falling back to the server-side no-API smart reply engine.
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: c.messages.slice(-30), language })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Fallback request failed");
      const fallback = String(d.text || "").trim();
      if (!fallback) throw new Error("Empty fallback response");
      loading.querySelector(".bubble").textContent = fallback;
      c.messages.push({ role: "assistant", content: fallback });
      save();
      const status = document.querySelector("#localAiStatus");
      if (status) status.textContent = language === "ja"
        ? "端末内AIを読み込めなかったため、軽量モードで動作中（設定からWebGPUを確認できます）"
        : "On-device AI could not be loaded; lightweight mode is active";
    } catch (fallbackError) {
      loading.querySelector(".bubble").textContent = language === "ja"
        ? `AIを起動できませんでした。\n${e.message}`
        : `Could not start the local AI.\n${e.message}`;
    }
  } finally { send.disabled = false; prompt.focus(); }
}

function updateAttachmentState() {
  if (!attachImageBtn) return;
  attachImageBtn.classList.toggle("selected", !!pendingAttachment);
  attachImageBtn.title = pendingAttachment ? (language === "ja" ? `添付中: ${pendingAttachment.name}` : `Attached: ${pendingAttachment.name}`) : (language === "ja" ? "画像を添付" : "Attach image");
}

function readImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const maxBytes = 1024 * 1024;
  if (file.size > maxBytes) {
    alert(language === "ja" ? "画像は1MB以下にしてください。" : "Please choose an image up to 1MB.");
    imageInput.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    pendingAttachment = { src: reader.result, name: file.name };
    updateAttachmentState();
    prompt.placeholder = language === "ja" ? "画像についてメッセージを書く…" : "Write a message about the image…";
    prompt.focus();
  };
  reader.readAsDataURL(file);
}

$("#form").onsubmit = e => { e.preventDefault(); const x = prompt.value.trim(); if (x || pendingAttachment) sendMessage(x); };
generateImageBtn.onclick = generateImage;
attachImageBtn.onclick = () => imageInput.click();
imageInput.onchange = e => readImageFile(e.target.files?.[0]);
updateAttachmentState();
prompt.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#form").requestSubmit(); } };
prompt.oninput = () => { prompt.style.height = "auto"; prompt.style.height = Math.min(prompt.scrollHeight, 140) + "px"; };
$("#newChat").onclick = newChat;
$("#language").onclick = () => { language = language === "ja" ? "en" : "ja"; localStorage.setItem("alifo_lang", language); applyLanguage(); };
$("#settingsBtn").onclick = () => $("#settings").classList.remove("hidden");
$("#closeSettings").onclick = () => $("#settings").classList.add("hidden");
$("#settingLanguage").onchange = e => { language = e.target.value; localStorage.setItem("alifo_lang", language); applyLanguage(); };
$("#clearHistory").onclick = () => { if (confirm(language === "ja" ? "履歴をすべて削除しますか？" : "Delete all chat history?")) { chats = []; currentId = null; save(); newChat(); } };
$("#openSidebar").onclick = () => $("#sidebar").classList.add("open");
$("#closeSidebar").onclick = () => $("#sidebar").classList.remove("open");
document.querySelectorAll(".quick button").forEach(b => b.onclick = () => sendMessage(b.dataset[language === "ja" ? "promptJa" : "promptEn"]));

if (!chats.length) newChat(); else { currentId = chats[0].id; renderChat(); renderHistory(); }
applyLanguage();
