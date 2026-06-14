import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { category, articles, favorites } = await req.json();

    const favoriteIds = new Set(favorites);
    const favCount = articles.filter((a: { id: string }) => favoriteIds.has(a.id)).length;
    const topTags: string[] = [];
    articles.forEach((a: { tags: string[]; id: string }) => {
      if (favoriteIds.has(a.id)) topTags.push(...a.tags);
    });

    await new Promise((r) => setTimeout(r, 800));

    const report = {
      reportTitle: `${category} 週次レポート`,
      executiveSummary: `今週の${category}分野は複数の重要トレンドが交差する展開となった。AI技術の実用化加速、規制動向、市場変動が複合的に影響しており、今後3〜6ヶ月は変革の加速期と見られる。${favCount > 0 ? `あなたが注目した${favCount}件の記事を中心に分析した。` : ""}`,
      sections: [
        {
          heading: "📈 今週のハイライト",
          body: `${category}分野では技術革新と市場の変化が同時進行している。特に大手プレイヤーの動向が業界全体の方向性を左右しており、新規参入企業との競争激化が注目を集めている。投資家・事業者ともに次の一手を慎重に見極める局面が続く。`,
        },
        {
          heading: "🔍 注目トレンド分析",
          body: `規制・技術・資本の三つのベクトルが収束しつつある。政府の政策動向が民間投資の方向性に直接影響を与えており、グローバルな標準化の動きとローカル規制の整合性が課題として浮上している。来月以降、具体的なガイドラインの公表が相次ぐ見込み。`,
        },
        {
          heading: "🌏 海外動向との比較",
          body: `米国・EUと国内の動向を比較すると、日本は技術採用速度では後れを取りつつも、安全性・品質面での強みを活かした差別化が進んでいる。海外資本の流入も活発化しており、グローバル連携の機運が高まっている。`,
        },
      ],
      keyInsight: `${category}分野の最重要変数は「規制の明確化」と「人材確保」の2点。この2つが整備されれば市場は急速に拡大するポテンシャルを持っている。`,
      infographic: {
        title: `${category} トレンドマップ`,
        svgContent: `
  <!-- 背景 -->
  <rect width="600" height="400" fill="#F8FAFC" rx="12"/>

  <!-- タイトル -->
  <text x="300" y="36" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1E293B">${category} トレンドマップ 2026</text>

  <!-- 中央ノード -->
  <circle cx="300" cy="200" r="52" fill="#3B82F6" opacity="0.9"/>
  <text x="300" y="195" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="bold" fill="white">${category}</text>
  <text x="300" y="213" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#BFDBFE">市場動向</text>

  <!-- 左上ノード: 技術 -->
  <line x1="300" y1="200" x2="130" y2="110" stroke="#94A3B8" stroke-width="2" stroke-dasharray="4"/>
  <circle cx="130" cy="110" r="40" fill="#1D4ED8" opacity="0.85"/>
  <text x="130" y="105" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="bold" fill="white">技術革新</text>
  <text x="130" y="122" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#BFDBFE">AI・自動化</text>

  <!-- 右上ノード: 規制 -->
  <line x1="300" y1="200" x2="470" y2="110" stroke="#94A3B8" stroke-width="2" stroke-dasharray="4"/>
  <circle cx="470" cy="110" r="40" fill="#7C3AED" opacity="0.85"/>
  <text x="470" y="105" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="bold" fill="white">規制動向</text>
  <text x="470" y="122" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#DDD6FE">法整備</text>

  <!-- 左下ノード: 投資 -->
  <line x1="300" y1="200" x2="130" y2="300" stroke="#94A3B8" stroke-width="2" stroke-dasharray="4"/>
  <circle cx="130" cy="300" r="40" fill="#10B981" opacity="0.85"/>
  <text x="130" y="295" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="bold" fill="white">投資・資本</text>
  <text x="130" y="312" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#D1FAE5">市場拡大</text>

  <!-- 右下ノード: 人材 -->
  <line x1="300" y1="200" x2="470" y2="300" stroke="#94A3B8" stroke-width="2" stroke-dasharray="4"/>
  <circle cx="470" cy="300" r="40" fill="#F59E0B" opacity="0.85"/>
  <text x="470" y="295" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="bold" fill="white">人材・組織</text>
  <text x="470" y="312" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#FEF3C7">スキル不足</text>

  <!-- 凡例 -->
  <rect x="20" y="355" width="12" height="12" rx="2" fill="#3B82F6"/>
  <text x="38" y="366" font-family="sans-serif" font-size="11" fill="#64748B">中心テーマ</text>
  <rect x="110" y="355" width="12" height="12" rx="2" fill="#10B981"/>
  <text x="128" y="366" font-family="sans-serif" font-size="11" fill="#64748B">成長要因</text>
  <rect x="200" y="355" width="12" height="12" rx="2" fill="#F59E0B"/>
  <text x="218" y="366" font-family="sans-serif" font-size="11" fill="#64748B">課題</text>
        `,
      },
    };

    return NextResponse.json(report);
  } catch (e) {
    console.error("Report generation error:", e);
    return NextResponse.json({ error: "レポート生成に失敗しました" }, { status: 500 });
  }
}
