# ALIFO AI 完成版

日本語/英語切り替え、AIチャット、新規チャット、履歴、設定を備えたサイトです。

## 起動
1. Node.jsを用意
2. `npm install`
3. `.env.example` を `.env` にコピー
4. `.env` に `OPENAI_API_KEY` と `OPENAI_MODEL` を設定
5. `npm start`
6. `http://localhost:3000` を開く

APIキーはブラウザのコードには入れず、サーバー側の `.env` に置いてください。
履歴はこのサンプルではブラウザの localStorage に保存します。
