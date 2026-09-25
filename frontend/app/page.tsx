"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings, X, Loader2, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

// ==================== 型 ====================
type Kind = "yesno" | "choice" | "scale";

interface Task {
  id: string;
  emoji: string;
  title: string;
  sub: string;
  kind: Kind;
  question: string;
  options?: string[]; // choice: 選択肢 / scale: 低い→高い の段階
  examples: string[];
}

type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; probabilities: Record<string, number> };

// ==================== お題 ====================
const TASKS: Task[] = [
  {
    id: "review",
    emoji: "😊",
    title: "レビューの評価",
    sub: "感想が好評か不評かを5段階で",
    kind: "scale",
    question: "このレビューを書いた人の満足度は？",
    options: ["とても不満", "不満", "普通", "満足", "とても満足"],
    examples: [
      "配送は早かったけど、箱が潰れていて少しがっかり。中身は問題なく動いています。",
      "最高です！想像以上の品質で、家族にも勧めました。",
      "説明と全然違う商品が届きました。二度と買いません。",
    ],
  },
  {
    id: "inquiry",
    emoji: "📨",
    title: "問い合わせの仕分け",
    sub: "どの担当に回すべきか",
    kind: "choice",
    question: "この問い合わせは何についての内容？",
    options: ["請求・支払い・返金", "不具合・使い方", "ログイン・アカウント", "その他"],
    examples: [
      "先月分が二重に請求されています。至急返金してください。",
      "アプリを開くと真っ白な画面のまま動きません。",
      "パスワードを忘れてログインできなくなりました。",
    ],
  },
  {
    id: "urgent",
    emoji: "🚨",
    title: "急ぎかどうか",
    sub: "すぐ対応すべき内容か",
    kind: "yesno",
    question: "この内容は今すぐ対応が必要か？",
    examples: [
      "本番サーバーが落ちていて、全ユーザーがログインできません！",
      "来月あたりに、デザインを少し変えられたら嬉しいです。",
      "決済エラーが続いていて、注文が一件も通りません。",
    ],
  },
  {
    id: "spam",
    emoji: "🗑️",
    title: "スパム判定",
    sub: "迷惑メッセージかどうか",
    kind: "yesno",
    question: "これは迷惑メッセージ（スパム・詐欺）か？",
    examples: [
      "おめでとうございます！100万円が当選しました。こちらのURLから今すぐ受け取ってください。",
      "明日の打ち合わせ、10時から会議室Bでお願いします。",
      "【重要】アカウントが停止されました。24時間以内にカード情報を再入力してください。",
    ],
  },
  {
    id: "condition",
    emoji: "🛍️",
    title: "中古品の状態",
    sub: "出品説明から状態を推定",
    kind: "scale",
    question: "この商品の状態はどのくらい良い？",
    options: ["動かない・部品取り", "大きな傷や不具合あり", "使用感あり", "目立った傷なし", "新品・未使用"],
    examples: [
      "Nintendo Switch 本体。電源は入りますが画面にヒビがあります。付属品なし。",
      "購入後一度だけ使用しました。箱・説明書すべて揃っています。",
      "数年使っていたので細かい傷は多いですが、動作は問題ありません。",
    ],
  },
];

const CUSTOM_ID = "custom";

// ==================== ユーティリティ ====================
const pct = (v: number) => `${Math.round(v * 100)}%`;
const optKey = (i: number) => `option_${i + 1}`;

// Jev へ送る質問を組み立てる（選択肢は安全なキー名にして、中身は説明として渡す）
function toQuestion(kind: Kind, question: string, options: string[]) {
  if (kind === "yesno") return { type: "noul", instructions: question };
  if (kind === "choice") {
    const criteria: Record<string, string> = {};
    options.forEach((o, i) => (criteria[optKey(i)] = o));
    return { type: "choice", instructions: question, criteria };
  }
  return { type: "score", instructions: question, criteria: options };
}

// キー未設定時のダミー結果（本物の判定ではない）
function fakeAnswer(kind: Kind, text: string, n: number): Answer {
  let h = 7;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  const r = () => ((h = (h * 1103515245 + 12345) >>> 0) % 1000) / 1000;
  if (kind === "yesno") return { type: "noul", noul: r() };
  const w = Array.from({ length: n }, () => Math.pow(r(), 3) + 0.01);
  const s = w.reduce((a, b) => a + b, 0);
  const probs: Record<string, number> = {};
  w.forEach((x, i) => (probs[kind === "choice" ? optKey(i) : String(i)] = x / s));
  const best = Object.keys(probs).reduce((a, b) => (probs[a] >= probs[b] ? a : b));
  if (kind === "choice") return { type: "choice", choice: best, confidence: probs[best], probabilities: probs };
  const score = Object.entries(probs).reduce((a, [k, p]) => a + Number(k) * p, 0);
  return { type: "score", score, confidence: probs[best], probabilities: probs };
}

