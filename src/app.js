
/* ALIFO AI theme preference: system on first visit, then persist the user's choice. */
(function initAlifoTheme() {
  const KEY = "alifo-theme";
  const root = document.documentElement;

  function getStoredTheme() {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" || value === "system" ? value : null;
  }

  function systemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  }

  function applyTheme(choice, persist = true) {
    const actual = choice === "system" ? systemTheme() : choice;
    root.dataset.theme = actual;
    root.style.colorScheme = actual;
    if (persist) localStorage.setItem(KEY, choice);
    document.querySelectorAll("[data-theme-choice]").forEach((el) => {
      el.setAttribute("aria-pressed", el.dataset.themeChoice === choice ? "true" : "false");
    });
  }

  window.alifoSetTheme = function(theme) {
    if (theme === "system" || theme === "light" || theme === "dark") {
      applyTheme(theme, true);
    }
  };

  const initial = getStoredTheme() || "system";
  applyTheme(initial, false);

  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  if (media) {
    const onSystemThemeChange = () => {
      if ((getStoredTheme() || "system") === "system") applyTheme("system", false);
    };
    if (media.addEventListener) media.addEventListener("change", onSystemThemeChange);
    else if (media.addListener) media.addListener(onSystemThemeChange);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const host = document.querySelector("[data-theme-controls]");
    if (!host) return;
    host.addEventListener("click", (event) => {
      const button = event.target.closest("[data-theme-choice]");
      if (!button) return;
      applyTheme(button.dataset.themeChoice, true);
    });
  });
})();

// ALIFO AI v4.3 stable state initialization
const $ = (sel) => document.querySelector(sel);

// Normalize AI/user text safely on the client. Keep this local because the
// relevance guard runs before any answer is rendered.
function textOf(value) {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(" ");
  if (typeof value === "object") {
    if (typeof value.text === "string") return textOf(value.text);
    if (typeof value.content === "string") return textOf(value.content);
  }
  return String(value).replace(/\s+/g, " ").trim();
}
const messages = $("#messages");
const empty = $("#empty");
const prompt = $("#prompt");
const send = $("#send");
const generateImageBtn = $("#generateImage");
const attachImageBtn = $("#attachImage");
const imageInput = $("#imageInput");
let language = localStorage.getItem("alifo_lang") === "en" ? "en" : "ja";
let chats = [];
let currentId = null;
let pendingAttachment = null;
try {
  const raw = localStorage.getItem("alifo_chats");
  const parsed = raw ? JSON.parse(raw) : [];
  if (Array.isArray(parsed)) chats = parsed.filter(c => c && typeof c === "object" && Array.isArray(c.messages));
} catch { chats = []; }

// AI priority: Puter AI (GPT/Gemini/Claude models) -> WebGPU local model -> CPU/WASM local model -> built-in fallback.
// No provider-specific API key is stored in ALIFO AI. Puter handles the external AI connection.
let aiWorker = null;
let aiWorkerPromise = null;
let aiRequestId = 0;
const LOCAL_MODEL = {
  id: "onnx-community/Qwen2.5-0.5B-Instruct",
  label: "Qwen2.5 0.5B",
  approx: "約786MB（q4）"
};

function createAIWorker() {
  if (!aiWorker) aiWorker = new Worker(new URL("./ai-worker.js", import.meta.url), { type: "module" });
  return aiWorker;
}

