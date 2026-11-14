#!/usr/bin/env python3
"""BIST verisini Yahoo Finance'ten çekip statik site için JSON dosyaları üretir.

Çıktı:
  <out>/data/summary.json      her hisse için özet (getiriler, teknik göstergeler, temel oranlar)
  <out>/data/hist/<KOD>.json   2 yıllık günlük OHLCV (grafik için)

Kullanım:
  python scripts/fetch_data.py --out site             # gerçek veri
  python scripts/fetch_data.py --out site --sample    # internetsiz deneme için ÖRNEK veri
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
INDEX = "XU100"

SECTORS_TR = {
    "Financial Services": "Finans",
    "Industrials": "Sanayi",
    "Basic Materials": "Temel Malzeme",
    "Consumer Cyclical": "Döngüsel Tüketim",
    "Consumer Defensive": "Temel Tüketim",
    "Energy": "Enerji",
    "Utilities": "Elektrik ve Altyapı",
    "Technology": "Teknoloji",
    "Communication Services": "İletişim",
    "Real Estate": "Gayrimenkul",
    "Healthcare": "Sağlık",
}

# summary.json alanı -> Yahoo "info" alanı
FUND_KEYS = {
    "name": "shortName",
    "sector": "sector",
    "industry": "industry",
    "mcap": "marketCap",
    "pe": "trailingPE",
    "pb": "priceToBook",
    "evEbitda": "enterpriseToEbitda",
    "netMargin": "profitMargins",
    "opMargin": "operatingMargins",
    "roe": "returnOnEquity",
    "roa": "returnOnAssets",
    "de": "debtToEquity",
    "currentRatio": "currentRatio",
    "revGrowth": "revenueGrowth",
    "epsGrowth": "earningsGrowth",
    "divYield": "trailingAnnualDividendYield",
    "finCur": "financialCurrency",
    "cur": "currency",
}


# ----------------------------------------------------------------------------
# Göstergeler (web/ind.js ile aynı formüller)
# ----------------------------------------------------------------------------
def ema(x: np.ndarray, n: int) -> np.ndarray:
    return pd.Series(x).ewm(span=n, adjust=False).mean().to_numpy()


def sma(x: np.ndarray, n: int) -> np.ndarray:
    return pd.Series(x).rolling(n).mean().to_numpy()


def wilder_rsi(c: np.ndarray, n: int = 14) -> np.ndarray:
    out = np.full(len(c), np.nan)
    if len(c) <= n:
        return out
    d = np.diff(c)
    g = np.clip(d[:n], 0, None).mean()
    l = np.clip(-d[:n], 0, None).mean()
    out[n] = 100.0 if l == 0 else 100 - 100 / (1 + g / l)
    for i in range(n + 1, len(c)):
        x = d[i - 1]
        g = (g * (n - 1) + max(x, 0.0)) / n
        l = (l * (n - 1) + max(-x, 0.0)) / n
        out[i] = 100.0 if l == 0 else 100 - 100 / (1 + g / l)
    return out


def pct(a, b):
    try:
        a, b = float(a), float(b)
    except (TypeError, ValueError):
        return None
    if not (math.isfinite(a) and math.isfinite(b)) or b == 0:
        return None
    return a / b - 1


def last_cross(a: np.ndarray, b: np.ndarray, lookback: int):
    """a, b'yi son `lookback` barda yukarı ('up') ya da aşağı ('down') kestiyse döner."""
    diff = a - b
    for i in range(len(diff) - 1, max(len(diff) - lookback, 1) - 1, -1):
        p, q = diff[i - 1], diff[i]
        if not (np.isfinite(p) and np.isfinite(q)):
            break
        if p <= 0 < q:
            return "up"
        if p >= 0 > q:
            return "down"
    return None


