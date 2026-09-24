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


## v5.4 AI fallback
AI response priority is: external Puter AI → WebGPU local model → CPU/WASM local model → built-in server fallback. No OpenAI API key is required. The local model is loaded from the public Hugging Face model repository through Transformers.js.

## AI fallback order

ALIFO AI attempts replies in this order:

1. External AI (Puter)
2. WebGPU local model
3. CPU/WASM local model
4. Built-in server fallback

If external AI registration/login is refused, the connection fails, or the external request times out, ALIFO AI automatically continues to the local model. If WebGPU generation itself fails after initialization, it explicitly restarts the local model in CPU/WASM mode before using the built-in server fallback.


## v6.2: Puter AI + ローカルAI 自動フォールバック

この版では、Puter.jsを最初のAI経路として使用します。ALIFO AI側にOpenAI/Gemini/ClaudeのAPIキーを保存しません。Puterが公開しているモデル一覧から、GPT系 → Gemini系 → Claude系の順に利用を試し、利用できなければ端末内AIへ自動で切り替えます。

AIの順番:
1. Puter経由のGPT系モデル
2. Puter経由のGemini系モデル
3. Puter経由のClaude系モデル
4. WebGPUで端末内モデル
5. CPU/WASMで端末内モデル
6. サーバー内の軽量フォールバック

事実確認が重要な質問では、GPT系モデルが利用可能な場合にPuterのWeb検索機能を使用します。Web検索を実行できない場合は、AIに推測で断定しないよう指示します。

Puter自体が利用できない場合、Puter経由のGPT/Gemini/Claudeも利用できないため、端末内AIへ切り替えます。Puterとは独立したChatGPT/Gemini/ClaudeのAPIを追加する場合は、それぞれの正式なAPI接続が必要です。

※画像生成は従来どおり外部画像サービスを利用します。


## v6.4 independent official AI fallbacks

Puter remains first. If Puter is unavailable, the server can optionally try official direct connections in this order: OpenAI (ChatGPT models) → Google Gemini → Anthropic Claude. These are independent of Puter. They are disabled unless the corresponding server-side environment variables are configured. API keys are never sent to the browser. If no direct provider is configured or all direct providers fail, ALIFO AI continues to WebGPU → CPU/WASM → built-in fallback.

Configure optional server-side variables: `OPENAI_API_KEY`, `OPENAI_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`.


## v6.5 — no direct provider API keys
- Puter AI is the external AI layer: GPT → Gemini → Claude.
- No OpenAI/Gemini/Anthropic API keys are used by ALIFO AI.
- If Puter is unavailable, ALIFO AI falls back to WebGPU, then CPU/WASM, then a conservative built-in fallback.
- Local-model answers are rejected when they appear unrelated to the user's current question.
- For factual/current questions, the final fallback refuses to guess instead of inventing an answer.


## v6.7
- Fixed a client-side `textOf is not defined` error in the relevance guard.
- Replaced raw internal errors in the chat bubble with a simple user-facing message.


## v6.8 timeout adjustment
- Puter AI response timeout: 45 seconds
- Local AI initialization timeout: 90 seconds
- Local AI generation timeout: 60 seconds
- Built-in server fallback timeout: 30 seconds
These longer limits are intended to prevent slow model startup/downloads from being treated as failures too early.


## v7.0: Puter model auto-discovery

ALIFO AI now calls `puter.ai.listModels()` and `puter.ai.listModelProviders()` to discover the models/providers currently exposed by Puter. It does not invent or assume a model ID: the selected GPT, Gemini, or Claude model must come from the live catalog. The settings panel shows the discovered model count/providers and can refresh the catalog manually.

Puter's official documentation states that `puter.ai.listModels()` returns model IDs and providers currently available to the app.