function getLocalEngine(forceWasm = false) {
  if (!forceWasm && aiWorkerPromise) return aiWorkerPromise;
  if (forceWasm) {
    aiWorker?.terminate?.();
    aiWorker = null;
    aiWorkerPromise = null;
  }

  aiWorkerPromise = new Promise((resolve, reject) => {
    const worker = createAIWorker();
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onWorkerError);
      fn(value);
    };
    const onWorkerError = (event) => {
      finish(reject, new Error(event?.message || "Local AI worker failed"));
    };
    const onMessage = (event) => {
      const d = event.data || {};
      if (d.type === "progress") {
        const el = document.querySelector("#localAiStatus");
        if (el && Number.isFinite(d.progress)) {
          el.textContent = language === "ja"
            ? `端末内AI（${d.runtime === "webgpu" ? "WebGPU" : "CPU/WASM"}）を準備中… ${Math.round(d.progress)}%`
            : `Preparing on-device AI (${d.runtime === "webgpu" ? "WebGPU" : "CPU/WASM"})… ${Math.round(d.progress)}%`;
        }
        return;
      }
      if (d.type === "ready") {
        finish(resolve, {
          runtime: d.runtime,
          generate: (payload, onChunk) => generateInWorker(worker, payload, onChunk)
        });
      } else if (d.type === "error" && d.scope === "init") {
        finish(reject, Object.assign(
          new Error(d.message || "Local AI initialization failed"),
          { runtime: d.runtime || "unknown" }
        ));
      }
    };
    // A browser-side model can take a while to download. If it has not
    // initialized after this period, continue to the built-in fallback.
    const timeoutMs = 90000;
    const timer = setTimeout(() => {
      worker.terminate();
      aiWorker = null;
      aiWorkerPromise = null;
      finish(reject, new Error("Local AI initialization timed out"));
    }, timeoutMs);

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onWorkerError);
    worker.postMessage({ type: "init", model: LOCAL_MODEL.id, language, forceWasm });
  }).catch(err => {
    aiWorkerPromise = null;
    throw err;
  });
  return aiWorkerPromise;
}

function generateInWorker(worker, payload, onChunk) {
  return new Promise((resolve, reject) => {
    const id = ++aiRequestId;
    const handler = (event) => {
      const d = event.data || {};
      if (d.id !== id) return;
      if (d.type === "chunk") onChunk?.(d.text || "");
      else if (d.type === "done") { worker.removeEventListener("message", handler); resolve(d.text || ""); }
      else if (d.type === "error") { worker.removeEventListener("message", handler); reject(Object.assign(new Error(d.message || "Local AI generation failed"), { runtime: d.runtime || "unknown" })); }
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ type: "generate", id, ...payload });
  });
}

function setAiStatus(state, runtime = "external") {
  const badge = document.querySelector("#externalAiBadge");
  const text = document.querySelector("#externalAiBadgeText");
  const footer = document.querySelector("#localAiStatus");
  if (!badge) return;
  badge.classList.remove("connected", "connecting", "error", "puter", "webgpu", "cpu", "fallback");
  const cls = runtime === "puter" ? "puter" : runtime === "webgpu" ? "webgpu" : runtime === "cpu" ? "cpu" : runtime === "fallback" ? "fallback" : state;
  badge.classList.add(cls);
  if (text) text.textContent = "";
  if (footer) footer.textContent = "";
}

function checkExternalAi() {
  return !!window.puter?.ai?.chat;
}

function extractPuterText(result) {
  const content = result?.message?.content ?? result?.content ?? result?.text ?? result;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === "string") return part;
      return part?.text || part?.content || "";
    }).join("\n").trim();
  }
  return "";
}

let puterModelCache = { models: [], providers: [], fetchedAt: 0 };
const PUTER_MODEL_CACHE_MS = 5 * 60 * 1000;

function normalizePuterModels(models) {
  return (Array.isArray(models) ? models : [])
    .filter(m => m && m.id)
    .map(m => ({
      id: String(m.id),
      provider: String(m.provider || "unknown"),
      name: String(m.name || m.id),
      aliases: Array.isArray(m.aliases) ? m.aliases.map(String) : [],
      context: Number(m.context) || 0,
      max_tokens: Number(m.max_tokens) || 0,
      cost: m.cost || null
    }));
}

