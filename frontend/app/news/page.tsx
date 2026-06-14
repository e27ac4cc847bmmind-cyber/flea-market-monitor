"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Heart,
  Plus,
  X,
  RefreshCw,
  FileText,
  Sparkles,
  ChevronLeft,
  Lightbulb,
} from "lucide-react";

// ==================== 型定義 ====================
interface Article {
  id: string;
  title: string;
  summary: string;
  detail: string;
  source: string;
  publishedAt: string;
  tags: string[];
  isDiscovery: boolean;
}

interface ReportSection {
  heading: string;
  body: string;
}

interface Report {
  reportTitle: string;
  executiveSummary: string;
  sections: ReportSection[];
  keyInsight: string;
  infographic: {
    title: string;
    svgContent: string;
  };
}

interface CategoryData {
  articles: Article[];
  loadedAt: number;
}

interface Preferences {
  topics: string[];
  score: Record<string, number>;
}

const DEFAULT_TABS = ["AI & IT", "経済"];

const DISCOVERY_MAP: Record<string, string[]> = {
  "AI & IT": ["量子コンピューティング", "バイオテック", "宇宙開発", "サイバーセキュリティ"],
  "経済": ["地政学リスク", "エネルギー政策", "人口動態", "サプライチェーン"],
};

function getDiscoveryTopics(category: string, prefs: Preferences): string[] {
  const base = DISCOVERY_MAP[category] ?? ["隣接分野の最新動向"];
  return base.slice(0, 2);
}

function getTopPreferences(prefs: Preferences): string[] {
  return Object.entries(prefs.score)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([topic]) => topic);
}