def metrics(df: pd.DataFrame, idx: pd.DataFrame | None) -> dict:
    c = df["Close"].to_numpy(float)
    h = df["High"].to_numpy(float)
    lo = df["Low"].to_numpy(float)
    v = df["Volume"].fillna(0).to_numpy(float)
    n, last = len(c), c[-1]

    def ago(k):
        return c[-1 - k] if n > k else None

    m = {
        "date": df.index[-1].strftime("%Y-%m-%d"),
        "last": last,
        "chg1d": pct(last, ago(1)),
        "chg1w": pct(last, ago(5)),
        "chg1m": pct(last, ago(21)),
        "chg3m": pct(last, ago(63)),
        "chg6m": pct(last, ago(126)),
        "chg1y": pct(last, ago(252)),
    }
    prev_year = df["Close"][df.index.year < df.index[-1].year]
    m["ytd"] = pct(last, prev_year.iloc[-1]) if len(prev_year) else None

    s20, s50, s200 = sma(c, 20), sma(c, 50), sma(c, 200)
    m["vsSma20"] = pct(last, s20[-1])
    m["vsSma50"] = pct(last, s50[-1])
    m["vsSma200"] = pct(last, s200[-1])
    if np.isfinite(s50[-1]) and np.isfinite(s200[-1]):
        m["trend"] = "up" if last > s50[-1] > s200[-1] else "down" if last < s50[-1] < s200[-1] else "flat"
    else:
        m["trend"] = None
    cross = last_cross(s50, s200, 10)
    m["cross"] = {"up": "golden", "down": "death"}.get(cross)

    m["rsi"] = wilder_rsi(c)[-1]
    macd = ema(c, 12) - ema(c, 26)
    hist = macd - ema(macd, 9)
    m["macdPct"] = hist[-1] / last if last else None
    m["macdCross"] = last_cross(hist, np.zeros_like(hist), 3)

    hi52, lo52 = np.nanmax(h[-252:]), np.nanmin(lo[-252:])
    m["hi52"], m["lo52"] = hi52, lo52
    m["distHi52"] = pct(last, hi52)
    m["distLo52"] = pct(last, lo52)

    avg20 = v[-21:-1].mean() if n > 21 else np.nan
    m["volRatio"] = v[-1] / avg20 if avg20 and np.isfinite(avg20) and avg20 > 0 else None
    m["turnover"] = float((c[-20:] * v[-20:]).mean())

    lr = np.diff(np.log(c))
    m["volat"] = float(lr[-63:].std(ddof=1) * math.sqrt(252)) if len(lr) >= 63 else None

    m["beta"] = m["rs3m"] = None
    if idx is not None and len(idx):
        j = pd.concat([df["Close"], idx["Close"]], axis=1, join="inner").iloc[-253:]
        r = j.pct_change().dropna()
        if len(r) > 60 and r.iloc[:, 1].var() > 0:
            m["beta"] = float(r.iloc[:, 0].cov(r.iloc[:, 1]) / r.iloc[:, 1].var())
        ic = idx["Close"].to_numpy(float)
        if m["chg3m"] is not None and len(ic) > 63:
            m["rs3m"] = m["chg3m"] - pct(ic[-1], ic[-64])
    m["points"] = n
    return m


# ----------------------------------------------------------------------------
# Veri kaynakları
# ----------------------------------------------------------------------------
def read_tickers(path: Path) -> list[str]:
    seen, out = set(), []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0]
        for t in line.split():
            t = t.strip().upper()
            if t and t not in seen:
                seen.add(t)
                out.append(t)
    return out


def download_prices(symbols: list[str]) -> dict[str, pd.DataFrame]:
    import yfinance as yf

    out: dict[str, pd.DataFrame] = {}
    todo = list(symbols)
    for attempt in range(3):
        if not todo:
            break
        data = yf.download(
            [s + ".IS" for s in todo], period="2y", interval="1d", auto_adjust=True,
            group_by="ticker", progress=False, threads=True,
        )
        have = set(data.columns.get_level_values(0)) if isinstance(data.columns, pd.MultiIndex) else set()
        for s in todo:
            if s + ".IS" not in have:
                continue
            df = data[s + ".IS"][["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"])
            df = df[~df.index.duplicated(keep="last")].sort_index()
            if len(df) >= 30:
                out[s] = df
        todo = [s for s in todo if s not in out]
        if todo and attempt < 2:
            print(f"  {len(todo)} sembol alınamadı, {20 * (attempt + 1)} sn sonra tekrar denenecek…", flush=True)
            time.sleep(20 * (attempt + 1))
    return out


