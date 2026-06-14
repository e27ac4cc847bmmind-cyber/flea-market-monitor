import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { category, preferences, discoveryTopics } = await req.json();

    const prefContext =
      preferences && preferences.length > 0
        ? `ユーザーが過去に興味を示したテーマ（70%はこれに沿った内容、30%は新しい発見のため隣接分野も含める）: ${preferences.join(", ")}`
        : "まだ好み情報がないため、幅広い話題を均等に取り上げてください。";

    const discoveryContext =
      discoveryTopics && discoveryTopics.length > 0
        ? `新しい発見として意図的に含める隣接分野: ${discoveryTopics.join(", ")}`
        : "";

    const prompt = `あなたは優秀なニュースキュレーターです。「${category}」分野の最新ニュースを5件生成してください。

${prefContext}
${discoveryContext}

今日の日付: ${new Date().toLocaleDateString("ja-JP")}

以下のJSON形式で返してください（コードブロックなし、JSONのみ）:
{
  "articles": [
    {
      "id": "一意のID（英数字）",
      "title": "記事タイトル（40字以内）",
      "summary": "記事要約（120字程度）",
      "detail": "詳細解説（200字程度）",
      "source": "情報源名（例: TechCrunch, 日経新聞）",
      "publishedAt": "YYYY-MM-DD形式の日付",
      "tags": ["タグ1", "タグ2"],
      "isDiscovery": true/false （新しい発見カテゴリの場合true）
    }
  ]
}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (message.content[0] as { type: string; text: string }).text;
    const data = JSON.parse(text);
    return NextResponse.json(data);
  } catch (e) {
    console.error("News generation error:", e);
    return NextResponse.json({ error: "ニュース生成に失敗しました" }, { status: 500 });
  }
}
