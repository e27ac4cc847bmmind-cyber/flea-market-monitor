# 🛍️ フリマ監視システム

メルカリ・ラクマ・PayPayフリマを定期監視し、条件に合う新着商品をDiscordに通知するシステムです。

## システム構成

```
┌─────────────────────────────────────────┐
│   管理UI（Next.js → Vercel）             │
│   キーワード設定・履歴確認               │
└────────────┬────────────────────────────┘
             │ config.json を GitHub API で読み書き
             ▼
┌─────────────────────────────────────────┐
│   GitHubリポジトリ                       │
│   config.json  ← 設定・履歴             │
│   seen_ids.json ← 既読管理             │
└────────────┬────────────────────────────┘
             │ 1分ごとにワークフロー実行
             ▼
┌─────────────────────────────────────────┐
│   GitHub Actions（Python スクリプト）    │
│   メルカリ・ラクマ・PayPayをスクレイピング│
│   → OpenRouter AI で判定               │
│   → Discord Webhook で通知             │
└─────────────────────────────────────────┘
```

## セットアップ手順（ゼロから動かすまで）

### 1. GitHubリポジトリ作成

1. [GitHub](https://github.com) にログイン
2. 右上「+」→「New repository」
3. Repository name: `flea-market-monitor`（任意）
4. Public または Private を選択
5. 「Create repository」をクリック

### 2. ローカルでリポジトリ初期化 & プッシュ

```bash
cd flea-market-monitor
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/flea-market-monitor.git
git push -u origin main
```

### 3. OpenRouter APIキー取得

1. [OpenRouter](https://openrouter.ai) にアクセス
2. 「Sign In」→ GoogleまたはGitHubでログイン
3. 右上アカウントメニュー → 「Keys」
4. 「Create Key」をクリック
5. 名前を入力（例: `flea-monitor`）→「Create」
6. 表示されたAPIキー（`sk-or-...`）をコピーして保管

> **注意**: DeepSeek V4 Flash は無料モデルなのでクレジット不要ですが、
> アカウント登録は必要です。

### 4. Discord Webhook URL取得

1. Discordを開き、通知を受け取りたいサーバー・チャンネルを選択
2. チャンネル名を右クリック →「チャンネルの編集」
3. 「連携サービス」→「ウェブフック」→「新しいウェブフック」
4. 名前を設定（例: `フリマ監視`）→「ウェブフックURLをコピー」
5. コピーしたURL（`https://discord.com/api/webhooks/...`）を保管

### 5. GitHub Actionsのシークレット登録

GitHubリポジトリの「Settings」→「Secrets and variables」→「Actions」→「New repository secret」で以下を登録：

| シークレット名 | 値 |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouterのAPIキー |
| `DISCORD_WEBHOOK_URL` | DiscordのWebhook URL |

> `GITHUB_TOKEN` はActionsに自動で付与されるため登録不要です。

### 6. Vercelデプロイ

1. [Vercel](https://vercel.com) にGitHubアカウントでサインイン
2. 「Add New...」→「Project」
3. GitHubリポジトリ一覧から `flea-market-monitor` を選択し「Import」
4. **Root Directory** を `frontend` に変更（重要！）
5. 「Environment Variables」を展開して以下を追加：

| 変数名 | 値 |
|---|---|
| `GITHUB_TOKEN` | GitHubの Personal Access Token（下記参照） |
| `GITHUB_OWNER` | あなたのGitHubユーザー名 |
| `GITHUB_REPO` | リポジトリ名（例: `flea-market-monitor`） |
| `GITHUB_BRANCH` | `main` |

6. 「Deploy」をクリック

**GitHub Personal Access Token（PAT）の作成：**
1. GitHubの「Settings」→「Developer settings」→「Personal access tokens」→「Tokens (classic)」
2. 「Generate new token (classic)」
3. Expiration: 必要な期間を設定
4. Scope: `repo` にチェック
5. 「Generate token」→ トークンをコピーして保管

### 7. GitHub Actions 1分実行の有効化

GitHubのActionsタブを開き、ワークフローが表示されていれば有効です。
手動テストは「Run workflow」ボタンから実行できます。

> **注意**: GitHub Actionsの`schedule`は最短1分ですが、
> 無料プランでは実際の実行間隔が遅れる場合があります。

---

## ローカルでのテスト方法

### Pythonスクリプトのテスト

```bash
# 依存パッケージインストール
pip install -r scripts/requirements.txt

# 環境変数設定（PowerShell）
$env:OPENROUTER_API_KEY = "sk-or-あなたのキー"
$env:DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/..."

# または環境変数設定（bash）
export OPENROUTER_API_KEY="sk-or-あなたのキー"
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."

# スクリプト実行
python scripts/monitor.py
```

### Next.js管理UIのローカル実行

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000 で開く
```

ローカル実行時はGitHub API環境変数が不要で、`../config.json` を直接読み書きします。

---

## キーワード設定の例

| キーワード | 用途 | 推奨設定 |
|---|---|---|
| `純銀 コイン` | 銀貨探し | 貴金属モードON / 閾値20% |
| `ゴールドバー 純金` | 金地金探し | 貴金属モードON / metal_type=gold |
| `iPhone 15 Pro` | スマホ | 貴金属モードOFF / 閾値30% |
| `ロレックス` | 時計 | 貴金属モードOFF / 閾値25% |

---

## トラブルシューティング

**Discord通知が来ない**
- Webhook URLが正しく設定されているか確認
- Actions の実行ログを確認（Actionsタブ → ワークフロー名）

**スクレイピングが0件**
- サイト側のDOM変更の可能性あり → Issueを開いてください
- User-Agentが弾かれている可能性 → スクリプトのUA一覧を更新

**AI判定が動かない**
- OpenRouterのAPIキーが正しいか確認
- OpenRouterのダッシュボードでエラーを確認
- `deepseek/deepseek-chat-v3-5k:free` モデルが利用可能か確認
