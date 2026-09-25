"use client";

import { useState } from "react";
import { Plus, Trash2, Play, RefreshCw, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";

// ==================== 型定義 ====================
type QType = "noul" | "choice" | "score";

interface ChoiceOption {
  label: string;
  desc: string;
}

interface QuestionDraft {
  id: string;
  name: string;
  type: QType;
  instructions: string;
  yes: string;
  no: string;
  options: ChoiceOption[];
  levels: string[];
}

interface Answer {
  type: QType;
  noul?: number;
  choice?: string;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, unknown>;
}

interface JevResult {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
}

interface RunOutput {
  result: JevResult;
  elapsedMs: number;
  request: unknown;
  questions: QuestionDraft[];
}

const MODELS = ["typesafe/jev-1.13", "~typesafe/jev-latest"];
const USD_PER_MTOK = 0.042;

const TYPE_LABELS: Record<QType, { name: string; hint: string; color: string }> = {
  noul: { name: "Noul（Yes/No）", hint: "Yesの確率を0〜100%で返す", color: "bg-emerald-100 text-emerald-700" },
  choice: { name: "Choice（選択）", hint: "選択肢から1つ選び、全選択肢の確率を返す", color: "bg-blue-100 text-blue-700" },
  score: { name: "Score（段階評価）", hint: "2〜10段階で採点し、各段階の確率を返す", color: "bg-amber-100 text-amber-700" },
};

// ==================== 質問の生成 ====================
const newId = () => Math.random().toString(36).slice(2);

function draft(partial: Partial<QuestionDraft> & Pick<QuestionDraft, "name" | "type">): QuestionDraft {
  return {
    id: newId(),
    instructions: "",
    yes: "",
    no: "",
    options: [
      { label: "", desc: "" },
      { label: "", desc: "" },
    ],
    levels: ["", "", ""],
    ...partial,
  };
}

function toQuestion(q: QuestionDraft) {
  const instructions = q.instructions.trim() || null;
  if (q.type === "noul") {
    const criteria: Record<string, string> = {};
    if (q.yes.trim()) criteria.true = q.yes.trim();
    if (q.no.trim()) criteria.false = q.no.trim();
    return { type: "noul", instructions, ...(Object.keys(criteria).length ? { criteria } : {}) };
  }
  if (q.type === "choice") {
    const criteria = Object.fromEntries(
      q.options.filter((o) => o.label.trim()).map((o) => [o.label.trim(), o.desc.trim() || null])
    );
    return { type: "choice", instructions, criteria };
  }
  return { type: "score", instructions, criteria: q.levels.map((l) => l.trim() || null) };
}

function validate(questions: QuestionDraft[]): string | null {
  if (questions.length === 0) return "質問を1つ以上追加してください";
  const names = new Set<string>();
  for (const q of questions) {
    const name = q.name.trim();
    if (!name) return "質問名が空の質問があります";
    if (names.has(name)) return `質問名「${name}」が重複しています`;
    names.add(name);
    if (q.type === "choice") {
      const labels = q.options.map((o) => o.label.trim()).filter(Boolean);
      if (labels.length < 2) return `「${name}」: 選択肢を2つ以上入力してください`;
      if (new Set(labels).size !== labels.length) return `「${name}」: 選択肢名が重複しています`;
    }
    if (q.type === "score" && (q.levels.length < 2 || q.levels.length > 10)) {
      return `「${name}」: 段階は2〜10個にしてください`;
    }
  }
  return null;
}

function parseState(text: string): { value: unknown; isJson: boolean } {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      return { value: JSON.parse(t), isJson: true };
    } catch {
      // JSONとして不正ならテキストとして送る
    }
  }
  return { value: text, isJson: false };
}

