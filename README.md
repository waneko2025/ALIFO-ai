# ALIFO AI v2.7 — Local AI bundle

ALIFO AIを、CDNからWebLLMを実行時に読み込む方式から、`@mlc-ai/web-llm` をビルド時にバンドルする方式へ変更した版です。

## 特徴
- APIキー不要
- 有料AI API不要
- WebGPU対応ブラウザ上でローカルLLMを実行
- 初回だけモデルのダウンロードが必要
- WebLLMの実行時CDN import（esm.run / esm.sh / jsdelivr）を使用しない
- WebGPUが使えない場合は既存の軽量モードへフォールバック
- 日本語 / English 切替
- 画像生成・画像添付機能を維持

## Render
現在のRender設定が `npm install` → `npm start` の場合でも動くよう、`postinstall` でVite buildを実行します。

推奨:
- Build Command: `npm install`
- Start Command: `npm start`

またはBuild Commandを `npm install && npm run build` にしても構いません。

## 注意
ローカルLLMはユーザーの端末GPUで動きます。初回はモデルファイルのダウンロードが必要で、端末性能によって速度が変わります。
