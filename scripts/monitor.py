#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
フリマ監視スクリプト
メルカリ・ラクマ・PayPayフリマを監視してDiscordに通知する
"""

import json
import os
import random
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

# Windows環境でのUTF-8出力を保証
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

import requests
from bs4 import BeautifulSoup

# ==================== 定数 ====================
BASE_DIR = Path(__file__).parent.parent
CONFIG_PATH = BASE_DIR / "config.json"
SEEN_IDS_PATH = BASE_DIR / "seen_ids.json"

# Googlebot UA → メルカリSSR描画を引き出す
UA_GOOGLEBOT = "Googlebot/2.1 (+http://www.google.com/bot.html)"
UA_LIST = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
]

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL", "")


# ==================== ユーティリティ ====================
def get_headers(googlebot=False):
    ua = UA_GOOGLEBOT if googlebot else random.choice(UA_LIST)
    return {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
    }


def random_sleep():
    time.sleep(random.uniform(2, 5))


def load_json(path: Path) -> dict:
    if path.exists():
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f)
    return {}


def save_json(path: Path, data: dict):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def parse_price(text: str) -> Optional[int]:
    # ¥マーク直後の数字を優先（「1988年 ¥34,800」の誤認識を防ぐ）
    m = re.search(r"[¥￥]\s*([\d,]+)", text)
    if m:
        p = int(m.group(1).replace(",", ""))
        if 100 <= p <= 10_000_000:
            return p
    # フォールバック: 5桁以上の数字
    m2 = re.search(r"\d{5,}", text.replace(",", ""))
    if m2:
        p = int(m2.group())
        if 100 <= p <= 10_000_000:
            return p
    return None


# ==================== 相場取得 ====================
def get_usd_jpy_rate() -> float:
    """USD/JPY為替レートを取得"""
    try:
        r = requests.get("https://open.er-api.com/v6/latest/USD", timeout=10)
        if r.status_code == 200:
            return r.json()["rates"]["JPY"]
    except Exception:
        pass
    return 155.0


def get_silver_spot_price_jpy() -> Optional[float]:
    """銀のスポット価格（円/g）を取得 — Yahoo Finance SI=F を使用"""
    # 方法1: Yahoo Finance 銀先物
    try:
        r = requests.get(
            "https://query1.finance.yahoo.com/v8/finance/chart/SI%3DF?interval=1d&range=1d",
            headers={"User-Agent": random.choice(UA_LIST)},
            timeout=10,
        )
        if r.status_code == 200:
            meta = r.json()["chart"]["result"][0]["meta"]
            price_usd_oz = meta.get("regularMarketPrice")
            if price_usd_oz and float(price_usd_oz) > 5:
                usd_jpy = get_usd_jpy_rate()
                return float(price_usd_oz) * usd_jpy / 31.1035
    except Exception as e:
        print(f"Yahoo Finance 銀価格取得失敗: {e}")

    # 方法2: swissquote XAG/USD
    try:
        r2 = requests.get(
            "https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAG/USD",
            timeout=10,
            headers={"User-Agent": random.choice(UA_LIST)},
        )
        if r2.status_code == 200:
            data = r2.json()
            bid = data[0]["spreadProfilePrices"][0]["bid"]
            if bid and float(bid) > 5:
                usd_jpy = get_usd_jpy_rate()
                return float(bid) * usd_jpy / 31.1035
    except Exception as e:
        print(f"swissquote 銀価格取得失敗: {e}")

    return None


def get_gold_spot_price_jpy() -> Optional[float]:
    """金のスポット価格（円/g）を取得"""
    try:
        r = requests.get(
            "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1d",
            headers={"User-Agent": random.choice(UA_LIST)},
            timeout=10,
        )
        if r.status_code == 200:
            meta = r.json()["chart"]["result"][0]["meta"]
            price_usd_oz = meta.get("regularMarketPrice")
            if price_usd_oz and float(price_usd_oz) > 100:
                usd_jpy = get_usd_jpy_rate()
                return float(price_usd_oz) * usd_jpy / 31.1035
    except Exception as e:
        print(f"金スポット価格取得失敗: {e}")
    return None


def get_mercari_market_price(keyword: str) -> Optional[float]:
    """メルカリの売れた商品から直近の平均価格を算出"""
    try:
        url = f"https://jp.mercari.com/search?keyword={requests.utils.quote(keyword)}&status=sold_out&sort=created_time&order=desc"
        r = requests.get(url, headers=get_headers(googlebot=True), timeout=15)
        random_sleep()
        if r.status_code != 200:
            return None

        soup = BeautifulSoup(r.text, "lxml")
        prices = []
        for a in soup.find_all("a", href=re.compile(r"/item/m\d+")):
            txt = a.get_text(" ", strip=True)
            p = parse_price(txt)
            if p:
                prices.append(p)

        if len(prices) >= 3:
            return sum(prices) / len(prices)
    except Exception as e:
        print(f"メルカリ相場取得エラー: {e}")
    return None


# ==================== カテゴリIDマッピング ====================
# Mercari Japan カテゴリID（genre → category_id）
MERCARI_CATEGORY_IDS: dict[str, str] = {
    "electronics": "668",   # PC周辺機器（ディスプレイ・モニター含む）
    "games":       "63",    # テレビゲーム
    "books":       "72",    # 本・音楽・映画
    "sports":      "76",    # スポーツ・レジャー
    "automotive":  "80",    # 自動車・オートバイ
    "interior":    "57",    # インテリア・住まい・小物
    "fashion":     "",      # 広すぎて絞らない（レディース/メンズ等で別ID）
}

# Rakuma (fril.jp) カテゴリID（genre → category_id）
RAKUMA_CATEGORY_IDS: dict[str, str] = {
    "electronics": "307",   # スマホ・タブレット・パソコン
    "games":       "278",   # テレビゲーム
    "books":       "82",    # 本・雑誌
    "sports":      "283",   # スポーツ・アウトドア
    "automotive":  "",      # 対応カテゴリなし
    "interior":    "91",    # インテリア・日用品・その他
    "fashion":     "",      # 広すぎて絞らない
}

# PayPayフリマ カテゴリID（genre → category_id）
PAYPAY_CATEGORY_IDS: dict[str, str] = {
    "electronics": "3",     # スマホ・タブレット・パソコン
    "games":       "1",     # ゲーム
    "books":       "6",     # 本・雑誌・マンガ
    "sports":      "8",     # スポーツ・レジャー
    "automotive":  "13",    # 自動車・オートバイ
    "interior":    "10",    # インテリア・住まい
    "fashion":     "",      # 広すぎて絞らない
}

# ==================== スクレイピング ====================
def scrape_mercari(keyword: str, max_price: int, category_id: str = "") -> list[dict]:
    """メルカリから新着商品を取得（Googlebot UAでSSR描画を取得）"""
    items = []
    try:
        cat_param = f"&category_id={category_id}" if category_id else ""
        url = f"https://jp.mercari.com/search?keyword={requests.utils.quote(keyword)}&status=on_sale&sort=created_time&order=desc{cat_param}"
        r = requests.get(url, headers=get_headers(googlebot=True), timeout=15)
        random_sleep()

        if r.status_code != 200:
            print(f"メルカリ取得失敗: {r.status_code}")
            return items

        soup = BeautifulSoup(r.text, "lxml")

        for a in soup.find_all("a", href=re.compile(r"/item/m\d+")):
            href = a.get("href", "")
            item_id = re.search(r"m\d+", href)
            if not item_id:
                continue
            item_id = item_id.group()

            # 画像のaltから商品名、srcから画像URLを取得
            img = a.find("img")
            raw_name = (img.get("alt", "") if img else "") or a.get_text(" ", strip=True)[:80]
            # メルカリはalt末尾に「のサムネイル」が付くので除去
            name = re.sub(r"のサムネイル$", "", raw_name).strip()
            image_url = img.get("src", "") if img else ""
            if not name:
                continue

            # テキストから価格を取得
            txt = a.get_text(" ", strip=True)
            price = parse_price(txt)
            if not price or price > max_price:
                continue

            full_url = f"https://jp.mercari.com{href}" if href.startswith("/") else href
            items.append({
                "id": f"mercari_{item_id}",
                "name": name.strip(),
                "price": price,
                "platform": "メルカリ",
                "url": full_url,
                "image_url": image_url,
            })

        # 重複除去
        seen = set()
        unique = []
        for it in items:
            if it["id"] not in seen:
                seen.add(it["id"])
                unique.append(it)
        items = unique[:30]

    except Exception as e:
        print(f"メルカリスクレイピングエラー: {e}")

    return items


def scrape_rakuma(keyword: str, max_price: int, category_id: str = "") -> list[dict]:
    """ラクマから新着商品を取得（item.fril.jp形式）"""
    items = []
    try:
        cat_param = f"&category={category_id}" if category_id else ""
        url = f"https://fril.jp/s?query={requests.utils.quote(keyword)}&sort=created_at&order=desc{cat_param}"
        r = requests.get(url, headers=get_headers(), timeout=15)
        random_sleep()

        if r.status_code != 200:
            print(f"ラクマ取得失敗: {r.status_code}")
            return items

        soup = BeautifulSoup(r.text, "lxml")

        for box in soup.select(".item-box"):
            a = box.find("a", href=re.compile(r"item\.fril\.jp/"))
            if not a:
                continue
            href = a.get("href", "")
            item_id = href.rstrip("/").split("/")[-1]

            # 商品名: img alt、画像URL: data-original（遅延読み込み）
            img = box.find("img")
            name = img.get("alt", "").strip() if img else ""
            # data-original が本物の画像URL（srcはダミー）
            image_url = (img.get("data-original", "") or img.get("src", "")) if img else ""
            if not name:
                name = a.get_text(strip=True)[:80]
            if not name:
                continue

            # 価格: テキストから
            txt = box.get_text(" ", strip=True)
            price = parse_price(txt)
            if not price or price > max_price:
                continue

            items.append({
                "id": f"rakuma_{item_id}",
                "name": name,
                "price": price,
                "platform": "ラクマ",
                "url": href,
                "image_url": image_url,
            })

    except Exception as e:
        print(f"ラクマスクレイピングエラー: {e}")

    return items[:30]


def scrape_paypay(keyword: str, max_price: int, category_id: str = "") -> list[dict]:
    """PayPayフリマから新着商品を取得（__NEXT_DATA__パース）"""
    items = []
    try:
        cat_param = f"&category_id={category_id}" if category_id else ""
        url = f"https://paypayfleamarket.yahoo.co.jp/search/{requests.utils.quote(keyword)}?sort=new{cat_param}"
        r = requests.get(url, headers=get_headers(), timeout=15)
        random_sleep()

        if r.status_code != 200:
            print(f"PayPay取得失敗: {r.status_code}")
            return items

        soup = BeautifulSoup(r.text, "lxml")
        nd = soup.find("script", id="__NEXT_DATA__")
        if not nd or not nd.string:
            print("PayPay: __NEXT_DATA__ が見つかりません")
            return items

        data = json.loads(nd.string)

        # 直接パスで取得: props.initialState.searchState.search.result.items
        try:
            raw_items = (
                data["props"]["initialState"]["searchState"]["search"]["result"]["items"]
            )
        except (KeyError, TypeError):
            # フォールバック: 再帰探索
            raw_items = None
            def _find(obj, depth=0):
                if depth > 10 or not isinstance(obj, dict):
                    return None
                for k, v in obj.items():
                    if k == "items" and isinstance(v, list) and len(v) > 3:
                        if isinstance(v[0], dict) and "title" in v[0] and "price" in v[0]:
                            return v
                    r = _find(v, depth + 1)
                    if r:
                        return r
                return None
            raw_items = _find(data)

        if not raw_items:
            print("PayPay: items リストが見つかりません")
            return items

        for it in raw_items:
            item_id = str(it.get("id", ""))
            if not item_id:
                continue
            name = it.get("title", "") or it.get("name", "")
            if not name:
                continue
            price = it.get("price", 0)
            if not price or int(price) > max_price:
                continue
            item_url = it.get("url") or f"https://paypayfleamarket.yahoo.co.jp/item/{item_id}"
            image_url = it.get("thumbnailImageUrl", "")

            items.append({
                "id": f"paypay_{item_id}",
                "name": name.strip(),
                "price": int(price),
                "platform": "PayPayフリマ",
                "url": item_url,
                "image_url": image_url,
            })

    except Exception as e:
        print(f"PayPayスクレイピングエラー: {e}")

    return items[:30]


# ==================== AI判定 ====================
def ai_judge(item: dict, keyword_config: dict, market_price: Optional[float], spot_price: Optional[float]) -> dict:
    """OpenRouter APIでAI判定を実行"""
    if not OPENROUTER_API_KEY:
        return {"ok": True, "reason": "AI判定スキップ（APIキー未設定）"}

    precious_metal_mode = keyword_config.get("precious_metal_mode", False)
    metal_type = keyword_config.get("metal_type", "silver")
    discount_threshold = keyword_config.get("discount_threshold", 20)
    note = keyword_config.get("note", "").strip()

    lines = [
        f"商品名: {item['name']}",
        f"価格: {item['price']}円",
        f"プラットフォーム: {item['platform']}",
    ]
    if precious_metal_mode and spot_price:
        metal_name = "銀" if metal_type == "silver" else "金"
        lines.append(f"{metal_name}スポット価格: {spot_price:.0f}円/g（1oz={spot_price*31.1035:.0f}円）")
    elif market_price:
        lines.append(f"メルカリ相場: {market_price:.0f}円")

    note_line = f"\n4. ユーザーの希望条件に合致するか: {note}" if note else ""

    if precious_metal_mode:
        metal_name = "銀" if metal_type == "silver" else "金"
        prompt = f"""以下のフリマ出品商品を評価してください。

