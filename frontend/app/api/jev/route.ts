import { NextRequest, NextResponse } from "next/server";

const ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const MODELS = ["typesafe/jev-1.13", "~typesafe/jev-latest"];
const MAX_BODY_BYTES = 65536;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY が未設定です" }, { status: 500 });
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "リクエストが大きすぎます（64KBまで）" }, { status: 413 });
  }

  let body: { model?: unknown; state?: unknown; questions?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "リクエスト不正" }, { status: 400 });
  }

  const { model, state, questions } = body;
  if (typeof model !== "string" || !MODELS.includes(model)) {
    return NextResponse.json({ error: "モデル指定が不正です" }, { status: 400 });
  }
  if (!questions || typeof questions !== "object" || Array.isArray(questions) || Object.keys(questions).length === 0) {
    return NextResponse.json({ error: "質問が1つもありません" }, { status: 400 });
  }

  const started = Date.now();
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/flea-market-monitor",
        "X-Title": "Jev Playground",
      },
      body: JSON.stringify({ model, state: state ?? null, questions }),
      signal: AbortSignal.timeout(20000),
    });
    const elapsedMs = Date.now() - started;
    const text = await r.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text.slice(0, 500);
    }
    if (!r.ok) {
      return NextResponse.json({ error: `Jev HTTP ${r.status}`, detail: data, elapsedMs }, { status: 502 });
    }
    return NextResponse.json({ result: data, elapsedMs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    return NextResponse.json({ error: `Jev呼び出し失敗: ${msg}` }, { status: 502 });
  }
}
