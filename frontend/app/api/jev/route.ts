import { NextRequest, NextResponse } from "next/server";

// TypeSafe AI (Jev) API プロキシ
// 仕様は公式SDK @typesafe-ai/sdk 0.6.0 準拠:
//   POST {base}/v1/systemone  { model, state, questions }  Authorization: Bearer <key>
//   GET  {base}/v1/models     -> { models: [...] }
const BASE_URL = (process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai").replace(/\/+$/, "");
const DEFAULT_MODEL = process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest";
const TIMEOUT_MS = 20000;

// サーバー側の TYPESAFE_API_KEY を優先し、未設定なら画面で入力されたキー（x-jev-key）を使う
function resolveKey(req: NextRequest): string | null {
  return process.env.TYPESAFE_API_KEY || req.headers.get("x-jev-key") || null;
}

async function forward(path: string, key: string, init: RequestInit) {
  const started = Date.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return NextResponse.json(
    {
      ok: res.ok,
      status: res.status,
      latency_ms: Date.now() - started,
      request_id: res.headers.get("x-typesafe-request-id"),
      body,
    },
    { status: res.ok ? 200 : res.status }
  );
}

function errorResponse(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ ok: false, status: 502, body: { error: `接続エラー: ${msg}` } }, { status: 502 });
}

// 利用可能なモデル一覧 & サーバー側キーの有無
export async function GET(req: NextRequest) {
  const key = resolveKey(req);
  if (!key) {
    return NextResponse.json({ ok: false, server_key: false, default_model: DEFAULT_MODEL, body: null });
  }
  try {
    const res = await forward("/v1/models", key, { method: "GET" });
    const data = await res.json();
    return NextResponse.json({ ...data, server_key: !!process.env.TYPESAFE_API_KEY, default_model: DEFAULT_MODEL });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const key = resolveKey(req);
  if (!key) {
    return NextResponse.json(
      { ok: false, status: 401, body: { error: "APIキーが未設定です（TYPESAFE_API_KEY または画面で入力）" } },
      { status: 401 }
    );
  }
  let payload: { state?: unknown; questions?: Record<string, unknown>; model?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, status: 400, body: { error: "JSONが不正です" } }, { status: 400 });
  }
  if (!payload.questions || Object.keys(payload.questions).length === 0) {
    return NextResponse.json({ ok: false, status: 400, body: { error: "質問を1つ以上追加してください" } }, { status: 400 });
  }
  try {
    return await forward("/v1/systemone", key, {
      method: "POST",
      body: JSON.stringify({
        model: payload.model || DEFAULT_MODEL,
        state: payload.state ?? null,
        questions: payload.questions,
      }),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
