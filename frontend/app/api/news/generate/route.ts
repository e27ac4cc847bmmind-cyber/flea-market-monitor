import { NextRequest, NextResponse } from "next/server";

const MOCK_ARTICLES: Record<string, object[]> = {
  "AI & IT": [
    { id: "ai1", title: "OpenAI、GPT-5の商用提供を開始", summary: "OpenAIは次世代モデルGPT-5の一般提供を開始。従来比3倍の推論精度を持ち、マルチモーダル対応も強化された。", detail: "GPT-5はコーディング・数学・科学分野で人間の専門家レベルを超えるベンチマークを記録。APIコストは従来の40%削減となり、中小企業への普及が加速すると見られる。", source: "TechCrunch", publishedAt: "2026-06-14", tags: ["AI", "OpenAI", "LLM"], isDiscovery: false },
    { id: "ai2", title: "Appleがオンデバイス「Apple Intelligence 2.0」発表", summary: "WWDC 2026でAppleはデバイス上で完結するAI新機能を発表。プライバシー保護とパフォーマンスを両立した。", detail: "新モデルはiPhone 17以降で動作し、クラウド送信なしにメール要約・画像生成・翻訳が可能。Siriの会話能力も大幅向上。", source: "The Verge", publishedAt: "2026-06-13", tags: ["Apple", "オンデバイスAI", "プライバシー"], isDiscovery: false },
    { id: "ai3", title: "量子コンピュータ×AIで新薬開発を1/10に短縮", summary: "IBMとファイザーの共同研究で、量子AIが従来5年かかる新薬候補探索を半年に短縮することを実証した。", detail: "量子アニーリングと深層学習を組み合わせたハイブリッド手法により、タンパク質の折り畳み予測精度が従来手法の8倍に向上。2028年の実用化を目指す。", source: "Nature", publishedAt: "2026-06-12", tags: ["量子コンピューティング", "創薬", "IBM"], isDiscovery: true },
    { id: "ai4", title: "国内AI規制法が参院通過、2027年施行へ", summary: "生成AI利用企業に透明性報告書の提出を義務づける「AI適正利用促進法」が参院で可決。EUのAI法を参考に策定。", detail: "高リスクAIシステムの事前審査制度や、偽情報生成AIへの罰則規定が盛り込まれた。中小企業への猶予期間は2年間。", source: "日経新聞", publishedAt: "2026-06-13", tags: ["規制", "AI法", "政策"], isDiscovery: false },
    { id: "ai5", title: "Anthropic、エージェント向け「Computer Use 2.0」公開", summary: "PCやブラウザを自律操作できるエージェントAPIがアップデート。精度が向上し企業RPA市場に波紋を広げる。", detail: "ファイル操作・Webブラウズ・コード実行を組み合わせた複合タスクの成功率が従来比60%向上。月次コストも50%削減されエンタープライズ採用が加速。", source: "Anthropic Blog", publishedAt: "2026-06-14", tags: ["Anthropic", "エージェント", "RPA"], isDiscovery: false },
  ],
  "経済": [
    { id: "eco1", title: "日経平均4万5千円台回復、半導体株が牽引", summary: "米国のAI投資拡大期待を背景に半導体関連株が急騰。東京市場は約3ヶ月ぶりに45,000円台を回復した。", detail: "東京エレクトロン・ソニー・レーザーテックが揃って年初来高値を更新。外国人投資家の買い越しが続いており、需給面での下支えが続く見通し。", source: "日経新聞", publishedAt: "2026-06-14", tags: ["株式", "半導体", "日経平均"], isDiscovery: false },
    { id: "eco2", title: "FRB、年内2回利下げを示唆—インフレ鈍化で", summary: "パウエル議長の議会証言でFRBが9月・12月の利下げ可能性を示唆。ドル円は152円台まで円高が進んだ。", detail: "CPIが前年比2.3%まで低下し、FRBの目標値2%に近づいたことが背景。住宅ローン金利の低下から不動産市場の回復も期待される。", source: "Bloomberg", publishedAt: "2026-06-13", tags: ["FRB", "金利", "為替"], isDiscovery: false },
    { id: "eco3", title: "中東情勢緊張で原油価格が一時90ドル超", summary: "ホルムズ海峡周辺での衝突報道を受け、WTI原油先物が急騰。ガソリン価格への波及が懸念される。", detail: "産油国の供給制約と地政学リスクが重なりエネルギー市場は不安定な状態。IEAは戦略備蓄放出の検討を開始しており、各国のエネルギー政策が問われる局面。", source: "Reuters", publishedAt: "2026-06-14", tags: ["原油", "地政学", "エネルギー"], isDiscovery: true },
    { id: "eco4", title: "国内スタートアップ調達額が過去最高—AI関連が6割", summary: "2026年上半期の国内スタートアップ調達総額が1.2兆円に達し、過去最高を記録。AI・ロボット分野が急増。", detail: "政府の「スタートアップ育成5か年計画」の成果が表れ始めた形。海外VCの参入も活発化しており、グローバルな資金流入が国内エコシステムを底上げしている。", source: "東洋経済", publishedAt: "2026-06-12", tags: ["スタートアップ", "資金調達", "VC"], isDiscovery: false },
    { id: "eco5", title: "少子化加速で2030年に労働力250万人不足の試算", summary: "厚労省が発表した推計で、2030年には現状比250万人の労働力不足が生じる見通し。自動化投資が急務に。", detail: "特に介護・物流・建設分野での不足が深刻。政府はロボット導入補助金を倍増させる方針で、AIと自動化技術の普及が経済の持続性を左右する構図になっている。", source: "厚生労働省", publishedAt: "2026-06-11", tags: ["少子化", "労働力", "人口動態"], isDiscovery: true },
  ],
};

function getMockArticles(category: string) {
  if (MOCK_ARTICLES[category]) return MOCK_ARTICLES[category];
  return [
    { id: `${category}1`, title: `${category}分野の最新動向`, summary: `${category}に関する注目トピックが相次いでいる。業界関係者は今後の展開を注視している。`, detail: `専門家によると、${category}分野は今後5年で大きな変革期を迎えるとされる。技術革新と規制整備が同時進行しており、プレイヤーの動向から目が離せない。`, source: "業界メディア", publishedAt: new Date().toISOString().split("T")[0], tags: [category, "トレンド"], isDiscovery: false },
    { id: `${category}2`, title: `${category}市場で新プレイヤーが台頭`, summary: `新興企業が${category}市場に参入し、既存大手との競争が激化。ユーザー目線での革新が評価を集めている。`, detail: `資金調達も好調で、直近ラウンドでは100億円規模の調達を実施。グローバル展開も視野に入れており、今後12ヶ月が勝負どころ。`, source: "経済誌", publishedAt: new Date().toISOString().split("T")[0], tags: [category, "スタートアップ"], isDiscovery: false },
    { id: `${category}3`, title: `${category}×AIの融合が加速`, summary: `AI技術との融合により${category}分野の生産性が飛躍的に向上。人材育成と技術導入が急務となっている。`, detail: `国内外の企業が積極的に投資を拡大しており、2027年には市場規模が現在の2倍に達するという予測も出ている。`, source: "専門誌", publishedAt: new Date().toISOString().split("T")[0], tags: [category, "AI", "イノベーション"], isDiscovery: true },
  ];
}

export async function POST(req: NextRequest) {
  try {
    const { category } = await req.json();
    const articles = getMockArticles(category);
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ articles });
  } catch (e) {
    console.error("News generation error:", e);
    return NextResponse.json({ error: "ニュース生成に失敗しました" }, { status: 500 });
  }
}
