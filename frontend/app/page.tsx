"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Trash2,
  Save,
  Power,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Sparkles,
  ShoppingBag,
  Bot,
  Link,
  Heart,
} from "lucide-react";

// ==================== 型定義 ====================
interface Platform {
  mercari: boolean;
  rakuma: boolean;
  paypay: boolean;
}

interface KeywordConfig {
  id: string;
  keyword: string;
  min_price: number;
  max_price: number;
  discount_threshold: number;
  platforms: Platform;
  precious_metal_mode: boolean;
  metal_type: "silver" | "gold";
  exclude_words: string[];
  require_words: string[];
  note: string;
  enabled: boolean;
  genre: string;
  exclude_junk: boolean;
  model_number: string;
}

interface HistoryItem {
  id: string;
  name: string;
  price: number;
  platform: string;
  url: string;
  image_url: string;
  keyword: string;
  ai_comment: string;
  ai_ok: boolean;
  market_info: string;
  detected_at: string;
}

interface Config {
  monitoring_enabled: boolean;
  keywords: KeywordConfig[];
  history: HistoryItem[];
}

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

interface LearnProposal {
  note: string;
  exclude_words: string[];
  require_words: string[];
  explanation: string;
}

// ==================== GitHub認証ヘルパー ====================
function getGitHubHeaders(): Record<string, string> {
  try {
    const stored = localStorage.getItem("github_config");
    if (!stored) return {};
    const gc: GitHubConfig = JSON.parse(stored);
    if (!gc.token || !gc.owner || !gc.repo) return {};
    return {
      "x-github-token": gc.token,
      "x-github-owner": gc.owner,
      "x-github-repo": gc.repo,
      "x-github-branch": gc.branch || "main",
    };
  } catch {
    return {};
  }
}

function loadGitHubConfig(): GitHubConfig | null {
  try {
    const stored = localStorage.getItem("github_config");
    if (!stored) return null;
    const gc: GitHubConfig = JSON.parse(stored);
    if (!gc.token || !gc.owner || !gc.repo) return null;
    return gc;
  } catch {
    return null;
  }
}

// ==================== API関数 ====================
async function fetchConfig(): Promise<Config> {
  const res = await fetch("/api/config", {
    headers: getGitHubHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("設定読み込み失敗");
  return res.json();
}

async function saveConfig(config: Config): Promise<void> {
  const res = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getGitHubHeaders() },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "設定保存失敗");
  }
}

// ==================== プラットフォームバッジ ====================
function PlatformBadge({ platform }: { platform: string }) {
  const styles: Record<string, string> = {
    メルカリ: "bg-red-100 text-red-700",
    ラクマ: "bg-orange-100 text-orange-700",
    PayPayフリマ: "bg-yellow-100 text-yellow-800",
  };
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded font-medium ${
        styles[platform] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {platform}
    </span>
  );
}

