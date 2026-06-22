import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const MODELS = [
  "deepseek/deepseek-v4-flash",
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash-001",
];

function extractJson(text: string): Record<string, unknown> | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

interface KeywordConfig {
  keyword: string;
  max_price: number;
  note?: string;
  exclude_words?: string[];
  require_words?: string[];
}

interface HistoryItem {
  name: string;
  price: number;
  platform: string;
}

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY が未設定です（.env.local または Vercel環境変数）" },
      { status: 500 }
    );
  }

  let keyword_config: KeywordConfig;
  let liked_items: HistoryItem[];
  try {
    const body = await req.json();
    keyword_config = body.keyword_config;
    liked_items = body.liked_items;
    if (!keyword_config || !Array.isArray(liked_items) || liked_items.length < 1) {
      return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "リクエスト不正" }, { status: 400 });
  }

  const itemsList = liked_items
    .map((item) => `- ${item.name} ¥${item.price.toLocaleString()} (${item.platform})`)
    .join("\n");

  const prompt = `現在の検索設定:
keyword: ${keyword_config.keyword}
max_price: ¥${keyword_config.max_price?.toLocaleString() ?? "未設定"}
note: ${keyword_config.note || "（未設定）"}
exclude_words: ${keyword_config.exclude_words?.join(", ") || "（なし）"}
require_words: ${keyword_config.require_words?.join(", ") || "（なし）"}

ユーザーが「良い」と評価した商品:
${itemsList}

これらの共通点を分析し、次回からより好みに合う商品が見つかるよう検索設定を改善してください。
以下のJSON形式のみで返答してください。説明やMarkdownは不要です。

{
  "note": "更新後のnote（日本語・ユーザーの好みを反映した1〜2文）",
  "exclude_words": ["除外ワード1", "除外ワード2"],
  "require_words": ["必須ワード1"],
  "explanation": "なぜこう変えたか（日本語で1〜2文）"
}`;

  for (const model of MODELS) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/flea-market-monitor",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
          temperature: 0.3,
        }),
      });
      if (r.status === 429) continue;
      if (!r.ok) continue;
      const j = await r.json();
      const content: string = j?.choices?.[0]?.message?.content ?? "";
      const parsed = extractJson(content);
      if (!parsed) continue;

      const result = {
        note: String(parsed.note ?? "").trim(),
        exclude_words: Array.isArray(parsed.exclude_words)
          ? parsed.exclude_words.map((s) => String(s).trim()).filter(Boolean)
          : [],
        require_words: Array.isArray(parsed.require_words)
          ? parsed.require_words.map((s) => String(s).trim()).filter(Boolean)
          : [],
        explanation: String(parsed.explanation ?? "").trim(),
      };
      return NextResponse.json({ ok: true, ...result });
    } catch {
      continue;
    }
  }

  return NextResponse.json(
    { error: "AI分析に失敗しました。もう一度お試しください。" },
    { status: 502 }
  );
}