async function getPuterModelCatalog(force = false) {
  if (!window.puter?.ai?.listModels) return { models: [], providers: [] };
  const fresh = Date.now() - puterModelCache.fetchedAt < PUTER_MODEL_CACHE_MS;
  if (!force && fresh && puterModelCache.models.length) return puterModelCache;
  try {
    const [models, providers] = await Promise.all([
      withTimeout(window.puter.ai.listModels(), 10000, "Puter model list timed out"),
      window.puter.ai.listModelProviders
        ? withTimeout(window.puter.ai.listModelProviders(), 5000, "Puter provider list timed out").catch(() => [])
        : Promise.resolve([])
    ]);
    puterModelCache = {
      models: normalizePuterModels(models),
      providers: Array.isArray(providers) ? providers.map(String) : [],
      fetchedAt: Date.now()
    };
    updatePuterModelInfo();
    return puterModelCache;
  } catch (err) {
    console.warn("Puter model discovery failed", err);
    return puterModelCache;
  }
}

async function getPuterModels(force = false) {
  const catalog = await getPuterModelCatalog(force);
  return catalog.models;
}

function providerFamily(kind, model) {
  const hay = `${model?.provider || ""} ${model?.id || ""} ${model?.name || ""}`.toLowerCase();
  if (kind === "gpt") return /openai|gpt/.test(hay);
  if (kind === "gemini") return /google|gemini/.test(hay);
  return /anthropic|claude/.test(hay);
}

function pickPuterModel(models, kind) {
  const list = Array.isArray(models) ? models : [];
  const candidates = list.filter(m => providerFamily(kind, m));
  if (!candidates.length) return null;

  // Prefer explicitly named current models when they are present, but never
  // invent a model ID. Every returned ID comes from Puter's live catalog.
  const preferred = kind === "gpt"
    ? ["gpt-5.6-luna", "gpt-5.6", "gpt-5.5", "gpt-5-nano"]
    : kind === "gemini"
      ? ["gemini-3.1-flash-lite", "gemini-3.1-flash", "gemini-3.0-flash", "gemini-2.5-flash"]
      : ["claude-sonnet-5", "claude-opus-4-8", "claude-sonnet-4-6", "claude-sonnet-4"];
  for (const wanted of preferred) {
    const exact = candidates.find(m => m.id.toLowerCase() === wanted.toLowerCase() || m.aliases.some(a => a.toLowerCase() === wanted.toLowerCase()));
    if (exact) return exact.id;
  }

  // Prefer free variants when Puter exposes one, then a model with a useful
  // context window. This keeps discovery automatic without guessing IDs.
  const sorted = [...candidates].sort((a, b) => {
    const af = /:free$/i.test(a.id) ? 0 : 1;
    const bf = /:free$/i.test(b.id) ? 0 : 1;
    if (af !== bf) return af - bf;
    return (b.context || 0) - (a.context || 0);
  });
  return sorted[0]?.id || null;
}

function updatePuterModelInfo() {
  const box = document.querySelector("#puterModelInfo");
  if (!box) return;
  const count = puterModelCache.models.length;
  const providers = puterModelCache.providers.length
    ? puterModelCache.providers.join(", ")
    : [...new Set(puterModelCache.models.map(m => m.provider))].join(", ");
  box.textContent = language === "ja"
    ? `Puterで利用可能なチャットモデル: ${count}個${providers ? `（提供元: ${providers}）` : ""}`
    : `Puter chat models available: ${count}${providers ? ` (providers: ${providers})` : ""}`;
}

function isFactualQuestion(q = "") {
  return isQuestionLike(q) || containsAny(q, ["最新", "今日", "現在", "いつ", "誰", "どこ", "ニュース", "発売", "放送", "価格", "値段", "公式"]);
}

function isQuestionLike(q = "") {
  return /[?？]$/.test(q) || containsAny(q, ["なぜ", "どうして", "どうやって", "とは", "って何", "教えて", "説明して", "分かる", "わかる", "誰", "どこ", "いつ"]);
}

