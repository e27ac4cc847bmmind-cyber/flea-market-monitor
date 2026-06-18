import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

const SYSTEM_PROMPT = `You convert a Japanese flea-market shopping request into a JSON search config.
Output ONLY a single valid JSON object. No markdown, no code fences, no explanation.

JSON keys:
{
  "keyword": string — search terms only (the product name). Space-separated, concise. Do NOT include price or conditions here.
  "max_price": integer — the user's max budget in yen. Parse Japanese units: 万=10000, 千=1000 (e.g. "2万円"=20000, "1万5千"=15000). If unspecified, estimate a reasonable value for the item.
  "discount_threshold": integer — percent below market to count as a good deal. Default 0 if unspecified (0 = notify whenever price is under max_price).
  "exclude_words": string[] — Japanese (or romaji) words to exclude from item titles. Include BOTH types:
    (1) Quality filters: "ジャンク","部品取り","破損","レプリカ","コピー" as appropriate.
    (2) Accessory/peripheral filters: common items that appear in search results for this product but are NOT the product itself. Be aggressive. Examples:
        - monitor/display → ["ケーブル","HDMI","DisplayPort","アーム","スタンド","クリーナー","保護フィルム","スピーカー"]
        - gaming console → ["ソフト","コントローラー","ケース","充電器","カバー","ポーチ"]
        - camera body → ["レンズ","ストラップ","バッグ","フィルター","三脚","充電器"]
        - bicycle → ["ヘルメット","グローブ","ライト","空気入れ","チェーン","タイヤ"]
        - smartphone → ["ケース","カバー","フィルム","充電器","ケーブル","イヤホン"]
  "require_words": string[] — Japanese words that MUST appear in the title. Empty array if none.
  "note": string — 1-2 sentences in JAPANESE summarizing the buyer's intent (use, desired condition, what to avoid). MUST be written in Japanese.
  "genre": string — product category to prevent cross-category noise. Choose ONE from: "" (general/unclear), "electronics" (家電・PC・スマホ・モニター), "fashion" (衣類・アパレル), "automotive" (自動車・バイク部品), "sports" (スポーツ・アウトドア), "games" (ゲーム・おもちゃ), "books" (本・音楽・映画), "interior" (インテリア・家具). Example: a monitor search → "electronics" prevents y2k fashion results.
}

Rules:
- "keyword" must contain product name terms only, never the budget or adjectives like 安い.
- Always set "genre" to the most fitting category. Only use "" if truly ambiguous.
- For "exclude_words", always add relevant accessory/peripheral words — this is the most important filter.
- Output JSON only.

Example input: "2Kモニター 15000円以下"
Example output:
{"keyword":"2K モニター","max_price":15000,"discount_threshold":0,"exclude_words":["ジャンク","破損","ケーブル","HDMI","DisplayPort","アーム","スタンド","クリーナー","保護フィルム"],"require_words":[],"note":"2K解像度のモニターが欲しい。ケーブルやスタンド等のアクセサリーは不要。","genre":"electronics"}`;

function extractJson(text: string): Record<string, unknown> | null {
  // コードフェンスや前後テキストを除去してJSON部分を抜く
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY が未設定です（.env.local または Vercel環境変数）" },
      { status: 500 }
    );
  }

  let text: string;
  try {
    const body = await req.json();
    text = (body.text ?? "").toString().trim();
  } catch {
    return NextResponse.json({ error: "リクエスト不正" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "テキストが空です" }, { status: 400 });
  }

  for (const model of MODELS) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/flea-market-monitor",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
          max_tokens: 400,
          temperature: 0.2,
        }),
      });
      if (r.status === 429) continue; // レート制限 → 次のモデル
      if (!r.ok) continue;
      const j = await r.json();
      const content: string = j?.choices?.[0]?.message?.content ?? "";
      const parsed = extractJson(content);
      if (!parsed) continue;

      // 正規化
      const VALID_GENRES = ["", "electronics", "fashion", "automotive", "sports", "games", "books", "interior"];
      const result = {
        keyword: String(parsed.keyword ?? "").trim(),
        max_price: Number(parsed.max_price) || 10000,
        discount_threshold: Number(parsed.discount_threshold) || 20,
        exclude_words: Array.isArray(parsed.exclude_words)
          ? parsed.exclude_words.map((s) => String(s).trim()).filter(Boolean)
          : [],
        require_words: Array.isArray(parsed.require_words)
          ? parsed.require_words.map((s) => String(s).trim()).filter(Boolean)
          : [],
        note: String(parsed.note ?? "").trim(),
        genre: VALID_GENRES.includes(String(parsed.genre)) ? String(parsed.genre) : "",
      };
      if (!result.keyword) continue;
      return NextResponse.json({ ok: true, config: result, model });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: "AI変換に失敗しました。もう一度お試しください。" }, { status: 502 });
}
