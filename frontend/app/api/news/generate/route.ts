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
  return `あなたは優秀なグローバルニュースリサーチャーです。今日は${today}です。
英語・日本語を問わず世界中のニュースソースを検索し、指定されたカテゴリで「今まさに話題になっている出来事」を5件調査してまとめてください。

【話題性の基準】次のいずれかに当てはまるものを優先する:
- SNSやテック界隈で話題沸騰中の出来事
- 業界の勢力図を変えるような大型発表・買収・提携
- 著名人・大企業の予想外の動き
- 規制・法律・政策で業界全体が揺れているニュース
- 新技術・新サービスで「これは変わるな」と感じる発表
- 大型の資金調達・上場・破綻など市場の節目

【ソース方針】
- NYT・Reuters・Bloomberg・WSJ・FT・TechCrunch・The Verge・Wired・日経・NHKなど一次報道機関を優先
- 英語ソースの場合でも記事タイトル・サマリー・詳細は日本語で書く（sourceはメディア名を原語で）
- 解説ブログ・用語集・SEO記事は絶対に選ばない

【必須ルール】
- 必ず直近1〜2週間以内のニュースを選ぶ
- 出来事（イベント）であること。用語解説や一般論は除外
- 推測・創作なし。実際に検索で確認できた出来事のみ

出力は必ず次のJSON配列のみ（説明文・コードフェンス・前置きは一切付けない）:
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