function qualitySystemPrompt() {
  return language === "ja"
    ? "あなたはALIFO AIです。ユーザーの現在の依頼を最優先してください。前の会話は明確に参照された場合だけ使います。事実を推測で埋めず、確認できない情報は分からないと伝えてください。最新情報は利用できるWeb検索がある場合のみ検索し、検索していないのに検索したとは言わないでください。質問には最初に結論や要点を答えてください。回答は読みやすく整理し、必要な場合だけ見出しや箇条書きを使ってください。通常は短め（目安700文字以内）にし、複雑な質問だけ必要な範囲で詳しくしてください。同じ内容を繰り返さないでください。日本語で自然に、分かりやすく、安全に答えてください。"
    : "You are ALIFO AI. Prioritize the user's current request. Use previous conversation only when clearly referenced. Never fill factual gaps by guessing; say when information cannot be verified. For current information, use web search when available and never claim to have searched when you did not. Give the conclusion or key point first. Keep answers easy to scan with short paragraphs, headings, or bullets only when useful. Usually stay concise (about 700 characters or less), and expand only when the question genuinely needs more detail. Do not repeat the same point. Answer naturally, clearly, and safely in English.";
}

async function puterReply(messages) {
  if (!window.puter?.ai?.chat) throw new Error("Puter AI unavailable");
  const models = await getPuterModels();
  const order = ["gpt", "gemini", "claude"];
  const factual = isFactualQuestion(messages.filter(m => m?.role === "user").at(-1)?.content || "");
  let lastError = null;

  for (const kind of order) {
    const model = pickPuterModel(models, kind);
    if (!model) continue;
    try {
      const options = {
        model,
        normalize: true,
        max_tokens: 1000,
        temperature: 0.2
      };
      // Puter documents web_search for OpenAI models. Use it only for questions
      // that benefit from current/factual verification.
      if (kind === "gpt" && factual) options.tools = [{ type: "web_search" }];
      const result = await withTimeout(
        window.puter.ai.chat(messages, options),
        18000,
        `${kind} response timed out`
      );
      const text = extractPuterText(result);
      if (text) return { text, kind, model };
    } catch (err) {
      lastError = err;
      console.warn(`Puter ${kind} model failed`, err);
    }
  }
  throw lastError || new Error("No usable Puter AI model");
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
function renderMarkdown(text = "") {
  const source = String(text).replace(/\r\n?/g, "\n").trim();
  if (!source) return "";
  const lines = source.split("\n");
  const out = [];
  let inCode = false;
  let code = [];
  let listType = null;

  const inline = value => {
    let s = escapeHtml(value);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
    s = s.replace(/https?:\/\/[^\s<]+/g, url => {
      const clean = url.replace(/[.,!?、。]+$/, "");
      const tail = url.slice(clean.length);
      return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${tail}`;
    });
    return s;
  };

  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^```/.test(line)) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) { code.push(raw); continue; }
    if (!line.trim()) { closeList(); continue; }

    let m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m) { closeList(); const level = m[1].length; out.push(`<h${level + 2}>${inline(m[2])}</h${level + 2}>`); continue; }
    m = line.match(/^[-*]\s+(.+)$/);
    if (m) { if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    m = line.match(/^\d+[.)]\s+(.+)$/);
    if (m) { if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; } out.push(`<li>${inline(m[1])}</li>`); continue; }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inCode) out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  closeList();
  return out.join("");
}

