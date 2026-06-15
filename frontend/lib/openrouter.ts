const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const REFERER = "https://flea-market-monitor.vercel.app";

export interface ChatOptions {
  model: string;
  system: string;
  user: string;
  temperature?: number;
}

export async function chat({ model, system, user, temperature = 0.6 }: ChatOptions): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("APIキーが設定されていません（OPENROUTER_API_KEY）");
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": REFERER,
      "X-Title": "News Report App",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("モデルから有効な応答が得られませんでした");
  }
  return content;
}

/**
 * LLMの出力からJSONを頑健に取り出す。
 * - ```json ... ``` のコードフェンスを除去
 * - 前後の説明文があっても最初のJSON構造（[...] または {...}）を抽出
 */
export function extractJSON<T>(text: string): T {
  let cleaned = text.trim();

  // コードフェンス除去
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // そのままパースできればそれを使う
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // 最初の [ または { から最後の対応する ] または } までを抜き出す
    const firstArr = cleaned.indexOf("[");
    const firstObj = cleaned.indexOf("{");
    const candidates: Array<[number, string]> = [];
    if (firstArr !== -1) candidates.push([firstArr, "]"]);
    if (firstObj !== -1) candidates.push([firstObj, "}"]);
    candidates.sort((a, b) => a[0] - b[0]);

    for (const [start, closer] of candidates) {
      const end = cleaned.lastIndexOf(closer);
      if (end > start) {
        const slice = cleaned.slice(start, end + 1);
        try {
          return JSON.parse(slice) as T;
        } catch {
          // 次の候補へ
        }
      }
    }
    throw new Error("JSONの解析に失敗しました");
  }
}
