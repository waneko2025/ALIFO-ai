
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
    const timeoutMs = 25000;
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

async function getPuterModels() {
  if (!window.puter?.ai?.listModels) return [];
  try {
    return await withTimeout(window.puter.ai.listModels(), 6000, "Puter model list timed out");
  } catch { return []; }
}

function pickPuterModel(models, kind) {
  const list = Array.isArray(models) ? models : [];
  const providerMatch = kind === "gpt"
    ? m => /openai/i.test(`${m?.provider || ""} ${m?.id || ""}`)
    : kind === "gemini"
      ? m => /google|gemini/i.test(`${m?.provider || ""} ${m?.id || ""}`)
      : m => /anthropic|claude/i.test(`${m?.provider || ""} ${m?.id || ""}`);
  const preferred = kind === "gpt"
    ? ["gpt-5.6-luna", "openai/gpt-5.6-luna", "gpt-5.5"]
    : kind === "gemini"
      ? ["gemini-3.1-flash-lite", "gemini-3.1-flash", "gemini-3.0-flash"]
      : ["claude-sonnet-5", "claude-opus-4-8", "claude-sonnet-4-6"];
  for (const wanted of preferred) {
    const exact = list.find(m => String(m?.id || "").toLowerCase() === wanted.toLowerCase());
    if (exact?.id) return exact.id;
  }
  return list.find(m => providerMatch(m))?.id || preferred[0] || null;
}

function isFactualQuestion(q = "") {
  return isQuestionLike(q) || containsAny(q, ["最新", "今日", "現在", "いつ", "誰", "どこ", "ニュース", "発売", "放送", "価格", "値段", "公式"]);
}

function isQuestionLike(q = "") {
  return /[?？]$/.test(q) || containsAny(q, ["なぜ", "どうして", "どうやって", "とは", "って何", "教えて", "説明して", "分かる", "わかる", "誰", "どこ", "いつ"]);
}

function qualitySystemPrompt() {
  return language === "ja"
    ? "あなたはALIFO AIです。ユーザーの現在の依頼を最優先してください。前の会話は明確に参照された場合だけ使います。事実を推測で埋めないでください。存在・人物・番組・商品・日付などを確認できない場合は、分からないと明確に伝えてください。最新情報については、利用できるWeb検索がある場合のみ検索し、検索していないのに検索したとは言わないでください。根拠が弱い情報を断定しないでください。質問には直接答え、必要なら短い注意書きを添えてください。日本語で自然に、分かりやすく、安全に答えてください。"
    : "You are ALIFO AI. Prioritize the user's current request. Use previous conversation only when clearly referenced. Never fill factual gaps by guessing. If you cannot verify a person, show, product, date, or other fact, say that you cannot verify it. For current information, use web search when available; never claim to have searched when you did not. Do not state weakly supported facts as certain. Answer directly and clearly in English.";
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
        max_tokens: 1200,
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
      setAiStatus("connected", "puter");
      const answer = result.text.trim();
      loading.querySelector(".bubble").textContent = answer;
      c.messages.push({ role: "assistant", content: answer });
      save();
      return;
    } catch (externalError) {
      console.warn("Puter AI failed; falling back to on-device AI", externalError);
    }

    // 2) WebGPU, then 3) CPU/WASM local model.
    try {
      setAiStatus("connecting", "webgpu");
      let engine = await getLocalEngine();
      setAiStatus("connected", engine.runtime === "webgpu" ? "webgpu" : "cpu");

      let answer;
      try {
        answer = await generateWithTimeout(engine, { messages: aiMessages }, 20000);
      } catch (localError) {
        if (engine.runtime === "webgpu") {
          console.warn("WebGPU generation failed; switching to CPU/WASM", localError);
          setAiStatus("connecting", "cpu");
          engine = await getLocalEngine(true);
          setAiStatus("connected", "cpu");
          answer = await generateWithTimeout(engine, { messages: aiMessages }, 20000);
        } else {
          throw localError;
        }
      }

      if (!answer?.trim()) throw new Error("Local AI returned an empty response");
      loading.querySelector(".bubble").textContent = answer.trim();
      c.messages.push({ role: "assistant", content: answer.trim() });
      save();
      return;
    } catch (localError) {
      console.warn("Local AI failed; using built-in fallback", localError);
    }

    // 4) Built-in server fallback.
    setAiStatus("connected", "fallback");
    const fallbackResponse = await fetchWithTimeout(
      "/api/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: c.messages.slice(-30), language })
      },
      15000
    );
    const data = await fallbackResponse.json();
    if (!fallbackResponse.ok || !data.text) throw new Error(data.error || "Fallback failed");
    loading.querySelector(".bubble").textContent = data.text;
    c.messages.push({ role: "assistant", content: data.text });
    save();
  } catch (e) {
    setAiStatus("error", "error");
    loading.querySelector(".bubble").textContent = language === "ja" ? `回答できませんでした。\n${e.message}` : `I couldn't answer that.\n${e.message}`;
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

if (!chats.length) newChat(); else { currentId = chats[0].id; renderChat(); renderHistory(); }
applyLanguage();
setAiStatus("connecting", "connecting");

window.addEventListener("error", (event) => {
  console.warn("ALIFO AI page error:", event?.error || event?.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.warn("ALIFO AI unhandled rejection:", event?.reason);
});

