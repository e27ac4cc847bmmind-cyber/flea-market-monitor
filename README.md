# Jev プレイグラウンド

TypeSafe AI の判断モデル **Jev** をブラウザで試すための小さなアプリです（Next.js / Vercel）。

Jev は文章を生成せず、渡した「判断材料（state）」と「質問（questions）」に対して、決められた型の答えを確率つきで返します。

| 質問の型 | 返り値 |
|---|---|
| はい/いいえ（`noul`） | Yes の確率 0〜1 |
| 選択（`choice`） | 選んだラベル＋各ラベルの確率＋確信度（最大255択） |
| スコア（`score`） | 段階評価（2〜10段階）の期待値＋各段階の確率 |

## できること

- テンプレート4種（問い合わせ振り分け・フリマ出品チェック・レビュー感情・障害エスカレーション）
- 判断材料をテキスト or JSON で入力、質問をGUIで追加・編集
- 結果を確率バーで可視化、レスポンスJSON・同じリクエストの curl を表示
- APIキーがなければデモモード（ダミー値）で操作だけ確認可能

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