// ==================== 新着カード ====================
function ArrivalCard({
  item,
  isNew,
  isLiked,
  onToggleLike,
  onDislike,
}: {
  item: HistoryItem;
  isNew: boolean;
  isLiked: boolean;
  onToggleLike: () => void;
  onDislike: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  const relativeTime = () => {
    const diff = Date.now() - new Date(item.detected_at).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${Math.max(0, mins)}分前`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}時間前`;
    return `${Math.floor(hours / 24)}日前`;
  };

  return (
    <div className="border rounded-lg bg-white shadow-sm p-3 flex gap-3">
      <div className="w-20 h-20 flex-shrink-0 rounded-md overflow-hidden bg-gray-100 flex items-center justify-center">
        {item.image_url && !imgError ? (
          <img
            src={item.image_url}
            alt={item.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <ShoppingBag size={24} className="text-gray-300" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm leading-snug line-clamp-2 flex-1">{item.name}</p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isNew && (
              <span className="text-xs bg-teal-500 text-white px-1.5 py-0.5 rounded font-bold">
                NEW
              </span>
            )}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-600"
            >
              <ExternalLink size={15} />
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className="font-bold text-gray-900 text-sm">
            ¥{item.price.toLocaleString()}
          </span>
          <PlatformBadge platform={item.platform} />
          <span className="text-xs text-gray-400">#{item.keyword}</span>
        </div>

        <div className="flex items-center gap-1 mt-1">
          <div className="flex items-start gap-1 flex-1 min-w-0">
            {item.ai_ok ? (
              <CheckCircle size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
            ) : (
              <Bot size={13} className="text-gray-300 flex-shrink-0 mt-0.5" />
            )}
            <p className="text-xs text-gray-500 line-clamp-1">
              {item.ai_comment.replace(/^\[.*?\]\s*/, "")}
            </p>
          </div>
          <button
            onClick={onToggleLike}
            className="flex-shrink-0 px-1 text-base leading-none transition-transform hover:scale-125 active:scale-110"
            title={isLiked ? "お気に入り解除" : "お気に入り登録"}
          >
            {isLiked ? (
              <span className="text-red-500">♥</span>
            ) : (
              <span className="text-gray-300 hover:text-red-300">♡</span>
            )}
          </button>
          <button
            onClick={onDislike}
            className="flex-shrink-0 px-1 text-base leading-none transition-transform hover:scale-125 active:scale-110 text-gray-300 hover:text-gray-500"
            title="この商品を非表示にする"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-0.5">{relativeTime()}</p>
      </div>
    </div>
  );
}

// ==================== GitHub接続設定カード ====================
function GitHubSettingsCard({ onConfigured }: { onConfigured: () => void }) {
  const [gc, setGc] = useState<GitHubConfig>(() => ({
    token: "",
    owner: "",
    repo: "flea-market-monitor",
    branch: "main",
  }));
  const [expanded, setExpanded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<"ok" | "error" | null>(null);
  const [resultMsg, setResultMsg] = useState("");
  const configured = !!loadGitHubConfig();

  useEffect(() => {
    const saved = loadGitHubConfig();
    if (saved) setGc(saved);
    else setExpanded(true);
  }, []);

  const connect = async () => {
    if (!gc.token || !gc.owner || !gc.repo) return;
    setTesting(true);
    setResult(null);
    try {
      localStorage.setItem("github_config", JSON.stringify(gc));
      const res = await fetch("/api/config", {
        headers: {
          "x-github-token": gc.token,
          "x-github-owner": gc.owner,
          "x-github-repo": gc.repo,
          "x-github-branch": gc.branch || "main",
        },
        cache: "no-store",
      });
      if (res.ok) {
        setResult("ok");
        setResultMsg("接続成功！設定が読み込まれました。");
        setExpanded(false);
        onConfigured();
      } else {
        const data = await res.json().catch(() => ({}));
        setResult("error");
        setResultMsg(data.error || "接続に失敗しました。");
        localStorage.removeItem("github_config");
      }
    } catch {
      setResult("error");
      setResultMsg("ネットワークエラーが発生しました。");
      localStorage.removeItem("github_config");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className={`border rounded-lg bg-white shadow-sm ${
        !configured ? "border-amber-300" : ""
      }`}
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <Link size={16} className="text-gray-500" />
          <span className="font-medium text-sm text-gray-800">GitHub接続設定</span>
          {configured ? (
            <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded">
              接続済み
            </span>
          ) : (
            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
              ⚠ 要設定
            </span>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-gray-600"
        >
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            キーワードを保存・監視するには GitHub Personal Access Token が必要です。
            <br />
            <a
              href="https://github.com/settings/tokens/new?scopes=repo&description=flea-market-monitor"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              こちらでトークンを発行（repoスコープにチェック）→
            </a>
          </p>

          <div>
            <label className="text-xs font-medium text-gray-700">
              Personal Access Token <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={gc.token}
              onChange={(e) => setGc({ ...gc, token: e.target.value })}
              placeholder="ghp_xxxxxxxxxxxx"
              className="mt-1 w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">
                GitHubユーザー名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={gc.owner}
                onChange={(e) => setGc({ ...gc, owner: e.target.value })}
                placeholder="username"
                className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">リポジトリ名</label>
              <input
                type="text"
                value={gc.repo}
                onChange={(e) => setGc({ ...gc, repo: e.target.value })}
                className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {result === "ok" && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
              ✓ {resultMsg}
            </p>
          )}
          {result === "error" && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              ✗ {resultMsg}
            </p>
          )}

          <button
            onClick={connect}
            disabled={testing || !gc.token || !gc.owner || !gc.repo}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            {testing ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                接続テスト中...
              </>
            ) : (
              <>
                <Link size={15} />
                接続して保存
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ==================== ジャンルラベル ====================
const GENRE_LABELS: Record<string, string> = {
  "": "指定なし",
  electronics: "家電・PC・スマホ",
  fashion: "ファッション・衣類",
  automotive: "自動車・バイク部品",
  sports: "スポーツ・アウトドア",
  games: "ゲーム・おもちゃ",
  books: "本・音楽・映画",
  interior: "インテリア・家具",
};

const GENRE_EXCLUDE_WORDS_FRONT: Record<string, string[]> = {
  electronics: ["y2k", "ファッション", "服", "古着", "レディース", "メンズ", "コーデ", "アパレル", "ウェア", "シャツ", "パンツ"],
  fashion: ["家電", "スマホ", "パソコン", "モニター", "プリンター", "カメラ"],
  automotive: ["ミニカー", "プラモデル", "おもちゃ", "フィギュア", "模型", "ラジコン"],
  sports: ["フィギュア", "プラモデル", "おもちゃ"],
  games: ["工具", "部品", "素材"],
  books: ["工具", "部品"],
  interior: ["フィギュア", "プラモデル", "ミニチュア"],
};

// ==================== キーワードカード ====================
function KeywordCard({
  kw,
  onChange,
  onDelete,
  likedItems,
  onClearLiked,
}: {
  kw: KeywordConfig;
  onChange: (updated: KeywordConfig) => void;
  onDelete: () => void;
  likedItems: HistoryItem[];
  onClearLiked: (ids: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposal, setProposal] = useState<LearnProposal | null>(null);
  const [proposalError, setProposalError] = useState("");
  const [genreDetecting, setGenreDetecting] = useState(false);

  const detectGenre = async () => {
    if (!kw.keyword.trim()) return;
    setGenreDetecting(true);
    try {
      const res = await fetch("/api/parse-keyword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: kw.keyword }),
      });
      const data = await res.json();
      if (res.ok && data.config) {
        const aiExcludes: string[] = data.config.exclude_words ?? [];
        const merged = Array.from(new Set([...kw.exclude_words, ...aiExcludes]));
        onChange({
          ...kw,
          genre: data.config.genre ?? kw.genre,
          exclude_words: merged,
        });
      }
    } catch {
      // 失敗しても無視
    } finally {
      setGenreDetecting(false);
    }
  };

  const learnFromLikes = async () => {
    setProposalLoading(true);
    setProposal(null);
    setProposalError("");
    try {
      const res = await fetch("/api/learn-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword_config: kw, liked_items: likedItems }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "学習に失敗しました");
      setProposal({
        note: data.note,
        exclude_words: data.exclude_words,
        require_words: data.require_words,
        explanation: data.explanation,
      });
    } catch (e) {
      setProposalError(e instanceof Error ? e.message : "学習に失敗しました");
    } finally {
      setProposalLoading(false);
    }
  };

  const applyProposal = () => {
    if (!proposal) return;
    const parts = [proposal.note];
    if (proposal.exclude_words.length > 0)
      parts.push(`NGワード: ${proposal.exclude_words.join(", ")}`);
    if (proposal.require_words.length > 0)
      parts.push(`必須: ${proposal.require_words.join(", ")}`);
    onChange({
      ...kw,
      note: parts.filter(Boolean).join("\n"),
      exclude_words: [],
      require_words: [],
    });
    onClearLiked(likedItems.map((i) => i.id));
    setProposal(null);
  };

  return (
    <div className={`border rounded-lg bg-white shadow-sm ${!kw.enabled ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={() => onChange({ ...kw, enabled: !kw.enabled })}
          className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
            kw.enabled ? "bg-green-500" : "bg-gray-300"
          }`}
        >
          <div
            className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${
              kw.enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>

        <span className="font-medium flex-1 truncate">{kw.keyword || "（キーワード未設定）"}</span>
        {likedItems.length > 0 && (
          <span className="text-xs text-red-400 font-medium">♥ {likedItems.length}</span>
        )}
        <span className="text-sm text-gray-500">
          {(kw.min_price ?? 0) > 0 ? `¥${kw.min_price.toLocaleString()}〜` : ""}¥{kw.max_price.toLocaleString()}
        </span>

        <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-600">
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        <button onClick={onDelete} className="text-red-400 hover:text-red-600">
          <Trash2 size={18} />
        </button>
      </div>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">キーワード</label>
              <input
                type="text"
                value={kw.keyword}
                onChange={(e) => onChange({ ...kw, keyword: e.target.value })}
                className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">型番・モデル名（任意）</label>
              <input
                type="text"
                value={kw.model_number ?? ""}
                onChange={(e) => onChange({ ...kw, model_number: e.target.value })}
                placeholder="例: BenQ EW2880U, iPhone 14 Pro"
                className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-gray-700">価格帯</label>
              <div className="mt-2 space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">最低価格</span>
                    <span className="font-medium text-gray-700">
                      {(kw.min_price ?? 0) === 0 ? "制限なし" : `¥${kw.min_price.toLocaleString()}`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={300000}
                    step={500}
                    value={kw.min_price ?? 0}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onChange({ ...kw, min_price: val, max_price: Math.max(kw.max_price, val) });
                    }}
                    className="w-full accent-blue-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">上限価格</span>
                    <span className="font-medium text-gray-700">¥{kw.max_price.toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={300000}
                    step={500}
                    value={kw.max_price}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onChange({ ...kw, max_price: val, min_price: Math.min(kw.min_price ?? 0, val) });
                    }}
                    className="w-full accent-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-300 mt-0.5">
                <span>¥0</span>
                <span>¥300,000</span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-gray-700">
                お得判定閾値（相場より何%以下で通知）
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="range"
                  min={0}
                  max={80}
                  value={kw.discount_threshold}
                  onChange={(e) =>
                    onChange({ ...kw, discount_threshold: Number(e.target.value) })
                  }
                  className="flex-1"
                />
                <span className="text-sm font-bold w-12 text-right">
                  {kw.discount_threshold}%
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {kw.discount_threshold === 0
                  ? "0% = 上限価格以下なら全て通知"
                  : `相場より${kw.discount_threshold}%以上安い場合のみ通知`}
              </p>
            </div>
          </div>


          <div>
            <label className="text-sm font-medium text-gray-700">監視プラットフォーム</label>
            <div className="flex gap-4 mt-2">
              {(["mercari", "rakuma", "paypay"] as const).map((p) => {
                const labels = { mercari: "メルカリ", rakuma: "ラクマ", paypay: "PayPayフリマ" };
                return (
                  <label key={p} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={kw.platforms[p]}
                      onChange={(e) =>
                        onChange({ ...kw, platforms: { ...kw.platforms, [p]: e.target.checked } })
                      }
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm">{labels[p]}</span>
                  </label>
                );
              })}
            </div>
          </div>


          <div>
            <label className="text-sm font-medium text-gray-700">ジャンル（カテゴリ絞り込み）</label>
            <div className="flex gap-2 mt-1">
              <select
                value={kw.genre ?? ""}
                onChange={(e) => onChange({ ...kw, genre: e.target.value })}
                className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              >
                {Object.entries(GENRE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                onClick={detectGenre}
                disabled={genreDetecting || !kw.keyword.trim()}
                className="px-3 py-2 text-xs font-medium bg-purple-100 hover:bg-purple-200 disabled:bg-gray-100 text-purple-700 disabled:text-gray-400 rounded transition-colors whitespace-nowrap"
              >
                {genreDetecting ? "判定中…" : "AIで自動設定"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              ジャンルを設定するとカテゴリを絞り込んで検索します。「AIで自動設定」で自動判別します。
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">
              AIへの指示
            </label>
            <textarea
              value={kw.note}
              onChange={(e) => onChange({ ...kw, note: e.target.value })}
              placeholder={"例: 24インチ以上のもの。ジャンク品・訳あり品は除外。白または黒のみ。動作確認済みの良品が欲しい。"}
              rows={3}
              className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
            />
            <p className="text-xs text-gray-400 mt-0.5">
              自然文で条件を書いてください。AIが文脈を理解して判定します。
            </p>
          </div>

          {/* ❤️ 学習ボタン */}
          {likedItems.length >= 3 && (
            <div className="rounded-lg bg-pink-50 border border-pink-200 p-3 space-y-2">
              <p className="text-sm font-medium text-pink-800">
                ❤️ {likedItems.length}件のお気に入りから学習
              </p>
              <p className="text-xs text-pink-600">
                お気に入りした商品の共通点をAIが分析し、検索条件（note・除外ワード・必須ワード）を自動改善します。
              </p>
              {proposalError && (
                <p className="text-xs text-red-600 bg-red-50 rounded p-2">{proposalError}</p>
              )}
              {!proposal && (
                <button
                  onClick={learnFromLikes}
                  disabled={proposalLoading}
                  className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300 text-white text-sm font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  {proposalLoading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      AIが分析中...
                    </>
                  ) : (
                    <>
                      <Heart size={14} />
                      好みを分析して条件を改善
                    </>
                  )}
                </button>
              )}
              {proposal && (
                <div className="space-y-2">
                  <div className="text-xs bg-white border border-pink-200 rounded p-2 space-y-1.5">
                    <p className="font-medium text-gray-700">AIの提案（「AIへの指示」に反映されます）:</p>
                    <p className="text-gray-700 whitespace-pre-wrap">
                      {[
                        proposal.note,
                        proposal.exclude_words.length > 0 ? `NGワード: ${proposal.exclude_words.join(", ")}` : "",
                        proposal.require_words.length > 0 ? `必須: ${proposal.require_words.join(", ")}` : "",
                      ].filter(Boolean).join("\n")}
                    </p>
                    <p className="text-gray-400 italic border-t border-pink-100 pt-1">
                      {proposal.explanation}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={applyProposal}
                      className="flex-1 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                    >
                      適用する
                    </button>
                    <button
                      onClick={() => setProposal(null)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg transition-colors"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== メインページ ====================
export default function Home() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [githubConfigured, setGithubConfigured] = useState(false);
  const [activeTab, setActiveTab] = useState<"arrivals" | "settings">("arrivals");
  const [filter, setFilter] = useState<"all" | "ai_ok" | "recent">("all");
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [nlText, setNlText] = useState("");
  const [nlLoading, setNlLoading] = useState(false);

  const [lastSeenAt] = useState<string>(() => {
    if (typeof window === "undefined") return new Date(0).toISOString();
    return localStorage.getItem("arrivals_last_seen_at") ?? new Date(0).toISOString();
  });

  const [likedIds, setLikedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("liked_items");
      return new Set(JSON.parse(stored ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });

  const toggleLike = useCallback((itemId: string) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      localStorage.setItem("liked_items", JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const clearLikedIds = useCallback((ids: string[]) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      localStorage.setItem("liked_items", JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const [dislikedIds, setDislikedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("disliked_items");
      return new Set(JSON.parse(stored ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });

  const dislikeItem = useCallback((itemId: string) => {
    setDislikedIds((prev) => {
      const next = new Set(prev);
      next.add(itemId);
      localStorage.setItem("disliked_items", JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  useEffect(() => {
    const isConfigured = !!loadGitHubConfig();
    setGithubConfigured(isConfigured);
    if (!isConfigured) setActiveTab("settings");
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchConfig();
      data.keywords = (data.keywords ?? []).map((k) => ({
        ...k,
        exclude_words: k.exclude_words ?? [],
        require_words: k.require_words ?? [],
        note: k.note ?? "",
      }));
      setConfig(data);
    } catch {
      setError("設定の読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (activeTab === "arrivals" && config && typeof window !== "undefined") {
      localStorage.setItem("arrivals_last_seen_at", new Date().toISOString());
    }
  }, [activeTab, config]);

  const unreadCount = useMemo(() => {
    if (!config) return 0;
    return config.history.filter((item) => item.detected_at > lastSeenAt).length;
  }, [config, lastSeenAt]);

  const keywordConfigMap = useMemo(() => {
    const map: Record<string, KeywordConfig> = {};
    config?.keywords.forEach((kw) => { map[kw.keyword] = kw; });
    return map;
  }, [config]);

  const filteredHistory = useMemo(() => {
    if (!config) return [];
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return config.history
      .filter((item) => {
        if (dislikedIds.has(item.id)) return false;
        if (filter === "ai_ok") return item.ai_ok;
        if (filter === "recent") return item.detected_at >= cutoff24h;
        return true;
      })
      .filter((item) => {
        const kw = keywordConfigMap[item.keyword];
        if (!kw) return true;
        const nameLower = item.name.toLowerCase();
        // ジャンル除外
        const genre = kw.genre ?? "";
        const genreExcludes = GENRE_EXCLUDE_WORDS_FRONT[genre] ?? [];
        if (genreExcludes.some((w) => nameLower.includes(w.toLowerCase()))) return false;
        return true;
      })
      .sort((a, b) => b.detected_at.localeCompare(a.detected_at));
  }, [config, filter, dislikedIds, keywordConfigMap]);

  // キーワードごとにグループ化（filteredHistory は新着順ソート済みなので先頭が最新）
  const groupedHistory = useMemo(() => {
    const groups = new Map<string, HistoryItem[]>();
    for (const item of filteredHistory) {
      const existing = groups.get(item.keyword) ?? [];
      groups.set(item.keyword, [...existing, item]);
    }
    return Array.from(groups.entries());
  }, [filteredHistory]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await saveConfig(config);
      setSuccess("設定を保存しました！");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const addKeyword = () => {
    if (!config) return;
    const newKw: KeywordConfig = {
      id: Date.now().toString(),
      keyword: "",
      min_price: 0,
      max_price: 10000,
      discount_threshold: 0,
      platforms: { mercari: true, rakuma: true, paypay: true },
      precious_metal_mode: false,
      metal_type: "silver",
      exclude_words: [],
      require_words: [],
      note: "",
      enabled: true,
      genre: "",
      exclude_junk: true,
      model_number: "",
    };
    setConfig({ ...config, keywords: [...config.keywords, newKw] });
  };

  const addKeywordFromText = async () => {
    if (!config || !nlText.trim()) return;
    setNlLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/parse-keyword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nlText }),
      });
      const data = await res.json();
      if (!res.ok || !data.config) {
        throw new Error(data.error || "変換に失敗しました");
      }
      const c = data.config;
      const newKw: KeywordConfig = {
        id: Date.now().toString(),
        keyword: c.keyword,
        min_price: 0,
        max_price: c.max_price,
        discount_threshold: c.discount_threshold,
        platforms: { mercari: true, rakuma: true, paypay: true },
        precious_metal_mode: false,
        metal_type: "silver",
        exclude_words: c.exclude_words,
        require_words: c.require_words,
        note: c.note,
        enabled: true,
        genre: c.genre ?? "",
        exclude_junk: true,
        model_number: "",
      };
      setConfig({ ...config, keywords: [...config.keywords, newKw] });
      setNlText("");
      setSuccess(`「${c.keyword}」を追加しました。内容を確認して保存してください。`);
      setTimeout(() => setSuccess(""), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "変換に失敗しました");
    } finally {
      setNlLoading(false);
    }
  };

  const updateKeyword = (id: string, updated: KeywordConfig) => {
    if (!config) return;
    setConfig({
      ...config,
      keywords: config.keywords.map((k) => (k.id === id ? updated : k)),
    });
  };

  const deleteKeyword = (id: string) => {
    if (!config) return;
    setConfig({ ...config, keywords: config.keywords.filter((k) => k.id !== id) });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-red-500">
          <p>{error || "設定の読み込みに失敗しました。"}</p>
          <button onClick={load} className="mt-3 text-blue-500 underline">
            再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🛍️ 買い物ウォッチ</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            メルカリ・ラクマ・PayPayフリマの新着を通知
          </p>
        </div>
        <button onClick={load} className="text-gray-400 hover:text-gray-600">
          <RefreshCw size={20} />
        </button>
      </div>

      {/* アラート */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-green-700 text-sm">
          {success}
        </div>
      )}

      {/* タブ */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab("arrivals")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === "arrivals" ? "bg-white shadow text-gray-900" : "text-gray-500"
          }`}
        >
          🛍️ 新着アイテム
          {unreadCount > 0 && (
            <span className="bg-teal-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold leading-none">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === "settings" ? "bg-white shadow text-gray-900" : "text-gray-500"
          }`}
        >
          ⚙️ 検索設定
          {!githubConfigured && (
            <span className="bg-amber-400 text-white text-xs px-1.5 py-0.5 rounded-full font-bold leading-none">
              !
            </span>
          )}
        </button>
      </div>

      {/* 新着タブ */}
      {activeTab === "arrivals" && (
        <div>
          {!githubConfigured && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-3 text-sm">
              <p className="font-medium text-amber-800">GitHub接続が未設定です</p>
              <p className="text-amber-700 text-xs mt-1">
                「検索設定」タブでGitHubトークンを設定するとキーワードの保存・監視が開始されます。
              </p>
              <button
                onClick={() => setActiveTab("settings")}
                className="mt-2 text-xs text-blue-600 underline"
              >
                設定タブへ →
              </button>
            </div>
          )}

          {/* タイプフィルター */}
          <div className="flex gap-2 mb-2">
            {(["all", "ai_ok", "recent"] as const).map((f) => {
              const labels = { all: "すべて", ai_ok: "✓ AI推薦", recent: "24時間以内" };
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filter === f
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {labels[f]}
                </button>
              );
            })}
          </div>

          {/* キーワード絞り込みチップ */}
          {groupedHistory.length >= 2 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => setActiveKeyword(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeKeyword === null
                    ? "bg-gray-700 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                全条件
              </button>
              {groupedHistory.map(([kw, items]) => (
                <button
                  key={kw}
                  onClick={() => setActiveKeyword(activeKeyword === kw ? null : kw)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeKeyword === kw
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  #{kw}
                  <span className="ml-1 opacity-70">{items.length}</span>
                </button>
              ))}
            </div>
          )}

          {groupedHistory.length > 0 && (
            <p className="text-xs text-gray-400 mb-3">
              各商品の ♡ を押すとお気に入り登録 → 3件以上で「検索設定」タブから好みを学習できます
            </p>
          )}

          {/* キーワード別グループ表示 */}
          <div className="space-y-5">
            {groupedHistory.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                {filter === "all" && (
                  <>
                    <ShoppingBag size={32} className="mx-auto mb-2 opacity-40" />
                    <p>まだ新着アイテムがありません</p>
                    <p className="text-sm mt-1">検索設定でキーワードを登録すると表示されます</p>
                  </>
                )}
                {filter === "ai_ok" && <p>AI推薦の商品はまだありません</p>}
                {filter === "recent" && <p>直近24時間の新着はありません</p>}
              </div>
            ) : (
              groupedHistory
                .filter(([kw]) => activeKeyword === null || kw === activeKeyword)
                .map(([keyword, items]) => (
                  <div key={keyword}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <button
                        onClick={() => setActiveKeyword(activeKeyword === keyword ? null : keyword)}
                        className="text-sm font-bold text-gray-800 hover:text-indigo-600 transition-colors"
                      >
                        #{keyword}
                      </button>
                      <span className="text-xs text-gray-400">{items.length}件</span>
                      {items.some((i) => likedIds.has(i.id)) && (
                        <span className="text-xs text-red-400 font-medium">
                          ♥ {items.filter((i) => likedIds.has(i.id)).length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <ArrivalCard
                          key={item.id}
                          item={item}
                          isNew={item.detected_at > lastSeenAt}
                          isLiked={likedIds.has(item.id)}
                          onToggleLike={() => toggleLike(item.id)}
                          onDislike={() => dislikeItem(item.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {/* 設定タブ */}
      {activeTab === "settings" && (
        <div className="space-y-3">
          {/* GitHub接続設定 */}
          <GitHubSettingsCard
            onConfigured={() => {
              setGithubConfigured(true);
              load();
            }}
          />

          {/* 監視ON/OFF */}
          <div
            className={`flex items-center justify-between p-3 rounded-xl ${
              config.monitoring_enabled
                ? "bg-green-50 border border-green-200"
                : "bg-gray-50 border border-gray-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <Power
                size={18}
                className={config.monitoring_enabled ? "text-green-600" : "text-gray-400"}
              />
              <div>
                <p className="font-medium text-sm text-gray-800">自動監視</p>
                <p
                  className={`text-xs ${
                    config.monitoring_enabled ? "text-green-600" : "text-gray-400"
                  }`}
                >
                  {config.monitoring_enabled ? "稼働中 — 約5〜10分ごとに実行" : "停止中"}
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                setConfig({ ...config, monitoring_enabled: !config.monitoring_enabled })
              }
              className={`w-11 h-6 rounded-full transition-colors ${
                config.monitoring_enabled ? "bg-green-500" : "bg-gray-300"
              }`}
            >
              <div
                className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${
                  config.monitoring_enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* 言葉で追加 */}
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={18} className="text-purple-500" />
              <span className="font-semibold text-gray-800 text-sm">言葉で検索を追加</span>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              探したいものを文章で書くと、AIがキーワード・除外条件・上限価格を自動設定します。
            </p>
            <textarea
              value={nlText}
              onChange={(e) => setNlText(e.target.value)}
              placeholder="例: Nintendo Switch 有機ELを2万円以下で。ジャンクや本体なしは除いて、動作品だけ欲しい。"
              rows={2}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-y"
            />
            <button
              onClick={addKeywordFromText}
              disabled={nlLoading || !nlText.trim()}
              className="mt-2 w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm"
            >
              {nlLoading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  AIが設定を作成中...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  この内容で追加
                </>
              )}
            </button>
          </div>

          {config.keywords.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p>検索キーワードが登録されていません</p>
              <p className="text-sm mt-1">上の入力か、下のボタンから追加してください</p>
            </div>
          )}
          {config.keywords.map((kw) => {
            const likedForKw = config.history.filter(
              (item) => item.keyword === kw.keyword && likedIds.has(item.id)
            );
            return (
              <KeywordCard
                key={kw.id}
                kw={kw}
                onChange={(updated) => updateKeyword(kw.id, updated)}
                onDelete={() => deleteKeyword(kw.id)}
                likedItems={likedForKw}
                onClearLiked={clearLikedIds}
              />
            );
          })}

          <button
            onClick={addKeyword}
            className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            キーワードを追加
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Save size={18} />
            {saving ? "保存中..." : "設定を保存"}
          </button>
        </div>
      )}
    </div>
  );
}
