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


## v3.4
- WebLLMの公式 `prebuiltAppConfig` を明示的に使用。
- Llama 3.2 1Bを先に使用し、初期化できない場合はSmolLM2 360Mへフォールバック。
- 生成パラメータを安定寄りに調整し、記号だけの異常出力を検出した場合は軽量モードへ切り替えます。
