"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Save,
  Power,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
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
  enabled: boolean;
}

interface HistoryItem {
  id: string;
  name: string;
  price: number;
  platform: string;
  url: string;
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

// ==================== コンポーネント ====================
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
            <div>
              <label className="text-sm font-medium text-gray-700">
                お得判定閾値（相場より何%以下）
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="range"
                  min={5}
                  max={80}
                  value={kw.discount_threshold}
                  onChange={(e) => onChange({ ...kw, discount_threshold: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-sm font-bold w-12 text-right">{kw.discount_threshold}%</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">貴金属モード</label>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => onChange({ ...kw, precious_metal_mode: !kw.precious_metal_mode })}
                  className={`w-10 h-6 rounded-full transition-colors ${
                    kw.precious_metal_mode ? "bg-yellow-500" : "bg-gray-300"
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${
                      kw.precious_metal_mode ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
                {kw.precious_metal_mode && (
                  <select
                    value={kw.metal_type}
                    onChange={(e) =>
                      onChange({ ...kw, metal_type: e.target.value as "silver" | "gold" })
                    }
                    className="border rounded px-2 py-1 text-sm"
                  >
                    <option value="silver">銀（Silver）</option>
                    <option value="gold">金（Gold）</option>
                  </select>
                )}
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
        </div>
      )}
    </div>
  );
}

function HistoryCard({ item }: { item: HistoryItem }) {
  return (
    <div className="border rounded-lg bg-white shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {item.ai_ok ? (
              <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
            )}
            <span className="font-medium text-sm truncate">{item.name}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="font-bold text-gray-800">¥{item.price.toLocaleString()}</span>
            <span>{item.platform}</span>
            <span>🔍 {item.keyword}</span>
            <span>{new Date(item.detected_at).toLocaleString("ja-JP")}</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">{item.market_info}</p>
          <p className="text-xs text-blue-600 mt-1">🤖 {item.ai_comment}</p>
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-700 flex-shrink-0"
        >
          <ExternalLink size={16} />
        </a>
      </div>
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
  const [activeTab, setActiveTab] = useState<"settings" | "history">("settings");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchConfig();
      setConfig(data);
    } catch (e) {
      setError("設定の読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      enabled: true,
    };
    setConfig({ ...config, keywords: [...config.keywords, newKw] });
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🛍️ フリマ監視システム</h1>
          <p className="text-sm text-gray-500 mt-1">メルカリ・ラクマ・PayPayフリマを自動監視</p>
        </div>
        <button onClick={load} className="text-gray-400 hover:text-gray-600">
          <RefreshCw size={20} />
        </button>
      </div>

      {/* 監視ON/OFF */}
      <div
        className={`flex items-center justify-between p-4 rounded-xl mb-6 ${
          config.monitoring_enabled ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
        }`}
      >
        <div className="flex items-center gap-3">
          <Power size={20} className={config.monitoring_enabled ? "text-green-600" : "text-red-400"} />
          <div>
            <p className="font-semibold text-gray-800">監視システム</p>
            <p className={`text-sm ${config.monitoring_enabled ? "text-green-600" : "text-red-500"}`}>
              {config.monitoring_enabled ? "稼働中 — 1分ごとに実行" : "停止中"}
            </p>
          </div>
        </div>
        <button
          onClick={() => setConfig({ ...config, monitoring_enabled: !config.monitoring_enabled })}
          className={`w-12 h-7 rounded-full transition-colors ${
            config.monitoring_enabled ? "bg-green-500" : "bg-gray-300"
          }`}
        >
          <div
            className={`w-5 h-5 bg-white rounded-full transition-transform mx-1 ${
              config.monitoring_enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
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
          onClick={() => setActiveTab("settings")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "settings" ? "bg-white shadow text-gray-900" : "text-gray-500"
          }`}
        >
          ⚙️ キーワード設定
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "history" ? "bg-white shadow text-gray-900" : "text-gray-500"
          }`}
        >
          📋 ヒット履歴 ({config.history.length})
        </button>
      </div>

      {/* 設定タブ */}
      {activeTab === "settings" && (
        <div className="space-y-3">
          {config.keywords.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <p>キーワードが登録されていません</p>
              <p className="text-sm mt-1">下のボタンから追加してください</p>
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

      {/* 履歴タブ */}
      {activeTab === "history" && (
        <div className="space-y-3">
          {config.history.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <p>まだヒット履歴がありません</p>
              <p className="text-sm mt-1">監視を開始すると商品が表示されます</p>
            </div>
          )}
          {config.history.map((item) => (
            <HistoryCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
