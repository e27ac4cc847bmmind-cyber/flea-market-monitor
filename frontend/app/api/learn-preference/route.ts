import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const MODELS = [
  "google/gemma-4-31b-it:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

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

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY not set" }, { status: 500 });
  }

  const { keyword_config, liked_items } = await req.json();
  if (!keyword_config || !Array.isArray(liked_items) || liked_items.length < 1) {
    return NextResponse.json({ error: "keyword_config and liked_items required" }, { status: 400 });
  }

  const itemsText = liked_items
    .map((it: { name: string; price: number; platform: string }) =>
      `- ${it.name}（¥${it.price?.toLocaleString()}・${it.platform}）`
    )
    .join("\n");

  const prompt = `以下はフリマアプリの検索条件と、ユーザーがお気に入りした商品一覧です。

【現在の検索条件】
キーワード: ${keyword_config.keyword}
note: ${keyword_config.note || "（未設定）"}
除外ワード: ${keyword_config.exclude_words?.join(", ") || "（なし）"}
必須ワード: ${keyword_config.require_words?.join(", ") || "（なし）"}

【お気に入り商品】
${itemsText}

これらの商品の共通点を分析し、より良い検索条件を提案してください。
出力はJSON形式のみ（説明不要）:
{
  "note": "更新されたhope条件メモ（日本語・1〜2文）",
  "exclude_words": ["除外すべきワード"],
  "require_words": ["必須ワード"],
  "explanation": "変更理由の一言説明（日本語）"
}`;

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
          messages: [{ role: "user", content: prompt }],
          max_tokens: 600,
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
      if (!parsed) {
        console.error(`Model ${model}: JSON parse failed`);
        continue;
      }

      return NextResponse.json({
        ok: true,
        note: String(parsed.note ?? ""),
        exclude_words: Array.isArray(parsed.exclude_words) ? parsed.exclude_words : [],
        require_words: Array.isArray(parsed.require_words) ? parsed.require_words : [],
        explanation: String(parsed.explanation ?? ""),
      });
    } catch (e) {
      console.error(`Model ${model} error:`, e);
    }
  }

  return NextResponse.json({ error: "All models failed" }, { status: 500 });
}
