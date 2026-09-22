# ALIFO AI v2.5 — 端末内AI版

ALIFO AIのテキスト会話を、APIキーなし・従量課金なしで動かせるようにした実験版です。

## 仕組み

WebLLMを使い、オープンモデルをユーザーのブラウザ内でWebGPU実行します。会話テキストはこのAI処理のために外部のLLM APIへ送信しません。WebLLMはブラウザ内推論を提供し、モデルは初回利用時にダウンロードされます。

- デスクトップ: Qwen2.5 1.5B Instruct（対応モデルが利用可能な場合）
- モバイル: Qwen2.5 0.5B Instruct
- APIキー不要
- AI APIの月額/従量課金不要
- 初回はモデルのダウンロードが必要
- WebGPU非対応端末ではローカルAIを起動できません

## 注意

モデルのダウンロードサイズ・速度は端末や通信環境によって変わります。特にスマートフォンではメモリやGPU性能によって動作しない場合があります。

画像添付は現在のUIで表示・保存できますが、この端末内テキストモデルは画像そのものを解析しません。画像認識を追加する場合は別の対応モデルが必要です。

## 起動

```
npm install
npm start
```

WebLLMはCDNから読み込みます。


## v2.6 hotfix
- WebLLM CDN loading now tries multiple public module CDNs.
- If the WebLLM module cannot be loaded, chat automatically falls back to the existing no-API smart reply engine instead of showing a fatal error.
- The UI remains usable even when a CDN or network temporarily fails.
