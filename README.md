# ALIFO AI — 無料画像生成版

ALIFO AIの無料スマートチャットに、OpenAI APIキーを使わない画像生成ボタンを追加した版です。

## 特徴
- テキスト会話：APIキー不要の無料スマートモード
- 画像生成：Pollinationsの画像URL方式を利用
- OpenAI APIキー：不要
- APIキーをGitHubに保存する必要なし

## 重要
画像生成サービスの無料・匿名利用、レート制限、モデル、利用条件は提供元の仕様変更によって変わる場合があります。画像が生成できない場合は、Renderのログとブラウザの表示を確認してください。

## Render
Build Command: `npm install`
Start Command: `npm start`

環境変数の `OPENAI_API_KEY` は、この版では不要です。以前設定したものがあっても、この画像生成機能では使用しません。

## 画像生成の仕組み
ブラウザから `/api/image` に画像の説明を送り、サーバーがPollinationsの画像URLを作成します。生成画像そのものは外部サービスからブラウザに読み込まれます。
