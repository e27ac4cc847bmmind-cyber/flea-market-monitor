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
  max_price: number;
  discount_threshold: number;
  platforms: Platform;
  precious_metal_mode: boolean;
  metal_type: "silver" | "gold";
  exclude_words: string[];
  require_words: string[];
  note: string;
  enabled: boolean;
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

// ==================== API関数 ====================
async function fetchConfig(): Promise<Config> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("設定読み込み失敗");
  return res.json();
}

async function saveConfig(config: Config): Promise<void> {
  const res = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("設定保存失敗");
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
function ArrivalCard({ item, isNew }: { item: HistoryItem; isNew: boolean }) {
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
      {/* サムネイル */}
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

      {/* 内容 */}
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

        <div className="flex items-start gap-1 mt-1">
          {item.ai_ok ? (
            <CheckCircle size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
          ) : (
            <Bot size={13} className="text-gray-300 flex-shrink-0 mt-0.5" />
          )}
          <p className="text-xs text-gray-500 line-clamp-1">
            {item.ai_comment.replace(/^\[.*?\]\s*/, "")}
          </p>
        </div>

        <p className="text-xs text-gray-400 mt-0.5">{relativeTime()}</p>
      </div>
    </div>
  );
}

// ==================== キーワードカード ====================
function KeywordCard({
  kw,
  onChange,
  onDelete,
}: {
  kw: KeywordConfig;
  onChange: (updated: KeywordConfig) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

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
        <span className="text-sm text-gray-500">¥{kw.max_price.toLocaleString()}以下</span>

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
              <label className="text-sm font-medium text-gray-700">上限金額（円）</label>
              <input
                type="number"
                value={kw.max_price}
                onChange={(e) => onChange({ ...kw, max_price: Number(e.target.value) })}
                className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-gray-700">
                お得判定閾値（相場より何%以下）
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="range"
                  min={5}
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
            <label className="text-sm font-medium text-gray-700">
              除外ワード（カンマ区切り）
            </label>
            <input
              type="text"
              value={kw.exclude_words.join(", ")}
              onChange={(e) =>
                onChange({
                  ...kw,
                  exclude_words: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="例: ジャンク, 部品取り, 破損"
              className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">
              必須ワード（カンマ区切り）
            </label>
            <input
              type="text"
              value={kw.require_words.join(", ")}
              onChange={(e) =>
                onChange({
                  ...kw,
                  require_words: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="例: 動作確認済み, 美品"
              className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">
              希望条件メモ（AIの判定基準）
            </label>
            <textarea
              value={kw.note}
              onChange={(e) => onChange({ ...kw, note: e.target.value })}
              placeholder="例: 動作確認済みの良品が欲しい。外観の傷は少しくらい許容。"
              rows={2}
              className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
            />
          </div>
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
  const [activeTab, setActiveTab] = useState<"arrivals" | "settings">("arrivals");
  const [filter, setFilter] = useState<"all" | "ai_ok" | "recent">("all");
  const [nlText, setNlText] = useState("");
  const [nlLoading, setNlLoading] = useState(false);

  // セッション開始時の既読タイムスタンプ（セッション中は変わらない）
  const [lastSeenAt] = useState<string>(() => {
    if (typeof window === "undefined") return new Date(0).toISOString();
    return localStorage.getItem("arrivals_last_seen_at") ?? new Date(0).toISOString();
  });

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

  // 新着タブを開いたら既読タイムスタンプをlocalStorageに記録
  useEffect(() => {
    if (activeTab === "arrivals" && config && typeof window !== "undefined") {
      localStorage.setItem("arrivals_last_seen_at", new Date().toISOString());
    }
  }, [activeTab, config]);

  const unreadCount = useMemo(() => {
    if (!config) return 0;
    return config.history.filter((item) => item.detected_at > lastSeenAt).length;
  }, [config, lastSeenAt]);

  const filteredHistory = useMemo(() => {
    if (!config) return [];
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return config.history
      .filter((item) => {
        if (filter === "ai_ok") return item.ai_ok;
        if (filter === "recent") return item.detected_at >= cutoff24h;
        return true;
      })
      .sort((a, b) => b.detected_at.localeCompare(a.detected_at));
  }, [config, filter]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await saveConfig(config);
      setSuccess("設定を保存しました！");
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const addKeyword = () => {
    if (!config) return;
    const newKw: KeywordConfig = {
      id: Date.now().toString(),
      keyword: "",
      max_price: 10000,
      discount_threshold: 20,
      platforms: { mercari: true, rakuma: true, paypay: true },
      precious_metal_mode: false,
      metal_type: "silver",
      exclude_words: [],
      require_words: [],
      note: "",
      enabled: true,
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
        max_price: c.max_price,
        discount_threshold: c.discount_threshold,
        platforms: { mercari: true, rakuma: true, paypay: true },
        precious_metal_mode: false,
        metal_type: "silver",
        exclude_words: c.exclude_words,
        require_words: c.require_words,
        note: c.note,
        enabled: true,
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
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "settings" ? "bg-white shadow text-gray-900" : "text-gray-500"
          }`}
        >
          ⚙️ 検索設定
        </button>
      </div>

      {/* 新着タブ */}
      {activeTab === "arrivals" && (
        <div>
          {/* フィルターバー */}
          <div className="flex gap-2 mb-3">
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

          {/* アイテム一覧 */}
          <div className="space-y-2">
            {filteredHistory.length === 0 ? (
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
              filteredHistory.map((item) => (
                <ArrivalCard key={item.id} item={item} isNew={item.detected_at > lastSeenAt} />
              ))
            )}
          </div>
        </div>
      )}

      {/* 設定タブ */}
      {activeTab === "settings" && (
        <div className="space-y-3">
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
                  {config.monitoring_enabled ? "稼働中 — 1分ごとに実行" : "停止中"}
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
          {config.keywords.map((kw) => (
            <KeywordCard
              key={kw.id}
              kw={kw}
              onChange={(updated) => updateKeyword(kw.id, updated)}
              onDelete={() => deleteKeyword(kw.id)}
            />
          ))}

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