function addMessage(role, text, store = true) {
  const row = document.createElement("div"); row.className = "message " + role;
  if (role === "ai") { const a = document.createElement("div"); a.className = "avatar"; a.textContent = "A"; row.appendChild(a); }
  const b = document.createElement("div"); b.className = "bubble";
  if (role === "ai") { b.classList.add("ai-answer"); b.innerHTML = renderMarkdown(text); }
  else b.textContent = text;
  row.appendChild(b); messages.appendChild(row);
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
    setAiStatus("error", "error");
    loading.querySelector(".bubble").textContent = language === "ja" ? `画像生成エラー: ${e.message}` : `Image error: ${e.message}`;
  } finally { send.disabled = false; generateImageBtn.disabled = false; prompt.focus(); }
}
function historyWithSystem(history, system) {
  return [{ role: "system", content: system }, ...history];
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function generateWithTimeout(engine, payload, ms) {
  return withTimeout(
    engine.generate(payload),
    ms,
    "Local AI generation timed out"
  );
}

function fetchWithTimeout(url, options, ms) {
  return withTimeout(
    fetch(url, options),
    ms,
    "Built-in fallback timed out"
  );
}

function localAnswerLooksRelevant(answer, question) {
  const a = textOf(answer);
  const q = textOf(question);
  if (!a || !q) return false;

  // Lightweight topic guard for on-device/fallback models. This is not a
  // truth detector; it only blocks obvious answers about a completely
  // different subject (for example, answering a politics question with an
  // unrelated TV-show description).
  const stop = new Set([
    "これ", "それ", "ここ", "こと", "もの", "ため", "よう", "感じ", "質問",
    "説明", "教えて", "お願いします", "ください", "ですか", "ますか",
    "について", "どんな", "どの", "どういう", "どうして", "なぜ", "なの",
    "あなた", "わたし", "私", "今日", "現在", "日本", "英語", "日本語"
  ]);
  const jpChunks = q.match(/[一-龯々〆ヵヶぁ-んァ-ヶー]{2,}/g) || [];
  const useful = [...new Set(jpChunks.filter(x => !stop.has(x) && x.length >= 2))];
  const answerLower = a.toLowerCase();

  if (useful.length) {
    // Prefer content terms. If the question contains multiple content terms,
    // accept the answer when at least one appears, with a small boost when
    // two or more appear. This avoids rejecting short, correct explanations.
    const hits = useful.filter(x => a.includes(x)).length;
    if (hits > 0) return true;

    // If the only broad term was "日本", do not reject a Japanese answer.
    // Other content terms missing from the answer are a strong off-topic sign.
    if (useful.length === 1 && useful[0] === "日本") return true;
    return false;
  }

  const words = q.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !stop.has(w));
  if (words.length) return words.some(w => answerLower.includes(w));
  return true;
}

function safeAnswer(answer, question) {
  const text = textOf(answer).trim();
  if (!text) return { ok: false, text: "" };
  return { ok: localAnswerLooksRelevant(text, question), text };
}

