import { NextRequest, NextResponse } from "next/server";
import { chat, extractJSON } from "@/lib/openrouter";

const MODEL = "perplexity/sonar";

interface Article {
  id: string;
  title: string;
  summary: string;
  tags: string[];
}

interface ReportText {
  reportTitle: string;
  executiveSummary: string;
  sections: { heading: string; body: string }[];
  keyInsight: string;
}

const NODE_COLORS = ["#1D4ED8", "#7C3AED", "#10B981", "#F59E0B", "#EF4444"];

/** 記事タグの頻度から放射状のトレンドマップSVGを生成（常に有効なSVG） */
function buildInfographicSVG(category: string, tagCounts: [string, number][]): string {
  const top = tagCounts.slice(0, 5);
  const cx = 300;
  const cy = 200;
  const positions = [
    [130, 110], [470, 110], [130, 300], [470, 300], [300, 340],
  ];

  let nodes = "";
  top.forEach(([tag, count], i) => {
    const [x, y] = positions[i];
    const color = NODE_COLORS[i % NODE_COLORS.length];
    const r = 32 + Math.min(count, 5) * 4;
    nodes += `
  <line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#94A3B8" stroke-width="2" stroke-dasharray="4"/>
  <circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="0.85"/>
  <text x="${x}" y="${y - 2}" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="bold" fill="white">${escapeXml(tag)}</text>
  <text x="${x}" y="${y + 14}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#E0E7FF">${count}件</text>`;
  });

  return `
  <rect width="600" height="400" fill="#F8FAFC" rx="12"/>
  <text x="300" y="36" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1E293B">${escapeXml(category)} 注目トピックマップ</text>
  ${nodes}
  <circle cx="${cx}" cy="${cy}" r="52" fill="#3B82F6" opacity="0.95"/>
  <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="bold" fill="white">${escapeXml(category)}</text>
  <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#BFDBFE">全体トレンド</text>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c] as string)
  );
}

export async function POST(req: NextRequest) {
  try {
    const { category, articles, favorites } = await req.json();
    const arts: Article[] = Array.isArray(articles) ? articles : [];
    const favIds = new Set<string>(Array.isArray(favorites) ? favorites : []);

    // タグ頻度集計（お気に入りは重み2倍）
    const counts = new Map<string, number>();
    arts.forEach((a) => {
      const fav = favIds.has((a as Article & { id: string }).id ?? "");
      (a.tags ?? []).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + (fav ? 2 : 1)));
    });
    const tagCounts = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

    const favArticles = arts.filter((a) => favIds.has((a as Article & { id: string }).id ?? ""));
    const articleList = arts
      .map((a) => `- ${a.title}（${(a.tags ?? []).join(", ")}）`)
      .join("\n");
    const favList = favArticles.length
      ? favArticles.map((a) => `- ${a.title}`).join("\n")
      : "（特になし）";

    const system = `あなたは優秀な日本語アナリストです。提示されたニュース記事群をもとに、洞察に富んだ週次レポートを作成してください。
出力は次のJSONのみ（コードフェンス・説明文なし）:
{
  "reportTitle": "レポートのタイトル",
  "executiveSummary": "全体を3〜4文で総括",
  "sections": [
    { "heading": "見出し（絵文字付き）", "body": "本文（3〜4文）" }
  ],
  "keyInsight": "最も重要な洞察を1〜2文で"
}
sectionsは3つ作ること。ユーザーが注目した記事があれば、それを重視した分析にすること。`;

    const user = `カテゴリ: ${category}

【今回の記事一覧】
${articleList || "（記事なし）"}

【ユーザーが特に注目した記事】
${favList}`;

    const content = await chat({ model: MODEL, system, user, temperature: 0.6 });
    const text = extractJSON<ReportText>(content);

    const report = {
      reportTitle: text.reportTitle || `${category} レポート`,
      executiveSummary: text.executiveSummary || "",
      sections: Array.isArray(text.sections) ? text.sections : [],
      keyInsight: text.keyInsight || "",
      infographic: {
        title: `${category} 注目トピックマップ`,
        svgContent: buildInfographicSVG(category, tagCounts),
      },
    };

    return NextResponse.json(report);
  } catch (e) {
    console.error("Report generation error:", e);
    const msg = e instanceof Error ? e.message : "レポート生成に失敗しました";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
