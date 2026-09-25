# Jev プレイグラウンド

TypeSafe AI の判断モデル **Jev** をブラウザで試すための小さなアプリです（Next.js / Vercel）。

質問と答えの候補を書くと、Jev がそれぞれの候補の確率を返します。

例：「日本で一番高い山は？」→ 富士山 / 北岳 / 奥穂高岳 の確率

## APIキー

次の優先順で使われます。OpenRouter 経由でも Jev を実行できます。

| 優先 | 設定 | 接続先 |
|---|---|---|
| 1 | 環境変数 `TYPESAFE_API_KEY` | `https://api.typesafe.ai/v1/systemone` |
| 2 | 環境変数 `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1/systemone` |
| 3 | 画面のキー欄に入力（`sk-or-` で始まれば OpenRouter 扱い。ブラウザの localStorage にのみ保存） | 上記いずれか |

任意: `TYPESAFE_DEFAULT_MODEL`（既定 `jev-latest`）、`TYPESAFE_BASE_URL`（既定 `https://api.typesafe.ai`）。

> サーバー側にキーを設定すると、URLを知っている人は誰でもそのキーで実行できます。

## ローカル実行

```bash
cd frontend
npm install
OPENROUTER_API_KEY=sk-or-... npm run dev
# http://localhost:3000
```

## 構成

```
frontend/
  app/page.tsx          画面（プレイグラウンド）
  app/api/jev/route.ts  Jev API へのプロキシ（キーをブラウザに出さない）
```
