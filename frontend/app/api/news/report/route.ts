import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
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

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (message.content[0] as { type: string; text: string }).text;
    const data = JSON.parse(text);
    return NextResponse.json(data);
  } catch (e) {
    console.error("Report generation error:", e);
    return NextResponse.json({ error: "レポート生成に失敗しました" }, { status: 500 });
  }
}
