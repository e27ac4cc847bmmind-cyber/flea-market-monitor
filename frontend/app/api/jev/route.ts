import { NextRequest, NextResponse } from "next/server";

// Jev API プロキシ（TypeSafe 直 または OpenRouter 経由）
// 仕様は公式SDK @typesafe-ai/sdk 0.6.0 準拠:
//   POST {base}/v1/systemone  { model, state, questions }  Authorization: Bearer <key>
//   GET  {base}/v1/models     -> { models: [...] }（TypeSafe のみ）
// OpenRouter は base = https://openrouter.ai/api で同じ /v1/systemone を提供（jev-latest → typesafe/jev-latest）
const TYPESAFE_BASE = (process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai").replace(/\/+$/, "");
const OPENROUTER_BASE = "https://openrouter.ai/api";
const DEFAULT_MODEL = process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest";
const OPENROUTER_MODELS = ["jev-latest", "jev-1.13"];
const TIMEOUT_MS = 20000;

type Provider = "typesafe" | "openrouter";
interface Target {
  key: string;
  base: string;
  provider: Provider;
  source: "server" | "browser";
}

// 優先順: サーバーの TYPESAFE_API_KEY → サーバーの OPENROUTER_API_KEY → 画面で入力されたキー（x-jev-key）
// 画面入力キーは sk-or- で始まれば OpenRouter として扱う
function resolveTarget(req: NextRequest): Target | null {
  if (process.env.TYPESAFE_API_KEY)
    return { key: process.env.TYPESAFE_API_KEY, base: TYPESAFE_BASE, provider: "typesafe", source: "server" };
  if (process.env.OPENROUTER_API_KEY)
    return { key: process.env.OPENROUTER_API_KEY, base: OPENROUTER_BASE, provider: "openrouter", source: "server" };
  const key = req.headers.get("x-jev-key")?.trim();
  if (!key) return null;
  return key.startsWith("sk-or-")
    ? { key, base: OPENROUTER_BASE, provider: "openrouter", source: "browser" }
    : { key, base: TYPESAFE_BASE, provider: "typesafe", source: "browser" };
}

async function forward(t: Target, path: string, init: RequestInit) {
  const started = Date.now();
  const res = await fetch(`${t.base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t.key}`,
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
      provider: t.provider,
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
  const t = resolveTarget(req);
  const meta = {
    server_key: t?.source === "server",
    provider: t?.provider ?? null,
    default_model: DEFAULT_MODEL,
  };
  if (!t) return NextResponse.json({ ok: false, ...meta, body: null });
  // OpenRouter の /v1/models は全モデル一覧なので使わず、Jev の既知モデルを返す
  if (t.provider === "openrouter")
    return NextResponse.json({ ok: true, ...meta, body: { models: OPENROUTER_MODELS.map((name) => ({ name })) } });
  try {
    const res = await forward(t, "/v1/models", { method: "GET" });
    const data = await res.json();
    return NextResponse.json({ ...data, ...meta });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const t = resolveTarget(req);
  if (!t) {
    return NextResponse.json(
      { ok: false, status: 401, body: { error: "APIキーが未設定です（OPENROUTER_API_KEY / TYPESAFE_API_KEY または画面で入力）" } },
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
    return await forward(t, "/v1/systemone", {
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
