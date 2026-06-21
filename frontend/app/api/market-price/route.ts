import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let keyword: string, modelNumber: string;
  try {
    const body = await req.json();
    keyword = (body.keyword ?? "").toString().trim();
    modelNumber = (body.model_number ?? "").toString().trim();
  } catch {
    return NextResponse.json({ error: "リクエスト不正" }, { status: 400 });
  }

  const q = [keyword, modelNumber].filter(Boolean).join(" ").trim();
  if (!q) return NextResponse.json({ error: "キーワードが空です" }, { status: 400 });

  try {
    const url = `https://jp.mercari.com/search?keyword=${encodeURIComponent(q)}&status=sold_out&sort=created_time&order=desc`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!r.ok) {
      return NextResponse.json(
        { error: `メルカリへの接続失敗 (HTTP ${r.status})` },
        { status: 502 }
      );
    }

    const html = await r.text();

    // item linkの周辺から価格を抽出（<a href="/item/mXXXX">内の ¥X,XXX）
    const prices: number[] = [];
    const itemRe = /href="\/item\/m\d+[^"]*"[\s\S]{1,600}?¥([\d,]+)/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(html)) !== null) {
      const p = parseInt(m[1].replace(/,/g, ""), 10);
      if (p >= 100 && p <= 5_000_000) prices.push(p);
    }

    if (prices.length < 3) {
      return NextResponse.json(
        { error: "売れ済みデータが不足しています（取得件数3件未満）。キーワードを変えてお試しください。" },
        { status: 404 }
      );
    }

    // 外れ値除去（上下10%カット）して平均
    const sorted = [...prices].sort((a, b) => a - b);
    const cut = Math.max(1, Math.floor(sorted.length * 0.1));
    const trimmed = sorted.slice(cut, sorted.length - cut);
    const avg = Math.round(trimmed.reduce((s, v) => s + v, 0) / trimmed.length);

    return NextResponse.json({ ok: true, price: avg, samples: prices.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    return NextResponse.json({ error: `取得エラー: ${msg}` }, { status: 500 });
  }
}