async function sendMessage(text) {
  const c = ensureChat();
  const attachment = pendingAttachment;
  if (attachment) { addAttachmentMessage(attachment.src, attachment.name, text, true); pendingAttachment = null; updateAttachmentState(); }
  else addMessage("user", text);
  const originalPrompt = text;
  prompt.value = ""; prompt.style.height = "auto"; send.disabled = true;
  const loading = addMessage("ai", language === "ja" ? "考えています…" : "Thinking…", false);
  try {
    const recent = c.messages.filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-20).map(m => ({ role: m.role, content: m.content.slice(0, 6000) }));
    const system = qualitySystemPrompt();
    const aiMessages = [{ role: "system", content: system }, ...recent];

    // 1) Puter AI: try GPT, then Gemini, then Claude. These are accessed
    // through Puter.js, so ALIFO AI does not store provider API keys.
    try {
      setAiStatus("connecting", "puter");
      const result = await puterReply(aiMessages);
      const checked = safeAnswer(result.text, originalPrompt);
      if (!checked.ok) throw new Error(`Puter ${result.kind} returned an unrelated answer`);
      setAiStatus("connected", "puter");
      const answer = checked.text;
      loading.querySelector(".bubble").innerHTML = renderMarkdown(answer);
      c.messages.push({ role: "assistant", content: answer });
      save();
      return;
    } catch (externalError) {
      console.warn("Puter AI failed; falling back to on-device AI", externalError);
    }

    // 2) WebGPU, then 3) CPU/WASM local model. No provider API keys are used.
    try {
      setAiStatus("connecting", "webgpu");
      let engine = await getLocalEngine();
      setAiStatus("connected", engine.runtime === "webgpu" ? "webgpu" : "cpu");

      let answer;
      try {
        answer = await generateWithTimeout(engine, { messages: aiMessages }, 60000);
      } catch (localError) {
        if (engine.runtime === "webgpu") {
          console.warn("WebGPU generation failed; switching to CPU/WASM", localError);
          setAiStatus("connecting", "cpu");
          engine = await getLocalEngine(true);
          setAiStatus("connected", "cpu");
          answer = await generateWithTimeout(engine, { messages: aiMessages }, 60000);
        } else {
          throw localError;
        }
      }

      const checked = safeAnswer(answer, originalPrompt);
      if (!checked.ok) throw new Error("Local AI returned an unrelated answer");
      answer = checked.text;
      loading.querySelector(".bubble").innerHTML = renderMarkdown(answer);
      c.messages.push({ role: "assistant", content: answer });
      save();
      return;
    } catch (localError) {
      console.warn("Local AI failed; using built-in fallback", localError);
    }

    // 5) Built-in server fallback.
    setAiStatus("connected", "fallback");
    const fallbackResponse = await fetchWithTimeout(
      "/api/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: c.messages.slice(-30), language })
      },
      30000
    );
    const data = await fallbackResponse.json();
    if (!fallbackResponse.ok || !data.text) throw new Error(data.error || "Fallback failed");
    const checkedFallback = safeAnswer(data.text, originalPrompt);
    if (!checkedFallback.ok) throw new Error(language === "ja" ? "質問に関係する回答を生成できませんでした" : "I could not generate a response relevant to your question");
    loading.querySelector(".bubble").innerHTML = renderMarkdown(checkedFallback.text);
    c.messages.push({ role: "assistant", content: checkedFallback.text });
    save();
  } catch (e) {
    setAiStatus("error", "error");
    loading.querySelector(".bubble").textContent = language === "ja"
      ? "質問に関係する回答を生成できませんでした。もう一度質問してみてください。"
      : "I could not generate a relevant answer. Please try asking again.";
    if (!prompt.value) { prompt.value = originalPrompt; prompt.style.height = "auto"; prompt.style.height = Math.min(prompt.scrollHeight, 140) + "px"; }
  } finally { send.disabled = false; prompt.focus(); }
}

