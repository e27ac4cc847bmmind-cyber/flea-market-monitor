"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus,
  Trash2,
  Play,
  KeyRound,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Sparkles,
  ArrowLeft,
  Info,
  Loader2,
} from "lucide-react";

// ==================== 型定義 ====================
type QType = "noul" | "choice" | "score";

interface ChoiceOption {
  label: string;
  desc: string;
}

interface QuestionDraft {
  uid: string;
  name: string;
  type: QType;
  instructions: string;
  yesDesc: string; // noul
  noDesc: string; // noul
  options: ChoiceOption[]; // choice
  levels: string[]; // score（0から順）
}

interface Template {
  title: string;
  emoji: string;
  state: string;
  stateMode: "text" | "json";
  questions: Omit<QuestionDraft, "uid">[];
}

type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | {
      type: "score";
      score: number;
      confidence: number;
      legend: Record<string, unknown>;
      probabilities: Record<string, number>;
    };

interface RunResult {
  ok: boolean;
  status: number;
  latency_ms?: number;
  request_id?: string | null;
  demo?: boolean;
  provider?: "typesafe" | "openrouter";
  body: unknown;
}

// ==================== テンプレート ====================
const blank = (type: QType, name = ""): Omit<QuestionDraft, "uid"> => ({
  name,
  type,
  instructions: "",
  yesDesc: "",
  noDesc: "",
  options:
    type === "choice"
      ? [
          { label: "", desc: "" },
          { label: "", desc: "" },
        ]
      : [],
  levels: type === "score" ? ["", "", ""] : [],
});

const TEMPLATES: Template[] = [
  {
    title: "問い合わせ振り分け",
    emoji: "📨",
    stateMode: "text",
    state: "先月分が二重に請求されています。至急返金してください。対応がなければ解約を考えます。",
    questions: [
      {
        ...blank("choice", "category"),
        instructions: "この問い合わせの種類は？",
        options: [
          { label: "billing", desc: "請求・支払い・返金" },
          { label: "technical", desc: "不具合・使い方" },
          { label: "account", desc: "ログイン・契約変更" },
          { label: "other", desc: "その他" },
        ],
      },
      {
        ...blank("noul", "churn_risk"),
        instructions: "顧客は解約をほのめかしているか？",
      },
    ],
  },
  {
    title: "フリマ出品チェック",
    emoji: "🛍️",
    stateMode: "json",
    state: JSON.stringify(
      {
        title: "Nintendo Switch 本体 ジャンク 画面割れ",
        price: 8000,
        description: "電源は入りますが画面にヒビがあります。付属品なし。ノークレームノーリターンでお願いします。",
      },
      null,
      2
    ),
    questions: [
      {
        ...blank("noul", "is_junk"),
        instructions: "この商品はジャンク品・故障品か？",
      },
      {
        ...blank("score", "condition"),
        instructions: "商品の状態を評価して",
        levels: ["動作しない・部品取り", "大きな傷や不具合あり", "使用感あり", "目立った傷なし", "新品・未使用"],
      },
      {
        ...blank("choice", "category"),
        instructions: "商品カテゴリは？",
        options: [
          { label: "game", desc: "ゲーム機・ソフト" },
          { label: "electronics", desc: "家電・PC・スマホ" },
          { label: "fashion", desc: "衣類・バッグ" },
          { label: "other", desc: "その他" },
        ],
      },
    ],
  },
  {
    title: "レビュー感情スコア",
    emoji: "⭐",
    stateMode: "text",
    state: "配送は早かったけど、箱が潰れていて少しがっかり。中身は問題なく動いています。",
    questions: [
      {
        ...blank("score", "sentiment"),
        instructions: "このレビューの満足度は？",
        levels: ["とても不満", "不満", "普通", "満足", "とても満足"],
      },
      {
        ...blank("noul", "mentions_shipping"),
        instructions: "配送・梱包について言及しているか？",
      },
    ],
  },
  {
    title: "障害エスカレーション",
    emoji: "🚨",
    stateMode: "text",
    state: "直近3回のデプロイが失敗し、本番環境で500エラーが返り続けています。",
    questions: [
      {
        ...blank("noul", "needs_human"),
        instructions: "今すぐ人間にエスカレーションすべきか？",
        yesDesc: "ユーザー影響があり即対応が必要",
        noDesc: "自動復旧や後回しで問題ない",
      },
      {
        ...blank("score", "severity"),
        instructions: "深刻度は？",
        levels: ["影響なし", "軽微", "一部ユーザーに影響", "全ユーザーに影響"],
      },
    ],
  },
];