def load_fundamentals(symbols: list[str], cache_path: Path, max_age_h: float) -> dict[str, dict]:
    import yfinance as yf

    try:
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        cache = {}
    now, fetched, failed = time.time(), 0, 0
    for s in symbols:
        old = cache.get(s)
        if old and now - old.get("_ts", 0) < max_age_h * 3600:
            continue
        try:
            info = yf.Ticker(s + ".IS").info or {}
            rec = {k: info.get(src) for k, src in FUND_KEYS.items()}
            if any(rec[k] is not None for k in ("mcap", "pb", "sector")):
                rec["_ts"] = now
                cache[s] = rec
                fetched += 1
            else:
                failed += 1
        except Exception as e:  # ağ/Yahoo hataları: eski önbelleği koru
            failed += 1
            print(f"  temel veri alınamadı {s}: {e}", flush=True)
        time.sleep(0.4)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    print(f"Temel veri: {fetched} güncellendi, {failed} başarısız, {len(cache)} önbellekte.", flush=True)
    return cache


def make_sample(symbols: list[str]):
    """İnternet olmadan arayüzü denemek için rastgele ÖRNEK veri (gerçek değildir)."""
    rng = np.random.default_rng(7)
    dates = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=500)
    prices, funds = {}, {}
    sectors = list(SECTORS_TR)
    for s in symbols:
        drift, vol = rng.normal(0.0008, 0.0008), rng.uniform(0.015, 0.035)
        c = rng.uniform(5, 400) * np.exp(np.cumsum(rng.normal(drift, vol, len(dates))))
        o = np.r_[c[0], c[:-1]] * (1 + rng.normal(0, vol / 3, len(dates)))
        h = np.maximum(o, c) * (1 + np.abs(rng.normal(0, vol / 2, len(dates))))
        lo = np.minimum(o, c) * (1 - np.abs(rng.normal(0, vol / 2, len(dates))))
        v = rng.lognormal(16, 0.5, len(dates)) * (1 + 3 * (rng.random(len(dates)) > 0.97))
        prices[s] = pd.DataFrame({"Open": o, "High": h, "Low": lo, "Close": c, "Volume": v}, index=dates)
        maybe = lambda x: None if rng.random() < 0.1 else x  # noqa: E731
        funds[s] = {
            "name": f"{s} (örnek)", "sector": sectors[rng.integers(len(sectors))], "industry": None,
            "mcap": float(rng.lognormal(23.5, 1.2)), "pe": maybe(float(rng.uniform(-5, 40))),
            "pb": maybe(float(rng.uniform(0.4, 8))), "evEbitda": maybe(float(rng.uniform(2, 25))),
            "netMargin": maybe(float(rng.uniform(-0.1, 0.35))), "opMargin": maybe(float(rng.uniform(-0.05, 0.4))),
            "roe": maybe(float(rng.uniform(-0.1, 0.6))), "roa": maybe(float(rng.uniform(-0.05, 0.2))),
            "de": maybe(float(rng.uniform(0, 250))), "currentRatio": maybe(float(rng.uniform(0.5, 3))),
            "revGrowth": maybe(float(rng.uniform(-0.3, 1.2))), "epsGrowth": maybe(float(rng.uniform(-0.8, 2))),
            "divYield": maybe(float(rng.uniform(0, 0.08))), "finCur": "TRY", "cur": "TRY",
        }
    return prices, funds


