import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY が未設定です" }, { status: 500 });
  }

  try {
    const { category, articles, favorites } = await req.json();

    const articleList = articles
      .map(
        (a: { title: string; summary: string; detail: string }, i: number) =>
          `${i + 1}. ${a.title}\n   ${a.summary}\n   ${a.detail}`
      )
      .join("\n\n");

    const favoriteIds = new Set(favorites);
    const highlightedArticles = articles.filter((a: { id: string }) => favoriteIds.has(a.id));
    const highlightTitles = highlightedArticles.map((a: { title: string }) => a.title);

    const prompt = `あなたは優秀なビジネスアナリストです。「${category}」分野のニュースレポートをまとめてください。

【今日の記事一覧】
${articleList}

${highlightTitles.length > 0 ? `【ユーザーが特に注目した記事】\n${highlightTitles.join("\n")}` : ""}

以下の形式でJSON（コードブロックなし）を返してください:
{
  "reportTitle": "レポートタイトル（30字以内）",
  "executiveSummary": "全体要約（150字程度）",
  "sections": [
    {
      "heading": "セクション見出し",
      "body": "セクション本文（200字程度）"
    }
  ],
  "keyInsight": "今週の重要インサイト（100字程度）",
  "infographic": {
    "title": "図解タイトル",
    "svgContent": "SVGタグの中身のみ（<svg>タグ不要）。viewBoxは '0 0 600 400'。主なトレンドや関係性を図解するSVG要素（rect, text, line, circle, path等）を使い、わかりやすく可視化すること。フォントは sans-serif、日本語テキストも含めてよい。色は青系(#3B82F6, #1D4ED8)と緑系(#10B981)を中心に。"
  }
}`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/flea-market-monitor",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4-5",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
      }),
    });

    if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
    const json = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "";

    // コードフェンス除去
    const clean = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    const data = JSON.parse(clean);
    return NextResponse.json(data);
  } catch (e) {
    console.error("Report generation error:", e);
    return NextResponse.json({ error: "レポート生成に失敗しました" }, { status: 500 });
  }
}