// ==================== プリセット ====================
const PRESETS: { name: string; state: string; questions: () => QuestionDraft[] }[] = [
  {
    name: "🎁 全部盛り（3タイプ同時）",
    state: "先月申し込んだプランの料金が2回引き落とされています。至急返金してください。今週中に対応がなければ解約します。",
    questions: () => [
      draft({
        name: "intent",
        type: "choice",
        instructions: "問い合わせの種類はどれか？",
        options: [
          { label: "billing", desc: "請求・支払い・返金" },
          { label: "technical", desc: "エラー・不具合・ログイン" },
          { label: "sales", desc: "料金プラン・購入・アップグレード" },
          { label: "other", desc: "その他" },
        ],
      }),
      draft({
        name: "urgency",
        type: "score",
        instructions: "対応の緊急度は？",
        levels: ["急ぎではない", "数日以内でよい", "今日中に対応すべき", "今すぐ対応しないと損失が出る"],
      }),
      draft({
        name: "churn_risk",
        type: "noul",
        instructions: "この顧客は解約しそうか？",
        yes: "解約をほのめかしている、または強い不満がある",
        no: "継続利用の意思がある",
      }),
    ],
  },
  {
    name: "⭐ レビュー採点（Score）",
    state: "音質は値段の割にかなり良い。ただ3日でペアリングが切れるようになり、サポートの返事も遅かった。",
    questions: () => [
      draft({
        name: "stars",
        type: "score",
        instructions: "このレビューは星いくつ相当か？",
        levels: ["★1 最悪", "★2 不満", "★3 普通", "★4 満足", "★5 最高"],
      }),
      draft({
        name: "topic",
        type: "choice",
        instructions: "最も大きな不満点はどれか？",
        options: [
          { label: "品質", desc: "製品の性能・耐久性" },
          { label: "サポート", desc: "問い合わせ対応" },
          { label: "価格", desc: "値段" },
          { label: "なし", desc: "不満はない" },
        ],
      }),
    ],
  },
  {
    name: "🚫 スパム判定（Noul）",
    state: "【当選のお知らせ】あなたが10万円分のギフト券に当選しました！24時間以内に下のリンクからカード情報を入力してください。",
    questions: () => [
      draft({ name: "spam", type: "noul", instructions: "これは詐欺・スパムメッセージか？" }),
      draft({ name: "asks_payment_info", type: "noul", instructions: "支払い情報や個人情報の入力を求めているか？" }),
    ],
  },
  {
    name: "🧩 JSON入力（構造化データ）",
    state: JSON.stringify(
      { 商品名: "BenQ EW2880U 28インチ 4K モニター 箱なし", 価格: "18000円", 相場: "25000円", 検索キーワード: "4K モニター" },
      null,
      2
    ),
    questions: () => [
      draft({ name: "is_main_item", type: "noul", instructions: "検索キーワードの商品そのもの（本体）か？" }),
      draft({ name: "deal", type: "score", instructions: "相場と比べてどれくらいお得か？", levels: ["割高", "相場並み", "少しお得", "かなりお得"] }),
    ],
  },
];

// ==================== 結果表示 ====================
function Bar({ value, highlight }: { value: number; highlight?: boolean }) {
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex-1">
      <div
        className={`h-full rounded-full ${highlight ? "bg-indigo-500" : "bg-gray-300"}`}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function AnswerCard({ name, question, answer }: { name: string; question?: QuestionDraft; answer?: Answer }) {
  if (!answer) {
    return <div className="border rounded-lg bg-white p-3 text-sm text-red-500">「{name}」の回答がありません</div>;
  }
  const t = TYPE_LABELS[answer.type];

  return (
    <div className="border rounded-lg bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-bold text-gray-800">{name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${t?.color ?? "bg-gray-100"}`}>{t?.name ?? answer.type}</span>
        {answer.confidence !== undefined && (
          <span className="ml-auto text-xs text-gray-500">確信度 {pct(answer.confidence)}</span>
        )}
      </div>
      {question?.instructions && <p className="text-xs text-gray-500">{question.instructions}</p>}

      {answer.type === "noul" && answer.noul !== undefined && (
        <div className="space-y-1">
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${answer.noul >= 0.5 ? "text-emerald-600" : "text-gray-400"}`}>
              {pct(answer.noul)}
            </span>
            <span className="text-sm text-gray-500">で Yes</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden">
            <div className="bg-emerald-500" style={{ width: pct(answer.noul) }} />
            <div className="bg-rose-300 flex-1" />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Yes{question?.yes ? `: ${question.yes}` : ""}</span>
            <span>No{question?.no ? `: ${question.no}` : ""}</span>
          </div>
        </div>
      )}

      {answer.type === "choice" && answer.probabilities && (
        <div className="space-y-1.5">
          {Object.entries(answer.probabilities)
            .sort((a, b) => b[1] - a[1])
            .map(([label, p]) => {
              const chosen = label === answer.choice;
              return (
                <div key={label} className="flex items-center gap-2 text-sm">
                  <span className={`w-28 truncate ${chosen ? "font-bold text-indigo-700" : "text-gray-600"}`}>
                    {chosen ? "▶ " : ""}
                    {label}
                  </span>
                  <Bar value={p} highlight={chosen} />
                  <span className="w-14 text-right text-xs text-gray-500">{pct(p)}</span>
                </div>
              );
            })}
        </div>
      )}

      {answer.type === "score" && answer.probabilities && answer.score !== undefined && (
        <ScoreView score={answer.score} probabilities={answer.probabilities} legend={answer.legend} />
      )}
    </div>
  );
}

