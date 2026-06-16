import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_PATH = join(process.cwd(), "..", "config.json");

// GitHub API経由でconfig.jsonを読み書き（Vercel環境用）
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH ?? "main";
const CONFIG_FILE_PATH = "config.json";

async function readConfigGitHub(): Promise<object | null> {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) return null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CONFIG_FILE_PATH}?ref=${GITHUB_BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return { config: JSON.parse(content), sha: data.sha };
  } catch {
    return null;
  }
}

async function writeConfigGitHub(config: object, sha: string): Promise<boolean> {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) return false;
  try {
    const content = Buffer.from(JSON.stringify(config, null, 2)).toString("base64");
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CONFIG_FILE_PATH}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "chore: UI設定更新",
          content,
          sha,
          branch: GITHUB_BRANCH,
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

function readConfigLocal(): object {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {}
  return { monitoring_enabled: true, keywords: [], history: [] };
}

function writeConfigLocal(config: object): boolean {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  // GitHub API優先（Vercel環境）、なければローカルファイル
  const ghResult = await readConfigGitHub() as { config: object; sha: string } | null;
  if (ghResult) {
    return NextResponse.json(ghResult.config);
  }
  return NextResponse.json(readConfigLocal());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (typeof body.monitoring_enabled !== "boolean" || !Array.isArray(body.keywords)) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    // GitHub API経由で保存（Vercel）
    const ghResult = await readConfigGitHub() as { config: object; sha: string } | null;
    if (GITHUB_TOKEN || GITHUB_OWNER || GITHUB_REPO) {
      // GitHub環境変数が設定されているのに読み込めない = トークン問題
      if (!ghResult) {
        return NextResponse.json(
          { error: "GitHubへの接続に失敗しました。VercelのGITHUB_TOKEN環境変数が正しく設定されているか確認してください。" },
          { status: 500 }
        );
      }
      const current = ghResult.config as Record<string, unknown>;
      const updated = { ...body, history: body.history ?? (current as Record<string, unknown>).history ?? [] };
      const ok = await writeConfigGitHub(updated, ghResult.sha);
      if (ok) return NextResponse.json({ ok: true });
      return NextResponse.json(
        { error: "GitHubへの書き込みに失敗しました。GITHUB_TOKENにrepoスコープの書き込み権限があるか確認してください。" },
        { status: 500 }
      );
    }

    // ローカルファイル保存（ローカル開発環境のみ）
    const current = readConfigLocal() as Record<string, unknown>;
    const updated = { ...body, history: body.history ?? current.history ?? [] };
    writeConfigLocal(updated);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("設定保存エラー:", e);
    return NextResponse.json({ error: "保存失敗" }, { status: 500 });
  }
}
