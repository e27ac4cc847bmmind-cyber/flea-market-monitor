import { NextRequest, NextResponse } from "next/server";
import { chat, extractJSON } from "@/lib/openrouter";

const MODEL = "perplexity/sonar";

interface Article {
  id: string;
  title: string;
  summary: string;
  detail: string;
  source: string;
  publishedAt: string;
  tags: string[];
  isDiscovery: boolean;
}

function buildSystemPrompt(today: string): string {
  return `あなたは優秀な日本語ニュースリサーチャーです。今日は${today}です。
Web検索を使い、指定されたカテゴリと条件に合う「実際の最新ニュース」を調べて5件にまとめてください。
できるだけ直近（数日以内）の本物の出来事を選び、推測や創作はしないこと。

出力は必ず次のJSON配列のみ（説明文やコードフェンスは一切付けない）:
[
  {
    "id": "短い英数字ID",
    "title": "記事の見出し（日本語）",
    "summary": "2〜3文の要約",
    "detail": "背景・影響を含む詳しい説明（3〜4文）",
    "source": "実際の報道機関名",
    "publishedAt": "YYYY-MM-DD（記事の日付。不明なら${today}）",
    "tags": ["タグ1", "タグ2", "タグ3"],
    "isDiscovery": false
  }
]

ルール:
- 5件のうち4件はユーザーの関心ど真ん中の話題にする。
- 残り1件は isDiscovery: true とし、ユーザーの関心に隣接するが本人がまだ追っていなさそうな「発見」記事にする。`;
}

function buildUserPrompt(category: string, prompt: string, preferences: string[]): string {
  const lines = [`カテゴリ: ${category}`];
  if (prompt) lines.push(`重視したい関心・条件: ${prompt}`);
  if (preferences.length > 0) {
    lines.push(`これまでこのユーザーが「いいね」した傾向（タグ）: ${preferences.join("、")}`);
    lines.push("→ この傾向を踏まえつつ、発見記事(isDiscovery)はあえて少し違う角度のものにすること。");
  }
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const { category, prompt, preferences } = await req.json();
    const today = new Date().toISOString().split("T")[0];

    const content = await chat({
      model: MODEL,
      system: buildSystemPrompt(today),
      user: buildUserPrompt(category ?? "", prompt ?? "", Array.isArray(preferences) ? preferences : []),
      temperature: 0.5,
    });

    const articles = extractJSON<Article[]>(content);
    if (!Array.isArray(articles) || articles.length === 0) {
      throw new Error("記事が生成されませんでした");
    }

    // IDが重複・欠落しても安全になるよう補正
    const normalized = articles.map((a, i) => ({
      ...a,
      id: a.id || `${category}-${Date.now()}-${i}`,
      tags: Array.isArray(a.tags) ? a.tags : [],
      isDiscovery: Boolean(a.isDiscovery),
    }));

    return NextResponse.json({ articles: normalized });
  } catch (e) {
    console.error("News generation error:", e);
    const msg = e instanceof Error ? e.message : "ニュース生成に失敗しました";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
