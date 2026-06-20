import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const MODELS = [
  "google/gemma-4-31b-it:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

const SYSTEM_PROMPT = `You convert a Japanese flea-market shopping request into a JSON search config.
Output ONLY a single valid JSON object. No markdown, no code fences, no explanation.

JSON keys:
{
  "keyword": string,          // 検索キーワード（日本語OK、短く・核心のみ）
  "max_price": number,        // 上限金額（円）。指定なければ50000
  "discount_threshold": number, // お得判定の閾値%。指定なければ0
  "exclude_words": string[],  // 除外ワード配列
  "require_words": string[],  // 必須ワード配列
  "note": string,             // 希望条件メモ（AIへの補足）
  "genre": string             // electronics|fashion|automotive|sports|games|books|interior|"" のいずれか
}`;

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY not set" }, { status: 500 });
  }

  const { text } = await req.json();
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const userMessage = `以下のリクエストをJSON設定に変換してください:\n\n${text}`;

  for (const model of MODELS) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/flea-market-monitor",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          max_tokens: 500,
        }),
      });

      if (!res.ok) {
        console.error(`Model ${model} failed: ${res.status}`);
        continue;
      }

      const data = await res.json();
      if (!data.choices?.[0]?.message?.content) {
        console.error(`Model ${model}: no choices`);
        continue;
      }

      const content = data.choices[0].message.content as string;
      const parsed = extractJson(content);
      if (!parsed || !parsed.keyword) {
        console.error(`Model ${model}: JSON parse failed`);
        continue;
      }

      return NextResponse.json({
        ok: true,
        config: {
          keyword: String(parsed.keyword ?? ""),
          max_price: Number(parsed.max_price ?? 50000),
          discount_threshold: Number(parsed.discount_threshold ?? 0),
          exclude_words: Array.isArray(parsed.exclude_words) ? parsed.exclude_words : [],
          require_words: Array.isArray(parsed.require_words) ? parsed.require_words : [],
          note: String(parsed.note ?? ""),
          genre: String(parsed.genre ?? ""),
        },
      });
    } catch (e) {
      console.error(`Model ${model} error:`, e);
    }
  }

  return NextResponse.json({ error: "All models failed" }, { status: 500 });
}

function extractJson(text: string): Record<string, unknown> | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
