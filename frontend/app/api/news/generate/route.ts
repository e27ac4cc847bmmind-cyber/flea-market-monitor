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
Web検索を使い、指定されたカテゴリ分野で「実際に起きた最新の出来事」を5件調べてまとめてください。

【最重要】拾うのは"ニュース（出来事）"であって、解説記事ではありません。
良い例: 新製品・新サービスの発表、企業の決算/買収/資金調達、新技術や研究成果の公開、法規制・政策の動き、人事や事件、市場の急変など、日付が特定できる具体的な出来事。
悪い例（絶対に選ばない）: 「AIとITの違いとは」のような用語解説・入門記事、用語集、まとめ記事、商品紹介ブログ、教育・スクールの宣伝、SEO目的の一般論。

ルール:
- 必ず直近1〜2週間以内に報じられた、日付の新しい出来事を優先する。
- 出典は日経・Reuters・Bloomberg・TechCrunch・各社プレスリリース等の報道機関を優先し、解説サイトや個人ブログは避ける。
- カテゴリ名は検索ワードそのものではなく「分野」として解釈する（例: 「AI & IT」なら "AI・IT業界の最新ニュース"）。
- 推測や創作はしない。実際に検索で見つかった出来事だけを書く。

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
