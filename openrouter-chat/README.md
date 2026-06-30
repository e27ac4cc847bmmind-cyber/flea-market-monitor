# OpenRouter Chat UI

OpenRouter API を使って、さまざまなAIモデルを試せる**完全フロントエンド**のチャットUIです。
バックエンド・ビルド不要。`index.html` 一枚で動作し、Netlify 等にそのまま置けます。

## 主な機能

- 🔐 **APIキーのパスワード暗号化保存** — Web Crypto API（PBKDF2 + AES-GCM）でAPIキーを暗号化し `localStorage` に保存。再訪時はパスワードで復号してアンロック。平文キーはメモリ上にのみ保持します。
- 🤖 **モデル動的取得 + 絞り込み** — `GET /api/v1/models` から一覧を取得。**無料モデルのみ / 画像対応モデルのみ / キーワード検索**で絞り込み可能。
- 💰 **コスト累計** — リクエストごとの実コスト（OpenRouter の `usage.cost`）を**モデル別**と**合計**で累積表示。
- 💬 **会話スレッド** — 複数ターンの履歴を `localStorage` に自動保存。リロードしても続きから会話できます。
- 🖼️ **画像入力（マルチモーダル）** — ファイル選択・ドラッグ&ドロップ・クリップボードのペーストに対応。base64 化して `image_url` 形式で送信。
- ⚡ **ストリーミング描画** — SSE をリアルタイムにパースし、回答を1文字ずつ表示。生成の途中停止も可能。
- 🎨 Tailwind CSS（CDN）によるシンプルでモダンなUI。

## ローカルで試す

`localhost` または HTTPS でないと Web Crypto API が使えないため、簡易サーバ経由で開きます。

```bash
cd openrouter-chat
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

OpenRouter のAPIキー（`sk-or-...`）は https://openrouter.ai のアカウントの **Keys** から取得できます。

## Netlify へのデプロイ

**方法A: ドラッグ&ドロップ**
1. https://app.netlify.com にログイン
2. `openrouter-chat` フォルダをデプロイ画面にドラッグ&ドロップ

**方法B: Git連携**
1. Netlify で対象リポジトリを連携
2. **Base directory** を `openrouter-chat` に設定（`netlify.toml` により publish=`.` / build なし）

## セキュリティについて

- APIキーは暗号化して保存されますが、**復号後の平文キーはブラウザのメモリ上に置かれ、OpenRouter への通信に直接使用**されます。共有端末での利用は避けてください。
- パスワードを忘れると保存済みキーは復号できません（「キーを削除」で再設定できます）。
- 会話履歴・画像・コスト累計はすべてその端末の `localStorage` に保存されます。

## 保存データ（localStorage キー）

| キー | 内容 |
| --- | --- |
| `or_chat_apikey_enc` | 暗号化されたAPIキー（salt / iv / data） |
| `or_chat_models` | モデル一覧キャッシュ |
| `or_chat_model` | 選択中モデルID |
| `or_chat_system` | システムプロンプト |
| `or_chat_history` | 会話履歴 |
| `or_chat_costs` | 累計コスト（合計・モデル別） |
| `or_chat_filters` | モデル絞り込み条件 |