// ==================== ユーティリティ ====================
let uidCounter = 0;
const newUid = () => `q${Date.now().toString(36)}${(uidCounter++).toString(36)}`;
const withUid = (q: Omit<QuestionDraft, "uid">): QuestionDraft => ({ ...q, uid: newUid() });

const TYPE_META: Record<QType, { label: string; hint: string; color: string }> = {
  noul: { label: "はい/いいえ", hint: "Yesの確率(0〜1)を返す", color: "bg-emerald-100 text-emerald-700" },
  choice: { label: "選択", hint: "選択肢から1つ選ぶ（最大255）", color: "bg-sky-100 text-sky-700" },
  score: { label: "スコア", hint: "段階評価（2〜10段階）の期待値", color: "bg-amber-100 text-amber-700" },
};

const orNull = (s: string) => (s.trim() === "" ? null : s.trim());

function buildQuestions(drafts: QuestionDraft[]): { questions: Record<string, unknown>; error: string | null } {
  const questions: Record<string, unknown> = {};
  for (let i = 0; i < drafts.length; i++) {
    const q = drafts[i];
    const name = q.name.trim();
    const where = `質問${i + 1}`;
    if (!name) return { questions, error: `${where}: 名前（キー）を入力してください` };
    if (questions[name]) return { questions, error: `${where}: 名前「${name}」が重複しています` };
    if (q.type === "noul") {
      const yes = orNull(q.yesDesc);
      const no = orNull(q.noDesc);
      questions[name] = {
        type: "noul",
        instructions: orNull(q.instructions),
        ...(yes || no ? { criteria: { true: yes, false: no } } : {}),
      };
    } else if (q.type === "choice") {
      const opts = q.options.filter((o) => o.label.trim());
      if (opts.length < 2) return { questions, error: `${where}: 選択肢を2つ以上入力してください` };
      const labels = new Set<string>();
      const criteria: Record<string, string | null> = {};
      for (const o of opts) {
        const l = o.label.trim();
        if (labels.has(l)) return { questions, error: `${where}: 選択肢「${l}」が重複しています` };
        labels.add(l);
        criteria[l] = orNull(o.desc);
      }
      questions[name] = { type: "choice", instructions: orNull(q.instructions), criteria };
    } else {
      if (q.levels.length < 2 || q.levels.length > 10)
        return { questions, error: `${where}: スコアは2〜10段階にしてください` };
      questions[name] = { type: "score", instructions: orNull(q.instructions), criteria: q.levels.map(orNull) };
    }
  }
  if (Object.keys(questions).length === 0) return { questions, error: "質問を1つ以上追加してください" };
  return { questions, error: null };
}

function parseState(text: string, mode: "text" | "json"): { state: unknown; error: string | null } {
  if (mode === "text") return { state: text, error: null };
  try {
    return { state: JSON.parse(text), error: null };
  } catch (e) {
    return { state: null, error: `状態のJSONが不正です: ${(e as Error).message}` };
  }
}

