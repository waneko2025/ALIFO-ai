import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/+esm";

env.allowLocalModels = false;
env.useBrowserCache = true;

let generator = null;
let runtime = "cpu";
let modelId = "onnx-community/Qwen2.5-0.5B-Instruct";

async function hasWebGPU() {
  try {
    return !!(self.navigator?.gpu && await self.navigator.gpu.requestAdapter({ powerPreference: "high-performance" }));
  } catch { return false; }
}

async function init(msg) {
  modelId = msg.model || modelId;
  const gpu = await hasWebGPU();
  const attempts = msg.forceWasm ? ["wasm"] : (gpu ? ["webgpu", "wasm"] : ["wasm"]);
  let lastError = null;
  for (const device of attempts) {
    try {
      runtime = device === "webgpu" ? "webgpu" : "cpu";
      postMessage({ type: "progress", progress: 1, runtime });
      generator = await pipeline("text-generation", modelId, {
        device: device === "webgpu" ? "webgpu" : "wasm",
        dtype: "q4",
        progress_callback: (p) => {
          const value = typeof p?.progress === "number" ? p.progress : 0;
          postMessage({ type: "progress", progress: Math.max(1, Math.min(99, value)), runtime });
        }
      });
      postMessage({ type: "ready", runtime });
      return;
    } catch (e) {
      lastError = e;
      generator = null;
      if (device === "webgpu") postMessage({ type: "progress", progress: 0, runtime: "cpu" });
    }
  }
  postMessage({ type: "error", scope: "init", runtime, message: lastError?.message || "Local AI initialization failed" });
}

function makePrompt(messages = []) {
  const safe = messages.filter(m => m && (m.role === "system" || m.role === "user" || m.role === "assistant"))
    .slice(-12).map(m => ({ role: m.role, content: String(m.content || "").slice(0, 5000) }));
  if (generator?.tokenizer?.apply_chat_template) {
    return generator.tokenizer.apply_chat_template(safe, { tokenize: false, add_generation_prompt: true });
  }
  return safe.map(m => `${m.role}: ${m.content}`).join("\n") + "\nassistant:";
}

async function generate(msg) {
  if (!generator) throw new Error("Local AI is not initialized");
  const prompt = makePrompt(msg.messages || []);
  const out = await generator(prompt, { max_new_tokens: 320, temperature: 0.7, do_sample: true, return_full_text: false });
  let text = Array.isArray(out) ? out[0]?.generated_text : out?.generated_text;
  if (Array.isArray(text)) text = text.at(-1)?.content || text.at(-1)?.text || "";
  text = String(text || "").trim();
  postMessage({ type: "done", id: msg.id, text, runtime });
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.type === "init") await init(msg);
    else if (msg.type === "generate") await generate(msg);
  } catch (e) {
    postMessage({ type: "error", id: msg.id, scope: msg.type, runtime, message: e?.message || String(e) });
  }
};
