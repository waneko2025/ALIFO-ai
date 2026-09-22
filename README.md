# ALIFO AI v2.8 — Local AI

前版でローカルAIの初期化に失敗した場合に原因を切り分けやすくした版です。

## 変更点
- WebLLMをビルド時にバンドル（実行時のesm.run importなし）
- WebGPU adapterを明示的に確認
- WebLLMの公式prebuilt構成に含まれる Llama-3.2-1B-Instruct-q4f16_1-MLC を使用
- 初回モデル取得は約900MBの目安
- 失敗時は既存の軽量モードへフォールバック
- APIキー不要・有料AI API不要

## Render
Build Command: `npm install`
Start Command: `npm start`

`postinstall` でVite buildを実行します。

## 注意
ローカルAIはユーザーのブラウザのWebGPU/GPUを使います。初回はモデルのダウンロードが必要です。端末やブラウザのGPU環境によってはローカルAIが起動せず、軽量モードに切り替わる場合があります。
