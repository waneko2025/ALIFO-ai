# ALIFO AI v4.1 — Stable No-GPU Mode

WebGPU/Transformers.js/WASMの自動起動を停止し、チャットはサーバー側の無料・APIキー不要の軽量モードで処理します。

目的は、CPUモデルによるブラウザの「ページが応答しません」を避け、まずチャットを安定して使える状態に戻すことです。

- WebGPU不要
- ブラウザで重いAIモデルを読み込まない
- APIキー不要
- Render Freeでも動作可能
- 画像生成機能は既存のまま

注意: この安定モードはクラウドLLMではなく、サーバー側のルールベース軽量回答です。


## v4.2
送信中に入力文字が消えないようにし、失敗時は入力内容を復元します。

## v4.3
- Fixed missing application state initialization that caused chat history and messages to disappear.
- Preserves `alifo_chats` localStorage data when valid.
- Stable server chat mode; no WebGPU/CPU model initialization.
