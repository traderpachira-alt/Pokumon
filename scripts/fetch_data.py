#!/usr/bin/env python3
"""BIST verisini çekip statik site için JSON dosyaları üretir.

Fiyatlar Yahoo Finance'ten, mali tablolar İş Yatırım'dan, endeks listesi Borsa İstanbul'dan gelir.

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

import isyatirim

HERE = Path(__file__).resolve().parent
INDEX = "XU100"

# Borsa İstanbul'un resmi endeks bileşen dosyası (her çalışmada güncel hali çekilir).
BIST_CSV_URL = "https://www.borsaistanbul.com/datum/hisse_endeks_ds.csv"
BIST_CSV_FALLBACK = HERE / "endeks_bilesenleri.csv"  # indirme olmazsa kullanılan yedek
# En dar endeksten genişe: bir hisse hangi endekste ilk görünüyorsa o etiketi alır.
TIERS = [("XU030", "30"), ("XU050", "50"), ("XU100", "100"), ("XUTUM", "TÜM")]

SAMPLE_SECTORS = ["Bankacılık", "Elektrik Üretim", "Holding", "Perakende - Ticaret", "Demir, Çelik", "Savunma",
                  "Gıda", "Otomotiv", "Gayrimenkul Y.O.", "Havayolları ve Hizm."]


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


def rma(x: np.ndarray, n: int) -> np.ndarray:
    """Wilder ortalaması: ilk n değerin ortalamasıyla başlar (x[0]'dan itibaren dolu olmalı)."""
    out = np.full(len(x), np.nan)
    if len(x) < n:
        return out
    out[n - 1] = x[:n].mean()
    for i in range(n, len(x)):
        out[i] = (out[i - 1] * (n - 1) + x[i]) / n
    return out


def true_range(h, lo, c):
    tr = h - lo
    tr[1:] = np.maximum.reduce([h[1:] - lo[1:], np.abs(h[1:] - c[:-1]), np.abs(lo[1:] - c[:-1])])
    return tr


def rolling_mid(h, lo, n):
    return (pd.Series(h).rolling(n).max() + pd.Series(lo).rolling(n).min()).to_numpy() / 2


def stoch_rsi(c, rsi_n=14, st_n=14, k=3, d=3):
    r = pd.Series(wilder_rsi(c, rsi_n))
    lo, hi = r.rolling(st_n).min(), r.rolling(st_n).max()
    rng = hi - lo
    st = ((r - lo) / rng.where(rng > 0) * 100).where(rng > 0, 50.0).where(r.notna() & lo.notna())
    kk = st.rolling(k).mean()
    return kk.to_numpy(), kk.rolling(d).mean().to_numpy()


def fisher(h, lo, n=9):
    """Ehlers Fisher dönüşümü (TradingView ile aynı)."""
    hl2 = (h + lo) / 2
    hi_, lo_ = pd.Series(hl2).rolling(n).max().to_numpy(), pd.Series(hl2).rolling(n).min().to_numpy()
    fish = np.full(len(hl2), np.nan)
    v_prev = f_prev = 0.0
    for i in range(n - 1, len(hl2)):
        v = 0.66 * ((hl2[i] - lo_[i]) / max(hi_[i] - lo_[i], 0.001) - 0.5) + 0.67 * v_prev
        v = min(max(v, -0.999), 0.999)
        f = 0.5 * math.log((1 + v) / max(1 - v, 0.001)) + 0.5 * f_prev
        fish[i], v_prev, f_prev = f, v, f
    trigger = np.r_[np.nan, fish[:-1]]
    return fish, trigger


def supertrend(h, lo, c, n=10, mult=3.0):
    """Supertrend (TradingView ile aynı). Döner: (çizgi, trend: 1 / -1)."""
    atr = rma(true_range(h, lo, c), n)
    src = (h + lo) / 2
    line = np.full(len(c), np.nan)
    trend = np.full(len(c), np.nan)
    up_p = dn_p = None
    t = 1
    for i in range(n - 1, len(c)):
        up, dn = src[i] - mult * atr[i], src[i] + mult * atr[i]
        if up_p is not None:
            if c[i - 1] > up_p:
                up = max(up, up_p)
            if c[i - 1] < dn_p:
                dn = min(dn, dn_p)
            if t == -1 and c[i] > dn_p:
                t = 1
            elif t == 1 and c[i] < up_p:
                t = -1
        line[i], trend[i] = (up if t == 1 else dn), t
        up_p, dn_p = up, dn
    return line, trend


def ichimoku(h, lo, conv=9, base=26, span_b=52, disp=26):
    """Bulut bugünkü tarihe hizalı: span A/B, 26 bar önce hesaplanan değerlerdir."""
    tenkan, kijun = rolling_mid(h, lo, conv), rolling_mid(h, lo, base)
    a = (tenkan + kijun) / 2
    b = rolling_mid(h, lo, span_b)
    shift = lambda x: np.r_[np.full(disp, np.nan), x[:-disp]] if len(x) > disp else np.full(len(x), np.nan)  # noqa: E731
    return tenkan, kijun, shift(a), shift(b)


def vwma(c, v, n=20):
    cv = pd.Series(c * v).rolling(n).sum()
    vs = pd.Series(v).rolling(n).sum()
    return (cv / vs.where(vs > 0)).to_numpy()


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

    k, d = stoch_rsi(c)
    m["stochK"], m["stochD"] = k[-1], d[-1]
    m["stochCross"] = last_cross(k, d, 3)
    atr14 = rma(true_range(h, lo, c), 14)
    m["atrPct"] = atr14[-1] / last if np.isfinite(atr14[-1]) else None
    fi, tr = fisher(h, lo)
    m["fisher"] = fi[-1]
    m["fisherCross"] = last_cross(fi, tr, 2)
    st_line, st_tr = supertrend(h, lo, c)
    if np.isfinite(st_tr[-1]):
        m["stTrend"] = "up" if st_tr[-1] > 0 else "down"
        m["stDist"] = pct(last, st_line[-1])
        flip = last_cross(st_tr, np.zeros_like(st_tr), 3)
        m["stFlip"] = flip
    else:
        m["stTrend"] = m["stDist"] = m["stFlip"] = None
    tenkan, kijun, sa, sb = ichimoku(h, lo)
    if np.isfinite(sa[-1]) and np.isfinite(sb[-1]):
        top, bot = max(sa[-1], sb[-1]), min(sa[-1], sb[-1])
        m["ichi"] = "above" if last > top else "below" if last < bot else "in"
    else:
        m["ichi"] = None
    m["tkCross"] = last_cross(tenkan, kijun, 3)
    vw = vwma(c, v, 20)
    m["vsVwma20"] = pct(last, vw[-1])

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
def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1254", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def load_universe(cache_dir: Path):
    """BIST TÜM hisselerini ve her birinin en dar endeksini (30/50/100/TÜM) döner."""
    import urllib.request

    cached = cache_dir / "endeks.csv"
    text, source = None, None
    try:
        req = urllib.request.Request(BIST_CSV_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            t = _decode(r.read())
        if ";XUTUM;" in t:
            text, source = t, "borsaistanbul.com"
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_text(text, encoding="utf-8")
    except Exception as e:
        print(f"  Endeks listesi indirilemedi ({e}); yedek kullanılacak.", flush=True)
    if text is None:
        for p in (cached, BIST_CSV_FALLBACK):
            if p.exists():
                text, source = p.read_text(encoding="utf-8"), f"yedek: {p.name}"
                break
    if text is None:
        sys.exit("HATA: endeks bileşen listesi bulunamadı.")

    members: dict[str, set[str]] = {code: set() for code, _ in TIERS}
    names: dict[str, str] = {}
    date = None
    for line in text.splitlines():
        r = line.split(";")
        if len(r) < 6 or r[2] not in members:
            continue
        code = r[0].split(".")[0].strip().upper()
        members[r[2]].add(code)
        names.setdefault(code, r[1].strip())
        date = r[5].strip()
    tier = {}
    for code, label in TIERS:
        for t in members[code]:
            tier.setdefault(t, label)
    universe = sorted(tier)
    print(f"Endeks listesi ({source}, {date}): " +
          ", ".join(f"{c} {len(members[c])}" for c, _ in TIERS), flush=True)
    return universe, tier, names, date


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


def make_sample(symbols: list[str]):
    """İnternet olmadan arayüzü denemek için rastgele ÖRNEK veri (gerçek değildir)."""
    rng = np.random.default_rng(7)
    dates = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=500)
    prices, funds = {}, {}
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
            "name": f"{s} (örnek)", "sector": SAMPLE_SECTORS[rng.integers(len(SAMPLE_SECTORS))],
            "freeFloat": float(rng.uniform(0.1, 0.8)), "mcap": float(rng.lognormal(23.5, 1.2)),
            "pe": maybe(float(rng.uniform(2, 40))), "pb": maybe(float(rng.uniform(0.4, 8))),
            "evEbitda": maybe(float(rng.uniform(2, 25))), "netMargin": maybe(float(rng.uniform(-0.1, 0.35))),
            "opMargin": maybe(float(rng.uniform(-0.05, 0.4))), "roe": maybe(float(rng.uniform(-0.1, 0.6))),
            "de": maybe(float(rng.uniform(0, 2.5))), "revGrowth": maybe(float(rng.uniform(-0.3, 1.2))),
            "epsGrowth": maybe(float(rng.uniform(-0.8, 2))), "divYield": maybe(float(rng.uniform(0, 0.08))),
            "netDebt": None, "period": "2026/9", "finGroup": "XI_29",
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
    ap.add_argument("--cache-dir", default=".cache", help="önbellek klasörü (mali tablolar, endeks listesi)")
    ap.add_argument("--fund-max-age-days", type=float, default=3, help="mali tablolar kaç günde bir yenilensin")
    ap.add_argument("--fund-max-per-run", type=int, default=150, help="bir çalışmada en fazla kaç şirketin mali tablosu çekilsin")
    ap.add_argument("--no-fundamentals", action="store_true")
    ap.add_argument("--sample", action="store_true", help="internetsiz deneme için ÖRNEK veri üret")
    ap.add_argument("--limit", type=int, default=0, help="yalnızca ilk N hisse (deneme için)")
    args = ap.parse_args()

    cache_dir = Path(args.cache_dir)
    tickers, tier, bist_names, index_date = load_universe(cache_dir)
    if args.limit:
        tickers = tickers[: args.limit]
    out = Path(args.out)
    hist_dir = out / "data" / "hist"
    hist_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    is_summ, is_fin, sample_funds = {}, {}, {}
    if args.sample:
        prices, sample_funds = make_sample(tickers + [INDEX])
    else:
        print(f"{len(tickers)} hisse + {INDEX} fiyatları indiriliyor…", flush=True)
        prices = download_prices(tickers + [INDEX])

    ok = [t for t in tickers if t in prices]
    failed = [t for t in tickers if t not in prices]
    print(f"Fiyat: {len(ok)}/{len(tickers)} hisse alındı.", flush=True)
    if len(ok) < max(1, len(tickers) // 2):
        print("HATA: hisselerin yarısından azı alınabildi; eski yayın korunması için durduruluyor.", file=sys.stderr)
        sys.exit(1)

    if not args.sample and not args.no_fundamentals:
        rank = {label: i for i, (_, label) in enumerate(TIERS)}
        by_priority = sorted(ok, key=lambda t: rank.get(tier.get(t), 9))  # BIST 30 → 50 → 100 → TÜM
        is_summ, is_fin = isyatirim.load(by_priority, cache_dir / "isyatirim.json", args.fund_max_age_days,
                                         args.fund_max_per_run, log=lambda s: print(s, flush=True))

    idx = prices.get(INDEX)
    stocks = []
    for t in ok:
        df = prices[t]
        write_hist(hist_dir / f"{t}.json", df)
        m = metrics(df, idx)
        if args.sample:
            f = sample_funds[t]
        else:
            s = is_summ.get(t) or {}
            f = {"name": s.get("name") or bist_names.get(t), "sector": s.get("sector"),
                 "freeFloat": s.get("freeFloat"), **isyatirim.ratios(m["last"], s, is_fin.get(t))}
        stocks.append({"t": t, "idx": tier.get(t), **f, **m})
    index_summary = None
    if idx is not None:
        write_hist(hist_dir / f"{INDEX}.json", idx)
        index_summary = {"t": INDEX, "name": "BIST 100", **metrics(idx, None)}

    summary = {
        "updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "lastDate": max(s["date"] for s in stocks),
        "indexDate": index_date,
        "sample": bool(args.sample),
        "source": "ÖRNEK VERİ" if args.sample else "Fiyat: Yahoo Finance (gecikmeli) · Mali tablolar: İş Yatırım",
        "index": index_summary,
        "failed": failed,
        "stocks": stocks,
    }
    (out / "data" / "summary.json").write_text(
        json.dumps(clean(summary), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Tamam: {out / 'data'} ({time.time() - t0:.0f} sn)", flush=True)


if __name__ == "__main__":
    main()