async function runRuntimeDiagnostic() {
  const box = document.querySelector("#diagnosticResult");
  if (!box) return;
  box.classList.remove("hidden");
  box.textContent = language === "ja" ? "診断しています…" : "Running diagnostics…";
  const lines = [];
  const add = (label, value) => lines.push(`${label}: ${value}`);
  const bool = v => v ? (language === "ja" ? "はい" : "Yes") : (language === "ja" ? "いいえ" : "No");
  let overall = "ok";

  add(language === "ja" ? "安全な接続" : "Secure context", bool(window.isSecureContext));
  add(language === "ja" ? "ブラウザ" : "Browser", navigator.userAgent);

  if (!window.isSecureContext) overall = "warn";

  try {
    const storage = navigator.storage;
    if (storage?.estimate) {
      const estimate = await storage.estimate();
      const used = Number(estimate.usage || 0);
      const quota = Number(estimate.quota || 0);
      add(language === "ja" ? "ブラウザ保存容量" : "Browser storage", quota ? `${Math.round(used / 1024 / 1024)}MB / ${Math.round(quota / 1024 / 1024)}MB` : "unknown");
    }
    add(language === "ja" ? "WASM対応" : "WASM support", typeof WebAssembly !== "undefined" ? "OK" : "NG");
    add(language === "ja" ? "SharedArrayBuffer" : "SharedArrayBuffer", typeof SharedArrayBuffer !== "undefined" ? "利用可能" : "利用不可");
    const online = typeof navigator.onLine === "boolean" ? navigator.onLine : null;
    add(language === "ja" ? "ネットワーク接続" : "Network", online === null ? "unknown" : bool(online));
  } catch (err) {
    overall = "warn";
    add(language === "ja" ? "ストレージ診断" : "Storage diagnostic", `ERROR ${err?.message || err}`);
  }

  add(language === "ja" ? "AI実行優先順位" : "AI priority", "Puter GPT → Puter Gemini → Puter Claude → WebGPU → CPU/WASM → built-in fallback");
  add(language === "ja" ? "APIキー" : "API key", language === "ja" ? "ALIFO AI側では保存しません（Puter.jsを使用）" : "Not stored by ALIFO AI (uses Puter.js)");
  try {
    const origin = location.origin;
    add(language === "ja" ? "ALIFO AIのオリジン" : "ALIFO AI origin", origin);
    add(language === "ja" ? "診断時刻" : "Diagnostic time", new Date().toISOString());
  } catch {}

  add(language === "ja" ? "ALIFO AIのAI方式" : "ALIFO AI runtime", "Puter GPT → Gemini → Claude → WebGPU → CPU/WASM → built-in fallback");
  const report = lines.join("\n");
  const title = language === "ja" ? "CPU/WASM実行環境の診断結果" : "CPU/WASM runtime diagnostic result";
  const cls = overall === "error" ? "diag-error" : overall === "warn" ? "diag-warn" : "diag-ok";
  box.innerHTML = `<strong class="${cls}">${title}</strong><pre>${escapeHtml(report)}</pre><div class="diag-actions"><button class="diag-copy" id="copyDiagnostic">${language === "ja" ? "結果をコピー" : "Copy result"}</button></div>`;
  const copy = document.querySelector("#copyDiagnostic");
  if (copy) copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(report);
      copy.textContent = language === "ja" ? "コピーしました" : "Copied";
    } catch {
      copy.textContent = language === "ja" ? "コピーできませんでした" : "Copy failed";
    }
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
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
$("#runDiagnostic").onclick = runRuntimeDiagnostic;
$("#closeSettings").onclick = () => $("#settings").classList.add("hidden");
$("#settingLanguage").onchange = e => { language = e.target.value; localStorage.setItem("alifo_lang", language); applyLanguage(); };
$("#clearHistory").onclick = () => { if (confirm(language === "ja" ? "履歴をすべて削除しますか？" : "Delete all chat history?")) { chats = []; currentId = null; save(); newChat(); } };
$("#openSidebar").onclick = () => $("#sidebar").classList.add("open");
$("#closeSidebar").onclick = () => $("#sidebar").classList.remove("open");
document.querySelectorAll(".quick button").forEach(b => b.onclick = () => sendMessage(b.dataset[language === "ja" ? "promptJa" : "promptEn"]));

const refreshPuterModelsBtn = document.querySelector("#refreshPuterModels");
if (refreshPuterModelsBtn) {
  refreshPuterModelsBtn.onclick = async () => {
    refreshPuterModelsBtn.disabled = true;
    refreshPuterModelsBtn.textContent = language === "ja" ? "取得中…" : "Loading…";
    await getPuterModelCatalog(true);
    refreshPuterModelsBtn.textContent = language === "ja" ? "モデルを更新" : "Refresh models";
    refreshPuterModelsBtn.disabled = false;
  };
}

if (!chats.length) newChat(); else { currentId = chats[0].id; renderChat(); renderHistory(); }
applyLanguage();
updatePuterModelInfo();
setAiStatus("connecting", "connecting");
getPuterModelCatalog().catch(() => {});

window.addEventListener("error", (event) => {
  console.warn("ALIFO AI page error:", event?.error || event?.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.warn("ALIFO AI unhandled rejection:", event?.reason);
});

