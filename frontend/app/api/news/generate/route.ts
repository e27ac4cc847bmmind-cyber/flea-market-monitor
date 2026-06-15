import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const TODAY = new Date().toISOString().split("T")[0];

async function generateWithAI(category: string, prompt: string): Promise<object[]> {
  const systemPrompt = `あなたは日本語のニュースキュレーターです。今日は${TODAY}です。指定されたカテゴリとユーザーの関心に基づいて、最新のリアルなニュース記事を5件生成してください。

以下のJSON配列形式で返してください（コードブロックなし、JSONのみ）:
[
  {
    "id": "一意のID",
    "title": "記事タイトル",
    "summary": "2〜3文の要約",
    "detail": "詳細説明（3〜4文）",
    "source": "メディア名",
    "publishedAt": "${TODAY}",
    "tags": ["タグ1", "タグ2", "タグ3"],
    "isDiscovery": false
  }
]

重要: 最後の1件は isDiscovery: true にして、ユーザーが知らなそうな隣接分野の発見的な記事にしてください。`;

  const userMessage = `カテゴリ: ${category}${prompt ? `\nユーザーの関心・条件: ${prompt}` : ""}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://flea-market-monitor.vercel.app",
    },
    body: JSON.stringify({
      model: "google/gemini-flash-1.5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
  const data = await res.json();
  const text = data.choices[0].message.content.trim();
  return JSON.parse(text);
}

export async function POST(req: NextRequest) {
  try {
    const { category, prompt } = await req.json();

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "APIキーが設定されていません" }, { status: 500 });
    }

    const articles = await generateWithAI(category, prompt ?? "");
    return NextResponse.json({ articles });
  } catch (e) {
    console.error("News generation error:", e);
    return NextResponse.json({ error: "ニュース生成に失敗しました" }, { status: 500 });
  }
}
