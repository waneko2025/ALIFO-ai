let generator = null;
let loadingPromise = null;
let transformers = null;

const MODEL_DEFAULT = "onnx-community/Qwen2.5-0.5B-Instruct";

async function loadTransformers() {
  if (!transformers) {
    transformers = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm");
    transformers.env.allowRemoteModels = true;
    transformers.env.allowLocalModels = false;
    transformers.env.useBrowserCache = true;
  }
  return transformers;
}

async function init(model = MODEL_DEFAULT, language = "ja") {
  if (generator) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const { pipeline } = await loadTransformers();
    generator = await pipeline("text-generation", model, {
      device: "wasm",
      dtype: "q4",
      progress_callback: (p) => {
        self.postMessage({ type: "progress", status: p?.status || "", progress: p?.progress ?? null, file: p?.file || "" });
      }
    });
    self.postMessage({ type: "ready", language });
  })();
  try { await loadingPromise; }
  finally { loadingPromise = null; }
}

self.onmessage = async (event) => {
  const d = event.data || {};
  try {
    if (d.type === "init") {
      await init(d.model || MODEL_DEFAULT, d.language || "ja");
      return;
    }
    if (d.type === "generate") {
      if (!generator) await init(MODEL_DEFAULT, "ja");
      let output = "";
      const { TextStreamer } = await loadTransformers();
      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (piece) => {
          output += piece;
          self.postMessage({ type: "chunk", id: d.id, text: piece });
        }
      });
      await generator(d.messages, {
        max_new_tokens: Math.min(Number(d.max_new_tokens || 256), 256),
        do_sample: false,
        streamer,
        return_full_text: false
      });
      self.postMessage({ type: "done", id: d.id, text: output });
    }
  } catch (err) {
    self.postMessage({ type: "error", scope: d.type === "init" ? "init" : "generate", id: d.id, message: err?.message || String(err) });
  }
};