function ScoreView({
  score,
  probabilities,
  legend: legendMap,
}: {
  score: number;
  probabilities: Record<string, number>;
  legend?: Record<string, unknown>;
}) {
  const levels = Object.keys(probabilities).sort((a, b) => Number(a) - Number(b));
  const max = levels.length - 1;
  const legend = (k: string) => {
    const v = legendMap?.[k];
    return v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  };
  const nearest = String(Math.round(score));

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-amber-600">{score.toFixed(2)}</span>
        <span className="text-sm text-gray-500 whitespace-nowrap">/ {max}（期待値）</span>
        <span className="text-xs text-gray-400 truncate">≒ {legend(nearest)}</span>
      </div>
      <div className="relative h-3 bg-gradient-to-r from-gray-100 to-amber-200 rounded-full">
        <div
          className="absolute -top-1 w-1.5 h-5 bg-amber-600 rounded"
          style={{ left: `calc(${(score / Math.max(1, max)) * 100}% - 3px)` }}
        />
      </div>
      {levels.map((k) => (
        <div key={k} className="flex items-center gap-2 text-sm">
          <span className={`w-6 text-right ${k === nearest ? "font-bold text-amber-700" : "text-gray-500"}`}>{k}</span>
          <span className="w-32 truncate text-xs text-gray-600">{legend(k)}</span>
          <Bar value={probabilities[k]} highlight={k === nearest} />
          <span className="w-14 text-right text-xs text-gray-500">{pct(probabilities[k])}</span>
        </div>
      ))}
    </div>
  );
}

// ==================== 質問エディタ ====================
const inputCls =
  "border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white";

