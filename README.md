# ALIFO AI v3.0

- WebLLM is bundled with Vite at build time; no runtime esm.run import.
- Render runs `npm install`, which triggers the Vite build via `postinstall`.
- Express serves the generated `dist/` directory.
- On-device chat uses WebLLM and Llama-3.2-1B-Instruct-q4f16_1-MLC.
- If WebGPU/model startup fails, the app falls back to the existing lightweight chat mode and shows the exact reason.

## Render
Build Command: `npm install`
Start Command: `npm start`


## v3.1
WebLLM model/WASM download hosts are allowed in the Content-Security-Policy, including raw.githubusercontent.com, github.com, and objects.githubusercontent.com.


## v3.2 修正
- WebAssembly実行に必要な `wasm-unsafe-eval` をCSPへ追加
- SPAフォールバックも `dist/index.html` を配信


## v3.3
SmolLM2 360M q4f32_1 を先に試し、失敗時にLlama 3.2 1Bへフォールバック。初回モデル準備の進捗と12分タイムアウトを表示します。


## v3.4 Fast mode
- Uses SmolLM2 360M as the primary on-device model for lower download and runtime cost.
- Streams generated text into the chat as it arrives.
- Uses shorter chat history and a smaller output limit to reduce latency.
- Falls back to the existing server-side lightweight reply mode if local inference fails.


## v3.5
- Japanese chat uses Llama 3.2 1B q4f16 for more stable Japanese generation.
- Uses WebLLM's official prebuilt model configuration and browser Cache API.
- Keeps streaming output and repetition controls for responsive generation.


## v3.6 WebGPU診断
設定画面の「WebGPU診断を実行」から、WebGPU API、Secure Context、GPUアダプター、GPU情報、主要なWebGPU制限値を確認できます。結果はコピーできます。モデルのダウンロードやAPIキーは不要です。


## v3.7 CPU/WASM mode

ALIFO AI v3.7 does not require WebGPU for text chat. It uses Hugging Face Transformers.js with ONNX Runtime Web and explicitly selects the WASM/CPU backend. The first chat downloads and caches the Qwen2.5-0.5B-Instruct ONNX model; later sessions can reuse the browser cache. WebGPU is not required for text chat.

The model is served from the Hugging Face Hub and is licensed separately; see its model card for details.


## v3.8 CPU/WASM mode

This version does not require WebGPU or the `@huggingface/transformers` npm package at build time. Transformers.js 3.8.1 is loaded from jsDelivr in the browser and inference is explicitly set to WASM/CPU. The model is downloaded from Hugging Face and cached by the browser.


## v3.9 CPU/WASM stable
- Text chat is explicitly fixed to Transformers.js + ONNX Runtime Web WASM/CPU.
- No WebGPU adapter is requested by the chat path.
- Uses onnx-community/Qwen2.5-0.5B-Instruct with q4 weights.
- Adds CPU/WASM runtime diagnostics for WebAssembly, browser storage, network, and Transformers.js loading.
- Model loading has a 15-minute timeout and the existing server lightweight fallback keeps chat usable if local inference cannot start.

## v4.0
CPU/WASM inference runs in a Web Worker so model loading and generation do not freeze the page UI. WebGPU is not used.
