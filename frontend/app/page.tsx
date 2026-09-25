"use client";

import { useState, useEffect } from "react";
import { Plus, X, Loader2 } from "lucide-react";

const KEY_STORAGE = "jev-playground-key";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState(["", ""]);
  const [probs, setProbs] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // サーバーにキーがなければ画面でキーを入力してもらう
  const [needKey, setNeedKey] = useState(false);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    try {
      setApiKey(localStorage.getItem(KEY_STORAGE) || "");
    } catch {}
    fetch("/api/jev")
      .then((r) => r.json())
      .then((d) => setNeedKey(!d.server_key))
      .catch(() => {});
  }, []);

  const saveKey = (v: string) => {
    setApiKey(v);
    try {
      if (v.trim()) localStorage.setItem(KEY_STORAGE, v.trim());
      else localStorage.removeItem(KEY_STORAGE);
    } catch {}
  };

  const setAnswer = (i: number, v: string) => {
    setAnswers((a) => a.map((x, j) => (j === i ? v : x)));
    setProbs(null);
  };

  const run = async () => {
    setError(null);
    setProbs(null);
    const filled = answers.map((a) => a.trim());
    if (!question.trim()) return setError("質問を入力してください");
    if (filled.filter(Boolean).length < 2) return setError("答えを2つ以上入力してください");
    if (needKey && !apiKey.trim()) return setError("APIキーを入力してください");

    const used = filled.map((a, i) => ({ a, i })).filter((x) => x.a);
    if (new Set(used.map((x) => x.a)).size !== used.length) return setError("同じ候補が重複しています");

    // 先頭の候補に確率が寄る（位置バイアス）のを打ち消すため、並び順を1つずつずらした質問を
    // 候補の数だけ1リクエストにまとめて送り、確率を平均する（最大10通り）
    const n = used.length;
    const rotations = Array.from({ length: Math.min(n, 10) }, (_, r) =>
      Array.from({ length: n }, (_, k) => (k + r) % n)
    );
    const ask = (textLabels: boolean) => {
      const label = (u: number) => (textLabels ? used[u].a : `option_${u + 1}`);
      const questions: Record<string, unknown> = {};
      rotations.forEach((order, r) => {
        const criteria: Record<string, string | null> = {};
        order.forEach((u) => (criteria[label(u)] = textLabels ? null : used[u].a));
        questions[`q${r}`] = { type: "choice", instructions: "最も適切な答えはどれか", criteria };
      });
      return fetch("/api/jev", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { "x-jev-key": apiKey } : {}) },
        // state は文字列必須（null は OpenRouter で 400）なので質問文を判断材料として渡す
        body: JSON.stringify({ state: question.trim(), questions }),
      })
        .then((r) => r.json())
        .then((data) => ({ data, label }));
    };

    setLoading(true);
    try {
      // 答えの文字そのものをラベルにする方が中身で判断されやすい。弾かれたら option_N 方式で再試行
      let { data, label } = await ask(true);
      if (!data.ok && (data.status === 400 || data.status === 422)) ({ data, label } = await ask(false));
      const got = data?.body?.answers;
      if (!data.ok || !got) {
        const b = data?.body;
        const msg = typeof b === "string" ? b : b?.error?.message || b?.error || JSON.stringify(b);
        return setError(`エラー（${data.status}）: ${String(msg).slice(0, 500)}`);
      }
      const out = answers.map(() => NaN);
      used.forEach(({ i }, u) => {
        const ps = rotations.map((_, r) => got[`q${r}`]?.probabilities?.[label(u)] ?? 0);
        out[i] = ps.reduce((x: number, y: number) => x + y, 0) / ps.length;
      });
      setProbs(out);
    } catch (e) {
      setError(`通信エラー: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const best = probs ? Math.max(...probs.filter((p) => !Number.isNaN(p))) : -1;

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Jev</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">質問と答えの候補を書くと、それぞれの確率を返します</p>

      {needKey && (
        <input
          type="password"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono mb-6"
          placeholder="APIキー（OpenRouter の sk-or-… など）"
          value={apiKey}
          onChange={(e) => saveKey(e.target.value)}
        />
      )}

      <label className="block text-sm font-semibold text-gray-700 mb-1">質問</label>
      <textarea
        className="w-full h-24 border border-gray-300 rounded-lg p-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-200"
        placeholder="例：日本で一番高い山は？"
        value={question}
        onChange={(e) => {
          setQuestion(e.target.value);
          setProbs(null);
        }}
      />

      <label className="block text-sm font-semibold text-gray-700 mt-5 mb-1">答えの候補</label>
      <div className="space-y-2">
        {answers.map((a, i) => {
          const p = probs?.[i];
          const shown = p !== undefined && !Number.isNaN(p);
          return (
            <div key={i}>
              <div className="flex items-center gap-2">
                <input
                  className={`flex-1 border rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                    shown && p === best ? "border-indigo-500 bg-indigo-50" : "border-gray-300"
                  }`}
                  placeholder={i === 0 ? "例：富士山" : i === 1 ? "例：北岳" : `答え${i + 1}`}
                  value={a}
                  onChange={(e) => setAnswer(i, e.target.value)}
                />
                {shown && (
                  <span
                    className={`w-14 text-right tabular-nums font-semibold ${p === best ? "text-indigo-600" : "text-gray-500"}`}
                  >
                    {(p * 100).toFixed(1)}%
                  </span>
                )}
                {answers.length > 2 && (
                  <button
                    onClick={() => {
                      setAnswers((x) => x.filter((_, j) => j !== i));
                      setProbs(null);
                    }}
                    className="text-gray-300 hover:text-rose-500"
                    aria-label="削除"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
              {shown && (
                <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${p === best ? "bg-indigo-500" : "bg-gray-300"}`}
                    style={{ width: `${p * 100}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={() => {
          setAnswers((x) => [...x, ""]);
          setProbs(null);
        }}
        className="mt-2 text-sm text-indigo-600 flex items-center gap-1"
      >
        <Plus size={14} /> 候補を追加
      </button>

      <button
        onClick={run}
        disabled={loading}
        className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-lg font-bold rounded-xl py-3 flex items-center justify-center"
      >
        {loading ? <Loader2 className="animate-spin" size={22} /> : "確率を出す"}
      </button>

      {error && <p className="mt-4 text-sm text-rose-600 break-words">{error}</p>}
    </main>
  );
}