function QuestionEditor({
  q,
  onChange,
  onDelete,
}: {
  q: QuestionDraft;
  onChange: (q: QuestionDraft) => void;
  onDelete: () => void;
}) {
  return (
    <div className="border rounded-lg bg-white shadow-sm p-3 space-y-2">
      <div className="flex gap-2">
        <input
          value={q.name}
          onChange={(e) => onChange({ ...q, name: e.target.value })}
          placeholder="質問名（英数字推奨）"
          className={`${inputCls} font-mono flex-1 min-w-0`}
        />
        <select
          value={q.type}
          onChange={(e) => onChange({ ...q, type: e.target.value as QType })}
          className={`${inputCls} w-36 shrink-0`}
        >
          {(Object.keys(TYPE_LABELS) as QType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t].name}
            </option>
          ))}
        </select>
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 px-1" title="削除">
          <Trash2 size={16} />
        </button>
      </div>
      <p className="text-xs text-gray-400">{TYPE_LABELS[q.type].hint}</p>
      <input
        value={q.instructions}
        onChange={(e) => onChange({ ...q, instructions: e.target.value })}
        placeholder="質問文（例: この問い合わせは返金の依頼か？）"
        className={`${inputCls} w-full`}
      />

      {q.type === "noul" && (
        <div className="grid grid-cols-2 gap-2">
          <input
            value={q.yes}
            onChange={(e) => onChange({ ...q, yes: e.target.value })}
            placeholder="Yesの定義（任意）"
            className={`${inputCls} w-full`}
          />
          <input
            value={q.no}
            onChange={(e) => onChange({ ...q, no: e.target.value })}
            placeholder="Noの定義（任意）"
            className={`${inputCls} w-full`}
          />
        </div>
      )}

      {q.type === "choice" && (
        <div className="space-y-1.5">
          {q.options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={o.label}
                onChange={(e) =>
                  onChange({ ...q, options: q.options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })
                }
                placeholder={`選択肢${i + 1}`}
                className={`${inputCls} w-28 shrink-0 font-mono`}
              />
              <input
                value={o.desc}
                onChange={(e) =>
                  onChange({ ...q, options: q.options.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)) })
                }
                placeholder="説明（任意）"
                className={`${inputCls} flex-1 min-w-0`}
              />
              <button
                onClick={() => onChange({ ...q, options: q.options.filter((_, j) => j !== i) })}
                disabled={q.options.length <= 2}
                className="text-gray-300 hover:text-red-500 disabled:opacity-30"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={() => onChange({ ...q, options: [...q.options, { label: "", desc: "" }] })}
            className="text-xs text-indigo-600 hover:underline"
          >
            ＋ 選択肢を追加
          </button>
        </div>
      )}

      {q.type === "score" && (
        <div className="space-y-1.5">
          {q.levels.map((l, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="w-6 text-right text-xs text-gray-400">{i}</span>
              <input
                value={l}
                onChange={(e) => onChange({ ...q, levels: q.levels.map((x, j) => (j === i ? e.target.value : x)) })}
                placeholder={i === 0 ? "最低の段階の説明" : i === q.levels.length - 1 ? "最高の段階の説明" : "段階の説明"}
                className={`${inputCls} flex-1 min-w-0`}
              />
              <button
                onClick={() => onChange({ ...q, levels: q.levels.filter((_, j) => j !== i) })}
                disabled={q.levels.length <= 2}
                className="text-gray-300 hover:text-red-500 disabled:opacity-30"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {q.levels.length < 10 && (
            <button
              onClick={() => onChange({ ...q, levels: [...q.levels, ""] })}
              className="text-xs text-indigo-600 hover:underline"
            >
              ＋ 段階を追加（最大10）
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== メインページ ====================
export default function JevPlayground() {
  const [model, setModel] = useState(MODELS[0]);
  const [stateText, setStateText] = useState(PRESETS[0].state);
  const [questions, setQuestions] = useState<QuestionDraft[]>(PRESETS[0].questions);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [output, setOutput] = useState<RunOutput | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const parsedState = parseState(stateText);

  const loadPreset = (i: number) => {
    setStateText(PRESETS[i].state);
    setQuestions(PRESETS[i].questions());
    setOutput(null);
    setError("");
  };

  const run = async () => {
    const invalid = validate(questions);
    if (invalid) {
      setError(invalid);
      return;
    }
    const request = {
      model,
      state: parsedState.value,
      questions: Object.fromEntries(questions.map((q) => [q.name.trim(), toQuestion(q)])),
    };
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/jev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail ? `\n${typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)}` : "";
        throw new Error(`${data.error ?? "失敗しました"}${detail}`);
      }
      setOutput({ result: data.result, elapsedMs: data.elapsedMs, request, questions });
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setRunning(false);
    }
  };

  const tokens = output?.result.usage?.input_tokens ?? 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div>
        <a href="/" className="text-xs text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">
          <ArrowLeft size={12} /> 買い物ウォッチへ戻る
        </a>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">⚡ Jev プレイグラウンド</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          文章を書かずに「判定」だけを確率付きで返すAI。3つの質問タイプを組み合わせて試せます。
        </p>
      </div>

      {/* プリセット */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p, i) => (
          <button
            key={p.name}
            onClick={() => loadPreset(i)}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 hover:bg-indigo-100 hover:text-indigo-700"
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* 入力（state） */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">判定対象（state）</label>
          <span className={`text-xs ${parsedState.isJson ? "text-indigo-600" : "text-gray-400"}`}>
            {parsedState.isJson ? "JSONとして送信" : "テキストとして送信"}
          </span>
        </div>
        <textarea
          value={stateText}
          onChange={(e) => setStateText(e.target.value)}
          rows={4}
          placeholder="判定させたい文章、または { } / [ ] で始まるJSON"
          className="mt-1 w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
        />
      </div>

      {/* 質問 */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">質問（1リクエストでまとめて判定）</label>
        {questions.map((q) => (
          <QuestionEditor
            key={q.id}
            q={q}
            onChange={(updated) => setQuestions(questions.map((x) => (x.id === q.id ? updated : x)))}
            onDelete={() => setQuestions(questions.filter((x) => x.id !== q.id))}
          />
        ))}
        <div className="flex gap-2">
          {(Object.keys(TYPE_LABELS) as QType[]).map((t) => (
            <button
              key={t}
              onClick={() => setQuestions([...questions, draft({ name: `${t}_${questions.length + 1}`, type: t })])}
              className="flex-1 border-2 border-dashed border-gray-300 rounded-lg py-2 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 flex items-center justify-center gap-1"
            >
              <Plus size={14} /> {TYPE_LABELS[t].name}
            </button>
          ))}
        </div>
      </div>

      {/* 実行 */}
      <div className="flex gap-2">
        <select value={model} onChange={(e) => setModel(e.target.value)} className={`${inputCls} w-32 shrink-0 font-mono`}>
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {m.replace(/^~?typesafe\//, "")}
            </option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={running}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2"
        >
          {running ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
          {running ? "判定中..." : "Jevに判定させる"}
        </button>
      </div>

      {error && (
        <pre className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-xs whitespace-pre-wrap">{error}</pre>
      )}

      {/* 結果 */}
      {output && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 bg-white border rounded-lg px-3 py-2">
            <span>⏱ {output.elapsedMs}ms</span>
            <span>📥 入力 {tokens} tok</span>
            <span>📤 出力 {output.result.usage?.output_tokens ?? 0} tok（無料）</span>
            <span>💰 約 ${((tokens / 1_000_000) * USD_PER_MTOK).toFixed(7)}</span>
            <span className="font-mono">{output.result.model}</span>
          </div>
          {output.questions.map((q) => {
            const name = q.name.trim();
            return <AnswerCard key={q.id} name={name} question={q} answer={output.result.answers?.[name]} />;
          })}
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />} 生のリクエスト／レスポンスJSON
          </button>
          {showRaw && (
            <div className="grid sm:grid-cols-2 gap-2">
              <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-auto max-h-96">
                {JSON.stringify(output.request, null, 2)}
              </pre>
              <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-auto max-h-96">
                {JSON.stringify(output.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