# ----------------------------------------------------------------------------
# Çıktı
# ----------------------------------------------------------------------------
def clean(x):
    if isinstance(x, dict):
        return {k: clean(v) for k, v in x.items() if not k.startswith("_")}
    if isinstance(x, (list, tuple)):
        return [clean(v) for v in x]
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (float, np.floating)):
        x = float(x)
        if not math.isfinite(x):
            return None
        if abs(x) >= 1e6:
            return round(x)
        return round(x, 6 if abs(x) < 1 else 4)
    return x


def fund_record(raw: dict | None) -> dict:
    f = {k: (raw or {}).get(k) for k in FUND_KEYS}
    if f["de"] is not None:
        f["de"] = f["de"] / 100  # Yahoo yüzde olarak verir (88 -> 0,88x)
    f["sectorEn"] = f["sector"]
    f["sector"] = SECTORS_TR.get(f["sector"], f["sector"])
    # Raporlama para birimi (ör. USD) ile fiyat para birimi (TRY) farklıysa Yahoo oranları güvenilmez.
    f["fxWarn"] = bool(f["finCur"] and f["cur"] and f["finCur"] != f["cur"])
    return f


def write_hist(path: Path, df: pd.DataFrame):
    def r(a):
        return [round(float(x), 2 if abs(x) >= 1 else 4) for x in a]

    payload = {
        "d": [d.strftime("%Y-%m-%d") for d in df.index],
        "o": r(df["Open"]), "h": r(df["High"]), "l": r(df["Low"]), "c": r(df["Close"]),
        "v": [int(x) for x in df["Volume"].fillna(0)],
    }
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="site", help="çıktı klasörü (varsayılan: site)")
    ap.add_argument("--tickers", default=str(HERE / "tickers.txt"))
    ap.add_argument("--cache", default=".cache/fundamentals.json", help="temel veri önbelleği")
    ap.add_argument("--fund-max-age-hours", type=float, default=20)
    ap.add_argument("--no-fundamentals", action="store_true")
    ap.add_argument("--sample", action="store_true", help="internetsiz deneme için ÖRNEK veri üret")
    ap.add_argument("--limit", type=int, default=0, help="yalnızca ilk N hisse (deneme için)")
    args = ap.parse_args()

    tickers = read_tickers(Path(args.tickers))
    if args.limit:
        tickers = tickers[: args.limit]
    out = Path(args.out)
    hist_dir = out / "data" / "hist"
    hist_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    if args.sample:
        prices, funds = make_sample(tickers + [INDEX])
    else:
        print(f"{len(tickers)} hisse + {INDEX} fiyatları indiriliyor…", flush=True)
        prices = download_prices(tickers + [INDEX])
        funds = {} if args.no_fundamentals else load_fundamentals(
            [t for t in tickers if t in prices], Path(args.cache), args.fund_max_age_hours)

    ok = [t for t in tickers if t in prices]
    failed = [t for t in tickers if t not in prices]
    print(f"Fiyat: {len(ok)}/{len(tickers)} hisse alındı.", flush=True)
    if len(ok) < max(1, len(tickers) // 2):
        print("HATA: hisselerin yarısından azı alınabildi; eski yayın korunması için durduruluyor.", file=sys.stderr)
        sys.exit(1)

    idx = prices.get(INDEX)
    stocks = []
    for t in ok:
        df = prices[t]
        write_hist(hist_dir / f"{t}.json", df)
        stocks.append({"t": t, **fund_record(funds.get(t)), **metrics(df, idx)})
    index_summary = None
    if idx is not None:
        write_hist(hist_dir / f"{INDEX}.json", idx)
        index_summary = {"t": INDEX, "name": "BIST 100", **metrics(idx, None)}

    summary = {
        "updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "lastDate": max(s["date"] for s in stocks),
        "sample": bool(args.sample),
        "source": "ÖRNEK VERİ" if args.sample else "Yahoo Finance (gecikmeli)",
        "index": index_summary,
        "failed": failed,
        "stocks": stocks,
    }
    (out / "data" / "summary.json").write_text(
        json.dumps(clean(summary), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Tamam: {out / 'data'} ({time.time() - t0:.0f} sn)", flush=True)


if __name__ == "__main__":
    main()