{chr(10).join(lines)}

判定基準（すべて満たす場合のみYES）：
1. 本物の{metal_name}製品か（偽物・メッキ品・レプリカ・複製ではないか）
2. 1オンス（31.1g）以上の純{metal_name}か
3. スポット価格比{discount_threshold}%以上お得か{note_line}

必ず以下の形式で回答：
JUDGMENT: YES または NO
REASON: 50文字以内の理由"""
    else:
        note_basis = f"\n4. ユーザーの希望条件に合致するか: {note}" if note else ""
        target_keyword = keyword_config.get("keyword", "")
        prompt = f"""以下のフリマ出品商品を評価してください。

{chr(10).join(lines)}

検索キーワード: {target_keyword}

判定基準（すべて満たす場合のみYES）：
1. これは「{target_keyword}」そのもの（本体）か？アクセサリー・周辺機器・関連商品・別用途の商品ではないか（例: モニター検索でKVMスイッチ・ベビーモニター・ケーブルはNO）
2. 正規品・本物で実用に足る状態か（偽物・詐欺的出品・パーツ取り・ジャンク・破損品ではないか）
3. 相場より{discount_threshold}%以上お得か{note_basis}

必ず以下の形式で回答：
JUDGMENT: YES または NO
REASON: 50文字以内の理由"""

    MODELS = [
        "google/gemma-4-31b-it:free",
        "qwen/qwen3-next-80b-a3b-instruct:free",
        "meta-llama/llama-3.3-70b-instruct:free",
    ]

    for model in MODELS:
        try:
            time.sleep(1.5)  # レート制限対策
            r = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://github.com/flea-market-monitor",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                },
                timeout=30,
            )
            if r.status_code == 429:
                print(f"    AI({model}): レート制限 → 次のモデルへ")
                time.sleep(5)
                continue
            if r.status_code == 200:
                j_body = r.json()
                if "choices" not in j_body or not j_body["choices"]:
                    err = j_body.get("error", {}).get("message", str(j_body)[:80])
                    print(f"    AI({model}): choices なし → {err}")
                    continue
                content = j_body["choices"][0]["message"]["content"]
                j = re.search(r"JUDGMENT:\s*(YES|NO)", content, re.IGNORECASE)
                reason_m = re.search(r"REASON:\s*(.+)", content)
                ok = j and j.group(1).upper() == "YES"
                reason = reason_m.group(1).strip() if reason_m else content[:100]
                return {"ok": bool(ok), "reason": f"[{model.split('/')[1].split(':')[0]}] {reason}"}
            print(f"    AI({model}): エラー {r.status_code}")
        except Exception as e:
            print(f"    AI({model}): 例外 {e}")

    return {"ok": True, "reason": "AI判定失敗 — 価格条件のみで判断"}


# ==================== Discord通知 ====================
def send_discord_notification(item: dict, keyword_config: dict, ai_result: dict, market_info: str):
    if not DISCORD_WEBHOOK_URL:
        print("Discord Webhook URL未設定")
        return

    embed = {
        "title": f"🛍️ {item['name'][:100]}",
        "url": item["url"],
        "color": 0x00FF7F,
        "fields": [
            {"name": "💰 価格", "value": f"¥{item['price']:,}", "inline": True},
            {"name": "🏪 プラットフォーム", "value": item["platform"], "inline": True},
            {"name": "🔍 キーワード", "value": keyword_config["keyword"], "inline": True},
            {"name": "📊 相場情報", "value": market_info, "inline": False},
            {"name": "🤖 AI判定", "value": ai_result["reason"], "inline": False},
        ],
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "footer": {"text": "フリマ監視システム"},
    }

    # 商品画像をサムネイルとして追加
    image_url = item.get("image_url", "")
    if image_url and image_url.startswith("http"):
        embed["thumbnail"] = {"url": image_url}

    try:
        r = requests.post(DISCORD_WEBHOOK_URL, json={"embeds": [embed]}, timeout=10)
        if r.status_code in (200, 204):
            print(f"  → Discord通知: {item['name'][:40]}")
        else:
            print(f"  Discord通知失敗: {r.status_code}")
    except Exception as e:
        print(f"  Discord通知エラー: {e}")


# ==================== ジャンク除外ワード ====================
JUNK_WORDS = ["ジャンク", "不動", "部品取り", "破損", "訳あり", "動作不良", "故障", "ジャンク品"]

# ==================== ジャンル別除外ワード ====================
GENRE_EXCLUDE_WORDS: dict[str, list[str]] = {
    "electronics": ["y2k", "ファッション", "服", "古着", "レディース", "メンズ", "コーデ", "アパレル", "ウェア", "シャツ", "パンツ"],
    "fashion": ["家電", "スマホ", "パソコン", "モニター", "プリンター", "カメラ"],
    "automotive": ["ミニカー", "プラモデル", "おもちゃ", "フィギュア", "模型", "ラジコン"],
    "sports": ["フィギュア", "プラモデル", "おもちゃ"],
    "games": ["工具", "部品", "素材"],
    "books": ["工具", "部品"],
    "interior": ["フィギュア", "プラモデル", "ミニチュア"],
}

# ==================== メイン処理 ====================
def process_keyword(keyword_config: dict, seen_ids: dict) -> list[dict]:
    keyword = keyword_config["keyword"]
    model_number = keyword_config.get("model_number", "").strip()
    search_keyword = keyword + (" " + model_number if model_number else "")
    min_price = keyword_config.get("min_price", 0)
    max_price = keyword_config.get("max_price", 100000)
    platforms = keyword_config.get("platforms", {"mercari": True, "rakuma": True, "paypay": True})
    precious_metal_mode = keyword_config.get("precious_metal_mode", False)
    metal_type = keyword_config.get("metal_type", "silver")
    discount_threshold = keyword_config.get("discount_threshold", 20)

    print(f"\n--- キーワード: {keyword} ---")

    # 相場取得
    spot_price = market_price = None
    market_info = "相場情報なし"

    if precious_metal_mode:
        fn = get_silver_spot_price_jpy if metal_type == "silver" else get_gold_spot_price_jpy
        spot_price = fn()
        if spot_price:
            metal_name = "銀" if metal_type == "silver" else "金"
            market_info = f"{metal_name}スポット: ¥{spot_price:.0f}/g（1oz=¥{spot_price*31.1035:.0f}）"
            print(f"  スポット価格: {market_info}")
    else:
        market_price = get_mercari_market_price(keyword)
        if market_price:
            market_info = f"メルカリ相場: ¥{market_price:.0f}（売れ済み平均）"
            print(f"  {market_info}")

    genre = keyword_config.get("genre", "")
    mercari_cat = MERCARI_CATEGORY_IDS.get(genre, "")
    rakuma_cat = RAKUMA_CATEGORY_IDS.get(genre, "")
    paypay_cat = PAYPAY_CATEGORY_IDS.get(genre, "")

    print(f"  検索キーワード: {search_keyword} / ジャンル: {genre or '指定なし'}")

    # スクレイピング（カテゴリ指定 → 結果少なければ全カテゴリで再試行）
    all_items: list[dict] = []
    if platforms.get("mercari"):
        res = scrape_mercari(search_keyword, max_price, mercari_cat)
        if mercari_cat and len(res) < 3:
            print(f"  メルカリ(cat={mercari_cat}): {len(res)}件 → 全カテゴリで再試行")
            res = scrape_mercari(search_keyword, max_price)
            print(f"  メルカリ(全): {len(res)}件")
        else:
            print(f"  メルカリ{f'(cat={mercari_cat})' if mercari_cat else ''}: {len(res)}件")
        all_items.extend(res)

    if platforms.get("rakuma"):
        res = scrape_rakuma(search_keyword, max_price, rakuma_cat)
        if rakuma_cat and len(res) < 3:
            print(f"  ラクマ(cat={rakuma_cat}): {len(res)}件 → 全カテゴリで再試行")
            res = scrape_rakuma(search_keyword, max_price)
            print(f"  ラクマ(全): {len(res)}件")
        else:
            print(f"  ラクマ{f'(cat={rakuma_cat})' if rakuma_cat else ''}: {len(res)}件")
        all_items.extend(res)

    if platforms.get("paypay"):
        res = scrape_paypay(search_keyword, max_price, paypay_cat)
        if paypay_cat and len(res) < 3:
            print(f"  PayPay(cat={paypay_cat}): {len(res)}件 → 全カテゴリで再試行")
            res = scrape_paypay(search_keyword, max_price)
            print(f"  PayPay(全): {len(res)}件")
        else:
            print(f"  PayPay{f'(cat={paypay_cat})' if paypay_cat else ''}: {len(res)}件")
        all_items.extend(res)

    # 新着フィルタ
    keyword_seen = set(seen_ids.get(keyword, []))
    new_items = [it for it in all_items if it["id"] not in keyword_seen]
    print(f"  新着: {len(new_items)}件")

    # キーワード整合チェック（全ワードが含まれる場合のみ通過 — ANYだとカメラ等が「モニター搭載」で誤通過する）
    # 長音符(ー)を除いて比較 — 「モニター」と「モニタ」を同一視する
    def _strip_chouon(s: str) -> str:
        return s.replace("ー", "")

    kw_words = [w.lower() for w in search_keyword.split() if len(w) >= 2]
    if kw_words:
        before = len(new_items)
        new_items = [
            it for it in new_items
            if all(_strip_chouon(w) in _strip_chouon(it["name"].lower()) for w in kw_words)
        ]
        removed = before - len(new_items)
        if removed:
            print(f"  キーワード整合チェック: {removed}件除外")

    # 除外ワード / 必須ワードフィルタ（AI判定の前に機械的に弾く＝API節約＆確実）
    exclude_words = [w.strip().lower() for w in keyword_config.get("exclude_words", []) if w.strip()]
    genre_excludes = [w.lower() for w in GENRE_EXCLUDE_WORDS.get(genre, [])]
    exclude_words = list(set(exclude_words + genre_excludes))
    if keyword_config.get("exclude_junk", True):
        exclude_words = list(set(exclude_words + [w.lower() for w in JUNK_WORDS]))
    require_words = [w.strip().lower() for w in keyword_config.get("require_words", []) if w.strip()]

    def passes_word_filter(it: dict) -> bool:
        name = it["name"].lower()
        if exclude_words and any(w in name for w in exclude_words):
            return False
        if require_words and not all(w in name for w in require_words):
            return False
        return True

    if exclude_words or require_words:
        before = len(new_items)
        new_items = [it for it in new_items if passes_word_filter(it)]
        print(f"  ワードフィルタ通過: {len(new_items)}件 (除外 {before - len(new_items)}件)")

    if min_price > 0:
        before = len(new_items)
        new_items = [it for it in new_items if it["price"] >= min_price]
        print(f"  最低価格フィルタ(¥{min_price}以上): {len(new_items)}件 (除外 {before - len(new_items)}件)")

    # お得判定
    def is_good_deal(it: dict) -> bool:
        p = it["price"]
        if precious_metal_mode and spot_price:
            return p <= spot_price * 31.1035 * (1 - discount_threshold / 100)
        if market_price:
            return p <= market_price * (1 - discount_threshold / 100)
        return p <= max_price

    AI_CALL_LIMIT = 5  # 1run当たりAI呼び出し上限（API節約）
    ai_calls = 0
    history_items = []
    for item in new_items:
        # 価格条件を先にチェック → 合格したものだけAIを呼ぶ
        if not is_good_deal(item):
            history_items.append({
                "id": item["id"],
                "name": item["name"],
                "price": item["price"],
                "platform": item["platform"],
                "url": item["url"],
                "image_url": item.get("image_url", ""),
                "keyword": keyword,
                "ai_comment": "価格条件未達",
                "ai_ok": False,
                "market_info": market_info,
                "detected_at": datetime.now().isoformat(),
            })
            continue

        if ai_calls >= AI_CALL_LIMIT:
            history_items.append({
                "id": item["id"],
                "name": item["name"],
                "price": item["price"],
                "platform": item["platform"],
                "url": item["url"],
                "image_url": item.get("image_url", ""),
                "keyword": keyword,
                "ai_comment": "AI上限到達（次回判定）",
                "ai_ok": False,
                "market_info": market_info,
                "detected_at": datetime.now().isoformat(),
            })
            continue

        ai_result = ai_judge(item, keyword_config, market_price, spot_price)
        ai_calls += 1

        history_items.append({
            "id": item["id"],
            "name": item["name"],
            "price": item["price"],
            "platform": item["platform"],
            "url": item["url"],
            "image_url": item.get("image_url", ""),
            "keyword": keyword,
            "ai_comment": ai_result["reason"],
            "ai_ok": ai_result["ok"],
            "market_info": market_info,
            "detected_at": datetime.now().isoformat(),
        })

        if ai_result["ok"]:
            send_discord_notification(item, keyword_config, ai_result, market_info)

    # seen_ids 更新
    seen_ids[keyword] = list(keyword_seen | {it["id"] for it in all_items})
    return history_items


def main():
    print(f"=== フリマ監視開始 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ===", flush=True)

    config = load_json(CONFIG_PATH)
    seen_ids = load_json(SEEN_IDS_PATH)

    if not config.get("monitoring_enabled", True):
        print("監視はOFFです。終了します。")
        return

    all_history = []
    for kw_cfg in config.get("keywords", []):
        if not kw_cfg.get("enabled", True):
            continue
        try:
            history = process_keyword(kw_cfg, seen_ids)
            all_history.extend(history)
        except Exception as e:
            print(f"処理エラー ({kw_cfg.get('keyword')}): {e}")
        random_sleep()

    save_json(SEEN_IDS_PATH, seen_ids)

    existing = config.get("history", [])
    existing_ids = {h["id"] for h in existing}
    config["history"] = [h for h in all_history if h["id"] not in existing_ids] + existing
    config["history"] = config["history"][:500]
    save_json(CONFIG_PATH, config)

    print(f"\n=== 完了 新規{len(all_history)}件処理 ===")


if __name__ == "__main__":
    main()
