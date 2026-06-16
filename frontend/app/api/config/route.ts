import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_PATH = join(process.cwd(), "..", "config.json");
const CONFIG_FILE_PATH = "config.json";

interface GitHubCreds {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

function getCredsFromRequest(req: NextRequest): GitHubCreds | null {
  // クライアントヘッダー優先、なければ環境変数にフォールバック
  const token = req.headers.get("x-github-token") || process.env.GITHUB_TOKEN;
  const owner = req.headers.get("x-github-owner") || process.env.GITHUB_OWNER;
  const repo = req.headers.get("x-github-repo") || process.env.GITHUB_REPO;
  const branch = req.headers.get("x-github-branch") || process.env.GITHUB_BRANCH || "main";
  if (!token || !owner || !repo) return null;
  return { token, owner, repo, branch };
}

async function readConfigGitHub(
  creds: GitHubCreds
): Promise<{ config: object; sha: string } | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${creds.owner}/${creds.repo}/contents/${CONFIG_FILE_PATH}?ref=${creds.branch}`,
      {
        headers: {
          Authorization: `Bearer ${creds.token}`,
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

async function writeConfigGitHub(
  creds: GitHubCreds,
  config: object,
  sha: string
): Promise<boolean> {
  try {
    const content = Buffer.from(JSON.stringify(config, null, 2)).toString("base64");
    const res = await fetch(
      `https://api.github.com/repos/${creds.owner}/${creds.repo}/contents/${CONFIG_FILE_PATH}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "chore: UI設定更新",
          content,
          sha,
          branch: creds.branch,
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

export async function GET(req: NextRequest) {
  const creds = getCredsFromRequest(req);
  if (creds) {
    const result = await readConfigGitHub(creds);
    if (result) return NextResponse.json(result.config);
  }
  return NextResponse.json(readConfigLocal());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (typeof body.monitoring_enabled !== "boolean" || !Array.isArray(body.keywords)) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    const creds = getCredsFromRequest(req);
    if (creds) {
      const ghResult = await readConfigGitHub(creds);
      if (!ghResult) {
        return NextResponse.json(
          { error: "GitHubへの接続に失敗しました。トークンとユーザー名を確認してください。" },
          { status: 500 }
        );
      }
      const current = ghResult.config as Record<string, unknown>;
      const updated = {
        ...body,
        history: body.history ?? current.history ?? [],
      };
      const ok = await writeConfigGitHub(creds, updated, ghResult.sha);
      if (ok) return NextResponse.json({ ok: true });
      return NextResponse.json(
        {
          error:
            "GitHubへの書き込みに失敗しました。トークンにrepoスコープの権限があるか確認してください。",
        },
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
