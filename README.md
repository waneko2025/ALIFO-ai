# ALIFO AI — APIキー不要版 v1.3

ALIFO AI は、APIキーなしで公開できる無料モードのWebアプリです。

## 特徴

- APIキー不要
- 外部AI APIへの接続なし
- API料金なし
- チャット機能
- 🖼️ ローカル画像作成機能
- Render / GitHub で公開可能

### 画像作成について

この版の画像ボタンは、外部の画像生成AIを呼び出さず、ブラウザ/サーバー上でSVG画像を作成します。
そのため本物の生成AIによる画像生成ではありませんが、APIキーなしで動作します。

## Render

Build Command:
```text
npm install
```

Start Command:
```text
npm start
```

Environment Variables は基本的に不要です。

必要なら `PORT` のみ設定できますが、Render では通常自動設定されるため設定不要です。

## GitHub

`.env` はコミットしないでください。
APIキーはこのバージョンでは使用しません。
