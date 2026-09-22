# ALIFO AI v2.9 — Local AI diagnostic/fallback build

- API key不要
- WebLLMをViteでバンドル
- ブラウザ内WebGPUでローカルLLMを実行
- Llama 3.2 1Bを最初に試し、起動できない場合はSmolLM2 360Mへ自動フォールバック
- WebGPU自体が使えない場合は既存の軽量モードを使用

## Render
Build Command: `npm install`
Start Command: `npm start`

`postinstall`でVite buildが実行され、`dist/`が生成されます。