const KEY_STORAGE = "jev-playground-key";
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) || "";
    } catch {
      return "";
    }
  },
  set: (k: string, v: string) => {
    try {
      if (v) localStorage.setItem(k, v);
      else localStorage.removeItem(k);
    } catch {}
  },
};

// ==================== 結果表示 ====================
function Result({ answer, kind, options, fake }: { answer: Answer; kind: Kind; options: string[]; fake: boolean }) {
  let headline = "";
  let confidence = 0;
  let color = "text-indigo-600";
  let rows: { label: string; p: number; top: boolean }[] = [];

  if (answer.type === "noul") {
    const yes = answer.noul >= 0.5;
    headline = yes ? "はい" : "いいえ";
    confidence = yes ? answer.noul : 1 - answer.noul;
    color = yes ? "text-emerald-600" : "text-rose-600";
    rows = [
      { label: "はい", p: answer.noul, top: yes },
      { label: "いいえ", p: 1 - answer.noul, top: !yes },
    ];
  } else if (answer.type === "choice") {
    const idx = Number(answer.choice.replace("option_", "")) - 1;
    headline = options[idx] ?? answer.choice;
    confidence = answer.confidence;
    rows = Object.entries(answer.probabilities)
      .map(([k, p]) => ({ label: options[Number(k.replace("option_", "")) - 1] ?? k, p, top: k === answer.choice }))
      .sort((a, b) => b.p - a.p);
  } else {
    const n = Math.round(answer.score);
    headline = options[n] ?? String(n);
    confidence = answer.confidence;
    color = "text-amber-600";
    rows = options.map((o, i) => ({ label: o, p: answer.probabilities[String(i)] ?? 0, top: i === n }));
  }

  const sure = confidence >= 0.8 ? "かなり自信あり" : confidence >= 0.6 ? "まあまあ自信あり" : "迷っている";

  return (
    <div className="bg-white rounded-2xl border-2 border-indigo-100 p-5 shadow-sm">
      {fake && (
        <p className="text-xs bg-amber-50 text-amber-700 rounded-lg px-3 py-2 mb-4">
          ⚠️ お試し表示です（ランダムなダミー結果）。本物のJevで判定するには右上の⚙からキーを設定してください。
        </p>
      )}
      <p className="text-sm text-gray-500">Jevの判定</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{headline}</p>
      <p className="text-sm text-gray-500 mt-1">
        確信度 {pct(confidence)}（{sure}）
      </p>

      {kind === "scale" && answer.type === "score" && (
        <div className="mt-4">
          <div className="relative h-3 rounded-full bg-gradient-to-r from-rose-300 via-amber-200 to-emerald-300">
            <div
              className="absolute -top-1 w-5 h-5 -ml-2.5 bg-white border-2 border-gray-700 rounded-full transition-all duration-700"
              style={{ left: `${(answer.score / Math.max(1, options.length - 1)) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-gray-400 mt-1">
            <span>{options[0]}</span>
            <span>{options[options.length - 1]}</span>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-2">
        <p className="text-xs text-gray-400">それぞれの可能性</p>
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 text-sm">
            <span className={`w-36 shrink-0 truncate ${r.top ? "font-semibold text-gray-900" : "text-gray-500"}`}>
              {r.label}
            </span>
            <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${r.top ? "bg-indigo-500" : "bg-gray-300"}`}
                style={{ width: pct(r.p) }}
              />
            </div>
            <span className="w-10 text-right text-gray-500 tabular-nums">{pct(r.p)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
      <span className="inline-flex w-6 h-6 rounded-full bg-indigo-600 text-white text-xs items-center justify-center">
        {n}
      </span>
      {children}
    </h2>
  );
}

// ==================== メイン ====================
export default function Home() {
  const [taskId, setTaskId] = useState(TASKS[0].id);
  const [text, setText] = useState(TASKS[0].examples[0]);

  // 自分で作る
  const [cQuestion, setCQuestion] = useState("");
  const [cKind, setCKind] = useState<Kind>("yesno");
  const [cOptions, setCOptions] = useState("");

  // 設定
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [serverKey, setServerKey] = useState<null | "typesafe" | "openrouter">(null);
  const [model, setModel] = useState("jev-latest");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ answer: Answer; kind: Kind; options: string[]; fake: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [raw, setRaw] = useState<{ request: unknown; response: unknown } | null>(null);

  const task = TASKS.find((t) => t.id === taskId);
  const isCustom = taskId === CUSTOM_ID;
  const hasKey = serverKey !== null || apiKey.trim() !== "";

  useEffect(() => {
    setApiKey(store.get(KEY_STORAGE));
    fetch("/api/jev")
      .then((r) => r.json())
      .then((d) => setServerKey(d.server_key ? d.provider : null))
      .catch(() => {});
  }, []);

  const pickTask = (id: string) => {
    setTaskId(id);
    setResult(null);
    setError(null);
    setRaw(null);
    const t = TASKS.find((x) => x.id === id);
    setText(t ? t.examples[0] : "");
  };

  const run = useCallback(async () => {
    setError(null);
    setResult(null);
    if (!text.trim()) return setError("判定したい文章を入力してください");

    let kind: Kind, question: string, options: string[];
    if (isCustom) {
      kind = cKind;
      question = cQuestion.trim();
      if (!question) return setError("質問を入力してください");
      options =
        cKind === "yesno"
          ? []
          : cOptions
              .split(/[,、，\n]/)
              .map((s) => s.trim())
              .filter(Boolean);
      if (cKind === "scale" && options.length === 0) options = ["とても低い", "低い", "普通", "高い", "とても高い"];
      if (cKind === "choice" && options.length < 2) return setError("選択肢を2つ以上、「、」区切りで入力してください");
      if (cKind === "scale" && (options.length < 2 || options.length > 10)) return setError("段階は2〜10個にしてください");
    } else {
      kind = task!.kind;
      question = task!.question;
      options = task!.options ?? [];
    }

    const request = { model, state: text.trim(), questions: { answer: toQuestion(kind, question, options) } };
    setLoading(true);
    try {
      if (!hasKey) {
        await new Promise((r) => setTimeout(r, 500));
        setResult({ answer: fakeAnswer(kind, text, options.length), kind, options, fake: true });
        setRaw({ request, response: "（お試し表示のためAPIは呼んでいません）" });
        return;
      }
      const res = await fetch("/api/jev", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { "x-jev-key": apiKey } : {}) },
        body: JSON.stringify(request),
      });
      const data = await res.json();
      setRaw({ request, response: data.body });
      const answer = data?.body?.answers?.answer;
      if (!data.ok || !answer) {
        setError(friendlyError(data.status, data.body));
        return;
      }
      setResult({ answer, kind, options, fake: false });
    } catch (e) {
      setError(`通信に失敗しました: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [text, isCustom, cKind, cQuestion, cOptions, task, model, hasKey, apiKey]);

  const input =
    "mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-16">
      {/* ヘッダー */}
      <header className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="text-indigo-500" size={22} /> Jev を試す
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            文章を入れると、AIが「はい/いいえ」「どれに当てはまるか」「どのくらいか」を判定します
          </p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-500 shrink-0"
          aria-label="設定"
        >
          <Settings size={20} />
        </button>
      </header>

      {!hasKey && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 mb-6">
          今は<b>お試し表示</b>（ダミー結果）です。本物で試すには右上の ⚙ からキーを入れてください。
        </div>
      )}

      {/* ① お題 */}
      <section className="mb-6">
        <StepTitle n={1}>何を判定する？</StepTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[...TASKS, { id: CUSTOM_ID, emoji: "✏️", title: "自分で質問を作る", sub: "好きな質問でOK" }].map((t) => (
            <button
              key={t.id}
              onClick={() => pickTask(t.id)}
              className={`text-left rounded-xl border-2 p-3 transition ${
                taskId === t.id ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white hover:border-indigo-200"
              }`}
            >
              <div className="text-2xl">{t.emoji}</div>
              <div className="font-semibold text-sm text-gray-900 mt-1">{t.title}</div>
              <div className="text-xs text-gray-500">{t.sub}</div>
            </button>
          ))}
        </div>

        {task && (
          <p className="text-sm text-gray-600 mt-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
            Jevへの質問：<b>{task.question}</b>
            {task.options && (
              <span className="block text-xs text-gray-400 mt-1">答えの候補：{task.options.join(" / ")}</span>
            )}
          </p>
        )}

        {isCustom && (
          <div className="mt-3 bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <label className="block">
              <span className="text-sm text-gray-700">質問</span>
              <input
                className={input}
                placeholder="例：この文章は怒っている？"
                value={cQuestion}
                onChange={(e) => setCQuestion(e.target.value)}
              />
            </label>
            <div>
              <span className="text-sm text-gray-700">答え方</span>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(
                  [
                    ["yesno", "はい / いいえ"],
                    ["choice", "選択肢から選ぶ"],
                    ["scale", "段階で評価"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setCKind(k)}
                    className={`text-sm rounded-lg border py-2 ${
                      cKind === k ? "border-indigo-500 bg-indigo-50 font-semibold" : "border-gray-300 text-gray-600"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {cKind !== "yesno" && (
              <label className="block">
                <span className="text-sm text-gray-700">
                  {cKind === "choice" ? "選択肢（「、」区切り）" : "段階（低い→高い順に「、」区切り。空欄なら5段階）"}
                </span>
                <input
                  className={input}
                  placeholder={cKind === "choice" ? "例：喜び、怒り、悲しみ、その他" : "例：全然、少し、かなり"}
                  value={cOptions}
                  onChange={(e) => setCOptions(e.target.value)}
                />
              </label>
            )}
          </div>
        )}
      </section>

      {/* ② 文章 */}
      <section className="mb-6">
        <StepTitle n={2}>判定したい文章</StepTitle>
        <textarea
          className="w-full h-32 border border-gray-300 rounded-xl p-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-200"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ここに文章を貼り付け"
        />
        {task && (
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs text-gray-400 self-center">例文：</span>
            {task.examples.map((ex, i) => (
              <button
                key={i}
                onClick={() => {
                  setText(ex);
                  setResult(null);
                }}
                className={`text-xs rounded-full px-3 py-1 border ${
                  text === ex
                    ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                例{i + 1}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ③ 実行 */}
      <StepTitle n={3}>ボタンを押す</StepTitle>
      <button
        onClick={run}
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-lg font-bold rounded-2xl py-4 flex items-center justify-center gap-2 shadow-md transition"
      >
        {loading ? <Loader2 className="animate-spin" size={22} /> : "判定する"}
      </button>

      <div className="mt-6 space-y-4">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3 break-words">
            {error}
          </div>
        )}
        {result && <Result {...result} />}

        {raw && (
          <div>
            <button
              onClick={() => setShowDetail((v) => !v)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              {showDetail ? <ChevronUp size={14} /> : <ChevronDown size={14} />} 開発者向け：送った内容と生の返事
            </button>
            {showDetail && (
              <pre className="mt-2 text-xs bg-gray-900 text-gray-100 p-3 rounded-xl overflow-x-auto max-h-96">
                {`// 送信\n${JSON.stringify(raw.request, null, 2)}\n\n// 返事\n${JSON.stringify(raw.response, null, 2)}`}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* 設定 */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-10"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">設定</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400" aria-label="閉じる">
                <X size={20} />
              </button>
            </div>
            {serverKey ? (
              <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                ✅ サーバーの{serverKey === "openrouter" ? "OpenRouter" : "TypeSafe"}キーを使用中。設定は不要です。
              </p>
            ) : (
              <label className="block">
                <span className="text-sm text-gray-700">APIキー</span>
                <input
                  type="password"
                  className={`${input} font-mono`}
                  placeholder="sk-or-...（OpenRouter）"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    store.set(KEY_STORAGE, e.target.value.trim());
                  }}
                />
                <span className="text-xs text-gray-400 mt-1 block">
                  OpenRouterのキー（sk-or-…）かTypeSafeのキー。このブラウザにだけ保存されます。
                </span>
              </label>
            )}
            <label className="block">
              <span className="text-sm text-gray-700">モデル</span>
              <select className={input} value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="jev-latest">jev-latest（最新）</option>
                <option value="jev-1.13">jev-1.13</option>
              </select>
            </label>
            <button
              onClick={() => setShowSettings(false)}
              className="w-full bg-indigo-600 text-white rounded-xl py-2.5 font-semibold"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function friendlyError(status: number, body: unknown): string {
  const b = body as any;
  const detail = typeof b === "string" ? b : b?.error?.message || b?.error || b?.message || JSON.stringify(b ?? "");
  const hint =
    status === 401
      ? "キーが正しくないようです。⚙ から確認してください。"
      : status === 402
        ? "OpenRouterのクレジットが不足しています。"
        : status === 429
          ? "混み合っています。少し待ってからもう一度押してください。"
          : "判定に失敗しました。";
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  return `${hint}（${status}: ${d.slice(0, 200)}）`;
}