// デモモード用：入力から決定的に擬似確率を作る（実際のJevの判断ではない）
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function demoAnswers(state: unknown, questions: Record<string, any>) {
  const answers: Record<string, Answer> = {};
  for (const [name, q] of Object.entries(questions)) {
    const rnd = hash(JSON.stringify(state) + name);
    if (q.type === "noul") {
      answers[name] = { type: "noul", noul: rnd() };
    } else {
      const keys = q.type === "choice" ? Object.keys(q.criteria) : q.criteria.map((_: unknown, i: number) => String(i));
      const w = keys.map(() => Math.pow(rnd(), 3));
      const sum = w.reduce((a: number, b: number) => a + b, 0);
      const probs: Record<string, number> = {};
      keys.forEach((k: string, i: number) => (probs[k] = w[i] / sum));
      const best = keys.reduce((a: string, b: string) => (probs[a] >= probs[b] ? a : b));
      if (q.type === "choice") {
        answers[name] = { type: "choice", choice: best, confidence: probs[best], probabilities: probs };
      } else {
        const legend: Record<string, unknown> = {};
        keys.forEach((k: string, i: number) => (legend[k] = q.criteria[i]));
        const score = keys.reduce((a: number, k: string) => a + Number(k) * probs[k], 0);
        answers[name] = { type: "score", score, confidence: probs[best], legend, probabilities: probs };
      }
    }
  }
  return { model: "demo（ダミー）", answers, usage: { input_tokens: 0, output_tokens: 0 } };
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const KEY_STORAGE = "jev-playground-key";
const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k) || "";
  } catch {
    return "";
  }
};
const safeSet = (k: string, v: string) => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {}
};

