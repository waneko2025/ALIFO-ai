# ALIFO AI v3.0

- WebLLM is bundled with Vite at build time; no runtime esm.run import.
- Render runs `npm install`, which triggers the Vite build via `postinstall`.
- Express serves the generated `dist/` directory.
- On-device chat uses WebLLM and Llama-3.2-1B-Instruct-q4f16_1-MLC.
- If WebGPU/model startup fails, the app falls back to the existing lightweight chat mode and shows the exact reason.

## Render
Build Command: `npm install`
Start Command: `npm start`
