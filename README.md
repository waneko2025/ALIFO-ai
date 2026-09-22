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

## v4.6
- Added a lightweight server-side factual answer engine using Wikipedia's public API.
- Keeps the stable no-WebGPU chat mode as a fallback.
- No API key and no local model are required.
- Existing chat history, settings, image generation, and language switching remain in place.


### v4.6
- 改善: 「富士山について、小学生にも分かるように説明して」のような質問から、実際の主題だけを抽出してWikipedia検索するよう修正。


## v4.7
- 短い新しい話題（例: 「お金」「火星」）を会話の続きと誤認せず、知識検索として処理します。
- 「それ」「もっと詳しく」などの明確な続きは従来どおり会話コンテキストとして処理します。
- 小学生向けの回答では文章を短く区切ります。


## v4.8
- Explicit new-task requests such as 「作文を作って」 no longer inherit the previous conversation context.
- Added a lightweight response for essay-writing requests.


## v4.9
- New explicit tasks such as 「作文を作って」 no longer inherit the previous topic.
- Added a dedicated essay-request response.

## v5.0
- Writing-topic context now takes priority over factual Wikipedia lookup.
- A topic such as 「夏休みの思い出」 after 「作文を作って」 is treated as an essay topic instead of a factual search.


## v5.2 — APIキー不要の外部AI

ALIFO AIのチャットをPuter.js経由の外部AIに変更しました。サイト側でOpenAI APIキーやPollinationsのAPIキーを設定する必要はありません。Puter.jsはブラウザ上でユーザーの認証・AI利用を処理します。

- GPT-5.6 Lunaを利用
- ALIFO AI側にAPIキーを保存しない
- Renderの環境変数にAIキーを登録しなくてよい
- WebGPUや重いブラウザ内LLMをチャット処理に使わない
- Puter側でログインが必要になる場合があります
- Puterの無料枠・利用条件・レート制限はPuter側の最新仕様に従います

参考: https://docs.puter.com/AI/ および https://docs.puter.com/user-pays-model/


### v5.3
- ヘッダーに「外部AI接続中」ステータスを表示します。
- Puter.js の利用可能状態・接続中・エラーを日本語/英語で表示します。
