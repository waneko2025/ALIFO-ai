// CPU/WASM mode: load Transformers.js from a CDN at runtime so the server build
// does not need the package installed. WebGPU is never requested.
let aiWorker = null;
let aiWorkerPromise = null;
let aiRequestId = 0;
const LOCAL_MODEL = {
  id: "onnx-community/Qwen2.5-0.5B-Instruct",
  label: "Qwen2.5 0.5B",
  approx: "約786MB（q4）"
};

function createAIWorker() {
  if (!aiWorker) {
    aiWorker = new Worker(new URL("./ai-worker.js", import.meta.url), { type: "module" });
  }
  return aiWorker;
}

function getLocalEngine() {
  if (aiWorkerPromise) return aiWorkerPromise;
  aiWorkerPromise = new Promise((resolve, reject) => {
    const worker = createAIWorker();
    const onMessage = (event) => {
      const d = event.data || {};
      if (d.type === "progress") {
        const el = document.querySelector("#localAiStatus");
        if (el && Number.isFinite(d.progress)) el.textContent = language === "ja" ? `端末内AI（CPU/WASM）を準備中… ${Math.round(d.progress)}%` : `Preparing on-device AI (CPU/WASM)… ${Math.round(d.progress)}%`;
        return;
      }
      if (d.type === "ready") {
        worker.removeEventListener("message", onMessage);
        resolve({
          generate: (payload, onChunk) => generateInWorker(worker, payload, onChunk)
        });
      } else if (d.type === "error" && d.scope === "init") {
        worker.removeEventListener("message", onMessage);
        reject(new Error(d.message || "CPU/WASM AI initialization failed"));
      }
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage({ type: "init", model: LOCAL_MODEL.id, language });
  }).catch(err => { aiWorkerPromise = null; throw err; });
  return aiWorkerPromise;
}

function generateInWorker(worker, payload, onChunk) {
  return new Promise((resolve, reject) => {
    const id = ++aiRequestId;
    const handler = (event) => {
      const d = event.data || {};
      if (d.id !== id) return;
      if (d.type === "chunk") onChunk?.(d.text || "");
      else if (d.type === "done") {
        worker.removeEventListener("message", handler);
        resolve(d.text || "");
      } else if (d.type === "error") {
        worker.removeEventListener("message", handler);
        reject(new Error(d.message || "CPU/WASM generation failed"));
      }
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ type: "generate", id, ...payload });
  });
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
function historyWithSystem(history, system) {
  return [{ role: "system", content: system }, ...history];
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
  const loading = addMessage("ai", language === "ja" ? "考えています…" : "Thinking…", false);
  try {
    // Stable no-GPU mode: use the server-side no-API response engine.
    // This intentionally does not initialize WebGPU, Transformers.js, WASM, or a Worker.
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: c.messages.slice(-30), language })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Chat request failed");
    const answer = String(d.text || "").trim();
    if (!answer) throw new Error(language === "ja" ? "回答を受け取れませんでした。" : "No response was received.");
    loading.querySelector(".bubble").textContent = answer;
    c.messages.push({ role: "assistant", content: answer });
    save();
    const status = document.querySelector("#localAiStatus");
    if (status) status.textContent = language === "ja"
      ? "安定モード（WebGPU不要・CPU負荷が小さい）で動作中"
      : "Stable mode active (no WebGPU, low CPU load)";
  } catch (e) {
    loading.querySelector(".bubble").textContent = language === "ja"
      ? `回答できませんでした。\n${e.message}`
      : `I couldn't answer that.\n${e.message}`;
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

  try {
    const tf = await getTransformers();
    add(language === "ja" ? "Transformers.js" : "Transformers.js", "3.8.1 / loaded");
    add(language === "ja" ? "モデル" : "Model", LOCAL_MODEL.id);
    add(language === "ja" ? "実行方式" : "Execution", "WASM / CPU");
  } catch (err) {
    overall = "error";
    add(language === "ja" ? "Transformers.js読み込み" : "Transformers.js load", `ERROR ${err?.message || err}`);
  }
  try {
    const origin = location.origin;
    add(language === "ja" ? "ALIFO AIのオリジン" : "ALIFO AI origin", origin);
    add(language === "ja" ? "診断時刻" : "Diagnostic time", new Date().toISOString());
  } catch {}

  add(language === "ja" ? "ALIFO AIのAI方式" : "ALIFO AI runtime", "Transformers.js / ONNX Runtime Web / WASM (CPU)");
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