// ==================== 結果表示 ====================
function Bar({ value, highlight }: { value: number; highlight?: boolean }) {
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex-1">
      <div
        className={`h-full rounded-full transition-all duration-500 ${highlight ? "bg-indigo-500" : "bg-gray-300"}`}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

function AnswerCard({ name, answer, draft }: { name: string; answer: Answer; draft?: QuestionDraft }) {
  const meta = TYPE_META[answer.type];
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}>{meta.label}</span>
        <span className="font-mono text-sm font-semibold text-gray-800">{name}</span>
      </div>
      {draft?.instructions && <p className="text-xs text-gray-500 mb-3">{draft.instructions}</p>}

      {answer.type === "noul" && (
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-2xl font-bold ${answer.noul >= 0.5 ? "text-emerald-600" : "text-rose-600"}`}>
              {answer.noul >= 0.5 ? "はい" : "いいえ"}
            </span>
            <span className="text-sm text-gray-500">Yesの確率 {pct(answer.noul)}</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden flex bg-rose-200">
            <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: pct(answer.noul) }} />
          </div>
          <div className="flex justify-between text-[11px] text-gray-400 mt-1">
            <span>はい</span>
            <span>いいえ</span>
          </div>
        </div>
      )}

      {answer.type === "choice" && (
        <div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-bold text-indigo-600 font-mono">{answer.choice}</span>
            <span className="text-sm text-gray-500">確信度 {pct(answer.confidence)}</span>
          </div>
          <div className="space-y-1.5">
            {Object.entries(answer.probabilities)
              .sort((a, b) => b[1] - a[1])
              .map(([label, p]) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  <span className="w-24 truncate font-mono text-gray-700">{label}</span>
                  <Bar value={p} highlight={label === answer.choice} />
                  <span className="w-12 text-right text-gray-500 tabular-nums">{pct(p)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {answer.type === "score" && (
        <div>
          {(() => {
            const keys = Object.keys(answer.probabilities).sort((a, b) => Number(a) - Number(b));
            const max = Math.max(1, keys.length - 1);
            const nearest = String(Math.round(answer.score));
            const legendText = (k: string) => {
              const v = answer.legend?.[k];
              return v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
            };
            return (
              <>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-2xl font-bold text-amber-600 tabular-nums">{answer.score.toFixed(2)}</span>
                  <span className="text-sm text-gray-500">
                    / {max}（確信度 {pct(answer.confidence)}）
                  </span>
                </div>
                {legendText(nearest) && <p className="text-sm text-gray-700 mb-2">≒ {legendText(nearest)}</p>}
                <div className="relative h-2 bg-gradient-to-r from-rose-200 via-amber-200 to-emerald-200 rounded-full mb-3">
                  <div
                    className="absolute -top-1 w-4 h-4 bg-white border-2 border-amber-500 rounded-full -ml-2 transition-all duration-500"
                    style={{ left: `${(answer.score / max) * 100}%` }}
                  />
                </div>
                <div className="space-y-1.5">
                  {keys.map((k) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <span className="w-5 text-gray-400 tabular-nums">{k}</span>
                      <span className="w-28 truncate text-gray-700">{legendText(k) || "—"}</span>
                      <Bar value={answer.probabilities[k]} highlight={k === nearest} />
                      <span className="w-12 text-right text-gray-500 tabular-nums">{pct(answer.probabilities[k])}</span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ==================== 質問エディタ ====================
function QuestionEditor({
  q,
  index,
  onChange,
  onRemove,
}: {
  q: QuestionDraft;
  index: number;
  onChange: (q: QuestionDraft) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<QuestionDraft>) => onChange({ ...q, ...patch });
  const changeType = (type: QType) => {
    const b = blank(type);
    set({
      type,
      options: q.options.length ? q.options : b.options,
      levels: q.levels.length ? q.levels : b.levels,
    });
  };
  const input = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-400">#{index + 1}</span>
        <input
          className={`${input} font-mono flex-1`}
          placeholder="名前（例: is_urgent）"
          value={q.name}
          onChange={(e) => set({ name: e.target.value.replace(/\s/g, "_") })}
        />
        <button onClick={onRemove} className="p-2 text-gray-400 hover:text-rose-500" aria-label="質問を削除">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 bg-gray-100 p-1 rounded-lg">
        {(Object.keys(TYPE_META) as QType[]).map((t) => (
          <button
            key={t}
            onClick={() => changeType(t)}
            className={`text-xs py-1.5 rounded-md transition ${
              q.type === t ? "bg-white shadow-sm font-semibold text-gray-900" : "text-gray-500"
            }`}
          >
            {TYPE_META[t].label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 -mt-1">{TYPE_META[q.type].hint}</p>

      <input
        className={input}
        placeholder="質問文（例: 至急対応が必要か？）"
        value={q.instructions}
        onChange={(e) => set({ instructions: e.target.value })}
      />

      {q.type === "noul" && (
        <div className="grid grid-cols-2 gap-2">
          <input
            className={input}
            placeholder="「はい」の説明（任意）"
            value={q.yesDesc}
            onChange={(e) => set({ yesDesc: e.target.value })}
          />
          <input
            className={input}
            placeholder="「いいえ」の説明（任意）"
            value={q.noDesc}
            onChange={(e) => set({ noDesc: e.target.value })}
          />
        </div>
      )}

      {q.type === "choice" && (
        <div className="space-y-2">
          {q.options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={`${input} font-mono w-2/5`}
                placeholder={`ラベル${i + 1}`}
                value={o.label}
                onChange={(e) => {
                  const options = [...q.options];
                  options[i] = { ...o, label: e.target.value };
                  set({ options });
                }}
              />
              <input
                className={input}
                placeholder="説明（任意）"
                value={o.desc}
                onChange={(e) => {
                  const options = [...q.options];
                  options[i] = { ...o, desc: e.target.value };
                  set({ options });
                }}
              />
              <button
                onClick={() => set({ options: q.options.filter((_, j) => j !== i) })}
                className="px-2 text-gray-300 hover:text-rose-500"
                aria-label="選択肢を削除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {q.options.length < 255 && (
            <button
              onClick={() => set({ options: [...q.options, { label: "", desc: "" }] })}
              className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
            >
              <Plus size={12} /> 選択肢を追加
            </button>
          )}
        </div>
      )}

      {q.type === "score" && (
        <div className="space-y-2">
          {q.levels.map((lv, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="w-5 text-xs text-gray-400 tabular-nums text-right">{i}</span>
              <input
                className={input}
                placeholder={i === 0 ? "最低段階の説明（例: とても悪い）" : i === q.levels.length - 1 ? "最高段階の説明（例: とても良い）" : `段階${i}の説明`}
                value={lv}
                onChange={(e) => {
                  const levels = [...q.levels];
                  levels[i] = e.target.value;
                  set({ levels });
                }}
              />
              <button
                onClick={() => q.levels.length > 2 && set({ levels: q.levels.filter((_, j) => j !== i) })}
                disabled={q.levels.length <= 2}
                className="px-2 text-gray-300 hover:text-rose-500 disabled:opacity-30"
                aria-label="段階を削除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {q.levels.length < 10 && (
            <button
              onClick={() => set({ levels: [...q.levels, ""] })}
              className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
            >
              <Plus size={12} /> 段階を追加
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== メイン ====================
export default function JevPlayground() {
  const [stateText, setStateText] = useState(TEMPLATES[0].state);
  const [stateMode, setStateMode] = useState<"text" | "json">(TEMPLATES[0].stateMode);
  const [drafts, setDrafts] = useState<QuestionDraft[]>(() => TEMPLATES[0].questions.map(withUid));
  const [activeTemplate, setActiveTemplate] = useState(0);

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [serverKey, setServerKey] = useState(false);
  const [provider, setProvider] = useState<"typesafe" | "openrouter" | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("jev-latest");
  const [demo, setDemo] = useState(false);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasKey = serverKey || apiKey.trim() !== "";

  const loadModels = useCallback(async (key: string) => {
    try {
      const res = await fetch("/api/jev", { headers: key ? { "x-jev-key": key } : {} });
      const data = await res.json();
      setServerKey(!!data.server_key);
      setProvider(data.provider ?? null);
      if (data.default_model) setModel((m) => (m === "jev-latest" ? data.default_model : m));
      const list = data?.body?.models;
      if (Array.isArray(list)) setModels(list.map((m: { name?: string }) => m.name).filter((n: unknown): n is string => typeof n === "string"));
    } catch {}
  }, []);

  useEffect(() => {
    const saved = safeGet(KEY_STORAGE);
    setApiKey(saved);
    loadModels(saved);
  }, [loadModels]);

  useEffect(() => {
    setDemo(!hasKey);
  }, [hasKey]);

  const applyTemplate = (i: number) => {
    const t = TEMPLATES[i];
    setActiveTemplate(i);
    setStateText(t.state);
    setStateMode(t.stateMode);
    setDrafts(t.questions.map(withUid));
    setResult(null);
    setInputError(null);
  };

  const built = useMemo(() => {
    const s = parseState(stateText, stateMode);
    const q = buildQuestions(drafts);
    return { state: s.state, questions: q.questions, error: s.error || q.error };
  }, [stateText, stateMode, drafts]);

  const payload = useMemo(
    () => ({ model, state: built.state, questions: built.questions }),
    [model, built]
  );

  const run = useCallback(async () => {
    if (built.error) {
      setInputError(built.error);
      return;
    }
    setInputError(null);
    setRunning(true);
    setResult(null);
    try {
      if (demo) {
        await new Promise((r) => setTimeout(r, 400));
        setResult({ ok: true, status: 200, demo: true, latency_ms: 0, body: demoAnswers(built.state, built.questions) });
      } else {
        const res = await fetch("/api/jev", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(apiKey ? { "x-jev-key": apiKey } : {}) },
          body: JSON.stringify(payload),
        });
        setResult(await res.json());
      }
    } catch (e) {
      setResult({ ok: false, status: 0, body: { error: (e as Error).message } });
    } finally {
      setRunning(false);
    }
  }, [built, demo, apiKey, payload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);

  const saveKey = (v: string) => {
    setApiKey(v);
    safeSet(KEY_STORAGE, v.trim());
  };

  const code = useMemo(() => {
    const json = JSON.stringify(payload, null, 2);
    const viaOR = provider === "openrouter" || (!serverKey && apiKey.trim().startsWith("sk-or-"));
    const url = viaOR ? "https://openrouter.ai/api/v1/systemone" : "https://api.typesafe.ai/v1/systemone";
    const env = viaOR ? "OPENROUTER_API_KEY" : "TYPESAFE_API_KEY";
    return `curl ${url} \\
  -H "Authorization: Bearer $${env}" \\
  -H "Content-Type: application/json" \\
  -d '${json.replace(/'/g, "'\\''")}'`;
  }, [payload, provider, serverKey, apiKey]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const body = result?.body as
    | { model?: string; answers?: Record<string, Answer>; usage?: { input_tokens: number; output_tokens: number } }
    | undefined;
  const answers = result?.ok ? body?.answers : undefined;
  const errorText = result && !result.ok ? errorMessage(result) : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <a href="/" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-1">
            <ArrowLeft size={12} /> 買い物ウォッチへ戻る
          </a>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="text-indigo-500" size={22} /> Jev プレイグラウンド
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            テキストを渡して「質問」を定義すると、Jevが型付きの判断（はい/いいえ・選択・スコア）を確率つきで返します
          </p>
        </div>
      </div>

      {/* 接続設定 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <KeyRound size={16} className="text-gray-400 shrink-0" />
            {serverKey ? (
              <span className="text-sm text-emerald-600">
                サーバーの{provider === "openrouter" ? "OpenRouter" : "TypeSafe"}キーを使用中
              </span>
            ) : (
              <>
                <input
                  type={showKey ? "text" : "password"}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="OpenRouterキー（sk-or-…）またはTypeSafeキー"
                  value={apiKey}
                  onChange={(e) => saveKey(e.target.value)}
                  onBlur={() => apiKey && loadModels(apiKey)}
                />
                <button onClick={() => setShowKey((v) => !v)} className="text-xs text-gray-400 hover:text-gray-600">
                  {showKey ? "隠す" : "表示"}
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">モデル</span>
            <input
              list="jev-models"
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono w-40 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <datalist id="jev-models">
              {["jev-latest", ...models.filter((m) => m !== "jev-latest")].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={demo}
              onChange={(e) => setDemo(e.target.checked)}
              disabled={!hasKey}
              className="accent-indigo-600"
            />
            <span className={hasKey ? "text-gray-700" : "text-gray-400"}>デモモード</span>
          </label>
        </div>
        {!hasKey && (
          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
            <Info size={12} /> APIキー未設定のためデモモード（ダミー結果）で動作します。キーはこのブラウザにのみ保存されます。
          </p>
        )}
      </div>

      {/* テンプレート */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
        {TEMPLATES.map((t, i) => (
          <button
            key={t.title}
            onClick={() => applyTemplate(i)}
            className={`shrink-0 text-sm px-3 py-1.5 rounded-full border transition ${
              activeTemplate === i
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
            }`}
          >
            {t.emoji} {t.title}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* 左: 入力 */}
        <div className="space-y-4">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-700">① 判断材料（state）</h2>
              <div className="flex gap-1 bg-gray-100 p-0.5 rounded-md">
                {(["text", "json"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setStateMode(m)}
                    className={`text-xs px-2 py-0.5 rounded ${stateMode === m ? "bg-white shadow-sm font-semibold" : "text-gray-500"}`}
                  >
                    {m === "text" ? "テキスト" : "JSON"}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              className={`w-full h-36 border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                stateMode === "json" ? "font-mono text-xs" : ""
              }`}
              value={stateText}
              onChange={(e) => setStateText(e.target.value)}
              placeholder="判断してほしい文章やデータ"
            />
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="text-sm font-semibold text-gray-700">② 質問（questions）</h2>
              <div className="flex gap-1">
                {(Object.keys(TYPE_META) as QType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setDrafts((d) => [...d, withUid(blank(t, `q${d.length + 1}`))])}
                    className={`text-xs px-2 py-1 rounded-md flex items-center gap-0.5 whitespace-nowrap ${TYPE_META[t].color} hover:opacity-80`}
                  >
                    <Plus size={12} />
                    {TYPE_META[t].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {drafts.map((q, i) => (
                <QuestionEditor
                  key={q.uid}
                  q={q}
                  index={i}
                  onChange={(nq) => setDrafts((d) => d.map((x) => (x.uid === q.uid ? nq : x)))}
                  onRemove={() => setDrafts((d) => d.filter((x) => x.uid !== q.uid))}
                />
              ))}
              {drafts.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6 border border-dashed rounded-xl">
                  上のボタンから質問を追加してください
                </p>
              )}
            </div>
          </section>
        </div>

        {/* 右: 実行と結果 */}
        <div className="space-y-4 lg:sticky lg:top-4 self-start">
          <button
            onClick={run}
            disabled={running}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition"
          >
            {running ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
            {running ? "判断中…" : demo ? "デモ実行" : "Jevに聞く"}
            <span className="text-xs font-normal opacity-70 hidden sm:inline">Ctrl/⌘ + Enter</span>
          </button>

          {inputError && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-700 text-sm">{inputError}</div>
          )}
          {errorText && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-700 text-sm break-words">
              {errorText}
            </div>
          )}

          {answers && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <h2 className="text-sm font-semibold text-gray-700">③ 結果</h2>
                {result?.demo && (
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">デモ：ランダムなダミー値</span>
                )}
                {body?.model && <span className="font-mono">{body.model}</span>}
                {!result?.demo && result?.provider && (
                  <span>via {result.provider === "openrouter" ? "OpenRouter" : "TypeSafe"}</span>
                )}
                {!result?.demo && result?.latency_ms != null && <span>{result.latency_ms} ms</span>}
                {!result?.demo && body?.usage && (
                  <span>
                    tokens in {body.usage.input_tokens} / out {body.usage.output_tokens}
                  </span>
                )}
              </div>
              {Object.entries(answers).map(([name, a]) => (
                <AnswerCard key={name} name={name} answer={a} draft={drafts.find((d) => d.name.trim() === name)} />
              ))}
            </section>
          )}

          {!answers && !errorText && !running && (
            <div className="text-center text-sm text-gray-400 border border-dashed rounded-xl py-10">
              テンプレートを選ぶか、判断材料と質問を入力して実行してください
            </div>
          )}

          {result && (
            <div className="bg-white rounded-xl border border-gray-200">
              <button
                onClick={() => setShowRaw((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-600"
              >
                レスポンスJSON {showRaw ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showRaw && (
                <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-b-xl overflow-x-auto max-h-80">
                  {JSON.stringify(result.body, null, 2)}
                </pre>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200">
            <button
              onClick={() => setShowCode((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-600"
            >
              このリクエストをcurlで再現 {showCode ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showCode && (
              <div className="relative">
                <button
                  onClick={copy}
                  className="absolute top-2 right-2 text-gray-300 hover:text-white p-1"
                  aria-label="コピー"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-b-xl overflow-x-auto max-h-80">{code}</pre>
              </div>
            )}
          </div>

          <details className="text-xs text-gray-500 bg-white rounded-xl border border-gray-200 px-4 py-2">
            <summary className="cursor-pointer text-sm text-gray-600">Jevとは？</summary>
            <ul className="list-disc pl-4 mt-2 space-y-1">
              <li>TypeSafe AI の「System One」モデル。文章を生成せず、決められた答えの型で判断だけを返す</li>
              <li>はい/いいえ（noul）：Yesの確率 0〜1</li>
              <li>選択（choice）：選んだラベル＋各ラベルの確率＋確信度</li>
              <li>スコア（score）：段階評価の期待値（小数）＋各段階の確率</li>
              <li>分類・ルーティング・緊急度判定・人間レビュー要否などの繰り返し判断向け</li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}

function errorMessage(r: RunResult): string {
  const b = r.body as any;
  const detail =
    typeof b === "string"
      ? b
      : b?.error?.message || b?.error || b?.detail || b?.message || (b ? JSON.stringify(b) : "");
  const hint =
    r.status === 401
      ? "（APIキーを確認してください）"
      : r.status === 429
        ? "（レート制限です。少し待って再実行）"
        : r.status === 422 || r.status === 400
          ? "（質問の形式を確認してください）"
          : "";
  return `エラー ${r.status || ""}: ${typeof detail === "string" ? detail : JSON.stringify(detail)} ${hint}`.slice(0, 600);
}