// ==================== コンポーネント ====================
function ArticleCard({
  article,
  isFavorited,
  onToggleFavorite,
}: {
  article: Article;
  isFavorited: boolean;
  onToggleFavorite: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-white border rounded-xl shadow-sm p-4 ${article.isDiscovery ? "border-amber-200 bg-amber-50/30" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {article.isDiscovery && (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                <Lightbulb size={10} />
                新しい発見
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 text-sm leading-snug">{article.title}</h3>
          <p className="text-xs text-gray-500 mt-1">
            {article.source} · {article.publishedAt}
          </p>
          <p className="text-sm text-gray-700 mt-2 leading-relaxed">{article.summary}</p>
          {expanded && (
            <p className="text-sm text-gray-600 mt-2 leading-relaxed border-t pt-2">{article.detail}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-2">
            {article.tags.map((tag) => (
              <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-500 hover:text-blue-700 mt-2"
          >
            {expanded ? "閉じる" : "詳しく読む"}
          </button>
        </div>
        <button
          onClick={onToggleFavorite}
          className={`flex-shrink-0 p-2 rounded-full transition-colors ${
            isFavorited ? "text-red-500 bg-red-50" : "text-gray-300 hover:text-red-400 hover:bg-red-50"
          }`}
        >
          <Heart size={18} fill={isFavorited ? "currentColor" : "none"} />
        </button>
      </div>
    </div>
  );
}

function ReportView({
  report,
  onClose,
}: {
  report: Report;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <ChevronLeft size={22} />
        </button>
        <h2 className="text-lg font-bold text-gray-900">{report.reportTitle}</h2>
      </div>

      {/* 要約 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800 leading-relaxed">{report.executiveSummary}</p>
      </div>

      {/* SVGインフォグラフィック */}
      <div className="bg-white border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">📊 {report.infographic.title}</h3>
        <div className="overflow-x-auto">
          <svg
            viewBox="0 0 600 400"
            className="w-full max-w-full"
            xmlns="http://www.w3.org/2000/svg"
            dangerouslySetInnerHTML={{ __html: report.infographic.svgContent }}
          />
        </div>
      </div>

      {/* セクション */}
      {report.sections.map((section, i) => (
        <div key={i} className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-gray-900 mb-2">{section.heading}</h3>
          <p className="text-sm text-gray-700 leading-relaxed">{section.body}</p>
        </div>
      ))}

      {/* キーインサイト */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Sparkles size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-green-700 mb-1">今週のキーインサイト</p>
            <p className="text-sm text-green-800 leading-relaxed">{report.keyInsight}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== メインページ ====================
export default function NewsPage() {
  const [tabs, setTabs] = useState<string[]>(DEFAULT_TABS);
  const [activeTab, setActiveTab] = useState(DEFAULT_TABS[0]);
  const [newTabName, setNewTabName] = useState("");
  const [showAddTab, setShowAddTab] = useState(false);

  const [categoryData, setCategoryData] = useState<Record<string, CategoryData>>({});
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [preferences, setPreferences] = useState<Preferences>({ topics: [], score: {} });

  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  // localStorageから復元
  useEffect(() => {
    try {
      const savedFavs = localStorage.getItem("news_favorites");
      const savedPrefs = localStorage.getItem("news_preferences");
      const savedTabs = localStorage.getItem("news_tabs");
      if (savedFavs) setFavorites(new Set(JSON.parse(savedFavs)));
      if (savedPrefs) setPreferences(JSON.parse(savedPrefs));
      if (savedTabs) {
        const t = JSON.parse(savedTabs);
        setTabs(t);
        setActiveTab(t[0]);
      }
    } catch {}
  }, []);

  const saveFavorites = (favs: Set<string>) => {
    localStorage.setItem("news_favorites", JSON.stringify(Array.from(favs)));
  };

  const savePreferences = (prefs: Preferences) => {
    localStorage.setItem("news_preferences", JSON.stringify(prefs));
  };

  const saveTabs = (t: string[]) => {
    localStorage.setItem("news_tabs", JSON.stringify(t));
  };

  const loadArticles = useCallback(
    async (category: string) => {
      setLoading(true);
      setError("");
      try {
        const topPrefs = getTopPreferences(preferences);
        const discoveryTopics = getDiscoveryTopics(category, preferences);
        const res = await fetch("/api/news/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, preferences: topPrefs, discoveryTopics }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setCategoryData((prev) => ({
          ...prev,
          [category]: { articles: data.articles, loadedAt: Date.now() },
        }));
      } catch {
        setError("ニュースの取得に失敗しました。APIキーを確認してください。");
      } finally {
        setLoading(false);
      }
    },
    [preferences]
  );

  // タブ切り替え時に未読のカテゴリは自動取得
  useEffect(() => {
    if (!categoryData[activeTab]) {
      loadArticles(activeTab);
    }
  }, [activeTab, categoryData, loadArticles]);

  const toggleFavorite = (article: Article) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(article.id)) {
        next.delete(article.id);
      } else {
        next.add(article.id);
        // 好みスコアを加算
        setPreferences((prefs) => {
          const newScore = { ...prefs.score };
          article.tags.forEach((tag) => {
            newScore[tag] = (newScore[tag] ?? 0) + 1;
          });
          const updated = { ...prefs, score: newScore };
          savePreferences(updated);
          return updated;
        });
      }
      saveFavorites(next);
      return next;
    });
  };

  const addTab = () => {
    const name = newTabName.trim();
    if (!name || tabs.includes(name)) return;
    const newTabs = [...tabs, name];
    setTabs(newTabs);
    saveTabs(newTabs);
    setActiveTab(name);
    setNewTabName("");
    setShowAddTab(false);
  };

  const removeTab = (tab: string) => {
    if (DEFAULT_TABS.includes(tab)) return;
    const newTabs = tabs.filter((t) => t !== tab);
    setTabs(newTabs);
    saveTabs(newTabs);
    if (activeTab === tab) setActiveTab(newTabs[0]);
  };

  const generateReport = async () => {
    const articles = categoryData[activeTab]?.articles ?? [];
    if (articles.length === 0) return;
    setReportLoading(true);
    setError("");
    try {
      const res = await fetch("/api/news/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: activeTab,
          articles,
          favorites: Array.from(favorites),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReport(data);
    } catch {
      setError("レポート生成に失敗しました。");
    } finally {
      setReportLoading(false);
    }
  };

  const currentArticles = categoryData[activeTab]?.articles ?? [];

  // レポート表示中
  if (report) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <ReportView report={report} onClose={() => setReport(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">📰 ニュースレポート</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            ♡ {favorites.size}件お気に入り済み
          </p>
        </div>
        <button
          onClick={generateReport}
          disabled={reportLoading || currentArticles.length === 0}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {reportLoading ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <FileText size={14} />
              レポートを作成
            </>
          )}
        </button>
      </div>

      {/* タブ */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg flex-shrink-0">
          {tabs.map((tab) => (
            <div key={tab} className="relative flex-shrink-0">
              <button
                onClick={() => setActiveTab(tab)}
                className={`py-1.5 px-3 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeTab === tab ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab}
              </button>
              {!DEFAULT_TABS.includes(tab) && (
                <button
                  onClick={() => removeTab(tab)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-gray-400 hover:bg-red-500 text-white rounded-full flex items-center justify-center transition-colors"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>

        {showAddTab ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <input
              type="text"
              value={newTabName}
              onChange={(e) => setNewTabName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTab()}
              placeholder="分野名"
              autoFocus
              className="border rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={addTab}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
            >
              追加
            </button>
            <button
              onClick={() => setShowAddTab(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddTab(true)}
            className="flex-shrink-0 flex items-center gap-1 text-gray-400 hover:text-blue-500 text-sm px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Plus size={16} />
            追加
          </button>
        )}
      </div>

      {/* エラー */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* リフレッシュボタン */}
      <div className="flex justify-end mb-3">
        <button
          onClick={() => loadArticles(activeTab)}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          最新に更新
        </button>
      </div>

      {/* ニュース一覧 */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
          <p className="text-sm">Claudeがニュースを生成中...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentArticles.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-sm">ニュースが読み込まれていません</p>
            </div>
          ) : (
            currentArticles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                isFavorited={favorites.has(article.id)}
                onToggleFavorite={() => toggleFavorite(article)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
