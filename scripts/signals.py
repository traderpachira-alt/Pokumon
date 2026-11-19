"""Alım kurulumları (setup): giriş, stop ve hedef (TP) ile sinyal üretimi ve geriye dönük test.

Her kurulum yalnızca o güne kadarki veriyi kullanır (ileriye bakmaz); canlı sinyal ve geriye dönük test aynı kuralları
aynı kodla çalıştırır. Yalnızca alış (BIST'te açığa satış çoğu yatırımcı için pratik değil).

İşlem kuralları (test ve canlı):
- Sinyal gün sonu kapanışla oluşur; giriş ertesi gün AÇILIŞTA yapılır. Açılış stopun altındaysa ya da planlanan
  girişin 0,5R'den fazla üstündeyse (fırsat kaçtı) işlem açılmaz.
- Stop ve hedef sabittir. Aynı gün hem stop hem hedef görülürse stop varsayılır (temkinli). Açılış stopun altında/hedefin
  üstünde gelirse açılıştan çıkılır. En fazla HOLD_MAX işlem günü tutulur, sonra kapanıştan çıkılır.
- Sonuç R cinsindendir (1R = giriş − stop). Komisyon+kayma için gidiş-dönüş COST düşülür.
- Aynı hissede aynı kurulumdan, önceki işlem kapanmadan yeni işlem açılmaz.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from indicators import ema, rma, sma, stoch_rsi, supertrend, true_range, wilder_rsi

HOLD_MAX = 40          # en uzun tutma (işlem günü)
COST = 0.002           # gidiş-dönüş komisyon + kayma (fiyatın oranı)
MIN_TURNOVER = 20e6    # 20 günlük ortalama işlem hacmi alt sınırı (TL)
RISK_MIN, RISK_MAX = 0.015, 0.12   # stop mesafesi fiyatın %1,5–%12'si arasında olmalı
MIN_RR, DEFAULT_RR, MAX_RR = 1.5, 2.5, 5.0
MIN_ROOM = {"destek": 2.5, "kirilim": 2.0}
RISK_MAX_BY = {"destek": 0.05}  # destekten dönüşte stop desteğe yakın olmalı (fiyat gerçekten destekte)  # bu kurulumlarda en yakın direnç en az bu kadar R uzakta olmalı
CHASE_R = 0.5          # giriş fiyatı bu kadar R yukarıda açılırsa işlem yapılmaz
PIVOT = 5              # dönüş noktası: iki yanında 5'er mum (5 gün sonra kesinleşir)

SETUPS = {
    "destek": {
        "name": "Destekten dönüş",
        "summary": "Yükselen trendde desteğe geri çekilen ve tepki veren hisse",
        "trial": "Deneme aşamasında: ek filtreler seçilirken test dönemine de bakıldı; sonuç diğer kurulumlara göre daha az güvenilir.",
        "rules": [
            "Trend yukarı: fiyat > SMA200, SMA50 > SMA200 ve SMA50 son 10 günde yükselmiş",
            "Geri çekilme: RSI 14 30 ile 50 arasında",
            "Destek: son 120 günün kesinleşmiş en yakın dip noktası ya da SMA50 (hangisi fiyata yakın ve altındaysa); fiyat desteğin en fazla 1 ATR üstünde",
            "Tepki: gün yeşil kapanmış ve önceki kapanışın üstünde",
            "Onay: hacim 20 günlük ortalamanın en az 1,2 katı ya da Supertrend yukarı",
            "Yer: stop mesafesi en fazla %5 (fiyat desteğe gerçekten yakın) ve en yakın direnç en az 2,5R uzakta",
            "Stop: destek − 0,5 ATR",
        ],
    },
    "kirilim": {
        "name": "Hacimli kırılım",
        "summary": "Trend içinde 55 günlük zirveyi hacimle kıran hisse",
        "rules": [
            "Kapanış önceki 55 günün en yükseğinin üstünde",
            "Hacim 20 günlük ortalamanın en az 1,5 katı; kapanış günün üst %40'ında",
            "Trend: fiyat > SMA50 > SMA200; RSI 14 < 75 (aşırı uzamamış)",
            "Yer: en yakın direnç en az 2R uzakta (yoksa alınmaz)",
            "Stop: kırılan seviye − 1 ATR (kırılım başarısız sayılır)",
        ],
    },
    "dipdonus": {
        "name": "Aşırı satımdan dönüş",
        "summary": "Uzun vadeli trendi yukarı olup kısa vadede aşırı satılan ve dönen hisse",
        "trial": "Zayıf: test sonucu başa başa yakın ve yıldan yıla dalgalı.",
        "rules": [
            "Uzun vade: fiyat > SMA200",
            "Son 5 günde RSI 14 < 30 olmuş, bugün 30'un üstüne çıkmış",
            "Gün yeşil kapanmış ve kapanış önceki günün en yükseğinin üstünde",
            "Stop: son 10 günün en düşüğü − 0,25 ATR",
        ],
    },
    "supertrend": {
        "name": "Supertrend dönüşü",
        "summary": "Supertrend yukarı dönen, momentumu ve hacmi onaylayan hisse",
        "rules": [
            "Supertrend (10, 3) bugün yukarı döndü",
            "MACD histogramı pozitif, fiyat > SMA50",
            "Hacim 20 günlük ortalamanın en az 1,2 katı",
            "Stop: Supertrend çizgisi",
        ],
    },
}
TP_RULE = ("Hedef: girişin en az 1,5R üstündeki en yakın direnç (son 250 günün kesinleşmiş tepe noktaları, 120 günlük zirve, "
           "SMA50/SMA200). Yakında direnç yoksa (fiyat zirvede) 2,5R; en fazla 5R.")


def _pivots(h, lo, n=PIVOT):
    """Kesinleşmiş dönüş noktaları: (indeks, değer) listeleri. i noktası i+n'de kesinleşir."""
    lows, highs = [], []
    for i in range(n, len(lo) - n):
        w_lo, w_hi = lo[i - n:i + n + 1], h[i - n:i + n + 1]
        if lo[i] == w_lo.min():
            lows.append((i, lo[i]))
        if h[i] == w_hi.max():
            highs.append((i, h[i]))
    return lows, highs


def frame(df: pd.DataFrame) -> dict | None:
    """Kurulumlar için günlük göstergeler (numpy dizileri)."""
    if len(df) < 260:
        return None
    o, h, lo, c, v = (df[k].to_numpy(dtype=float) for k in ("Open", "High", "Low", "Close", "Volume"))
    tr = true_range(h, lo, c)
    macd = ema(c, 12) - ema(c, 26)
    st_line, st_trend = supertrend(h, lo, c)
    vol_avg = pd.Series(v).rolling(20).mean().shift(1).to_numpy()
    k, d = stoch_rsi(c)
    return {
        "idx": df.index, "o": o, "h": h, "l": lo, "c": c, "v": v,
        "sma50": sma(c, 50), "sma200": sma(c, 200), "rsi": wilder_rsi(c), "atr": rma(tr, 14),
        "macdh": macd - ema(macd, 9), "st_line": st_line, "st_trend": st_trend,
        "volr": v / np.where(vol_avg > 0, vol_avg, np.nan),
        "turn": pd.Series(c * v).rolling(20).mean().to_numpy(),
        "hh55": pd.Series(h).rolling(55).max().shift(1).to_numpy(),
        "hh120": pd.Series(h).rolling(120).max().shift(1).to_numpy(),
        "stk": k, "std": d,
        "piv": _pivots(h, lo),
    }


def _support(F, t):
    """t gününde bilinen en yakın destek (fiyatın altında): son 120 günün kesinleşmiş dipleri ve SMA50."""
    c = F["c"][t]
    cands = [val for i, val in F["piv"][0] if t - 120 <= i <= t - PIVOT and val <= c]
    if F["sma50"][t] <= c:
        cands.append(F["sma50"][t])
    return max(cands) if cands else None


def _target(F, t, entry, risk):
    """Girişin en az MIN_RR·R üstündeki en yakın direnç; yoksa DEFAULT_RR·R; en fazla MAX_RR·R."""
    floor_, cap = entry + MIN_RR * risk, entry + MAX_RR * risk
    cands = [val for i, val in F["piv"][1] if t - 250 <= i <= t - PIVOT]
    cands += [F["hh120"][t], F["sma50"][t], F["sma200"][t]]
    above = [x for x in cands if np.isfinite(x) and floor_ <= x <= cap]
    return min(above) if above else entry + DEFAULT_RR * risk


def setups_at(F, t) -> list[dict]:
    """t günü kapanışında oluşan sinyaller: [{"k", "entry", "stop", "tp"}]."""
    if t < 220:
        return []
    c, o, h, lo = F["c"][t], F["o"][t], F["h"][t], F["l"][t]
    atr, rsi, s50, s200 = F["atr"][t], F["rsi"][t], F["sma50"][t], F["sma200"][t]
    if not all(np.isfinite([c, atr, rsi, s50, s200])) or atr <= 0 or not F["turn"][t] >= MIN_TURNOVER:
        return []
    out = []
    green = c > o and c > F["c"][t - 1]

    # 1) Destekten dönüş
    confirm = F["volr"][t] >= 1.2 or F["st_trend"][t] == 1
    if c > s200 and s50 > s200 and s50 > F["sma50"][t - 10] and 30 <= rsi < 50 and green and confirm:
        sup = _support(F, t)
        if sup is not None and c - sup <= atr:
            out.append({"k": "destek", "stop": sup - 0.5 * atr})
    # 2) Hacimli kırılım
    hh = F["hh55"][t]
    if (np.isfinite(hh) and c > hh and F["volr"][t] >= 1.5 and c > s50 > s200 and rsi < 75
            and h > lo and (c - lo) / (h - lo) >= 0.6):
        out.append({"k": "kirilim", "stop": hh - atr})
    # 3) Aşırı satımdan dönüş
    r5 = F["rsi"][t - 5:t]
    if c > s200 and np.nanmin(r5) < 30 and rsi >= 30 and c > o and c > F["h"][t - 1]:
        out.append({"k": "dipdonus", "stop": F["l"][t - 9:t + 1].min() - 0.25 * atr})
    # 4) Supertrend dönüşü
    if F["st_trend"][t] == 1 and F["st_trend"][t - 1] == -1 and F["macdh"][t] > 0 and c > s50 and F["volr"][t] >= 1.2:
        out.append({"k": "supertrend", "stop": F["st_line"][t]})

    res = []
    for s in out:
        risk = c - s["stop"]
        if not (RISK_MIN <= risk / c <= RISK_MAX_BY.get(s["k"], RISK_MAX)):
            continue
        tp = _target(F, t, c, risk)
        if (tp - c) / risk < MIN_ROOM.get(s["k"], MIN_RR) - 1e-9:
            continue  # en yakın direnç çok yakın
        res.append({"k": s["k"], "entry": c, "stop": s["stop"], "tp": tp})
    return res


def simulate(F, t, sig) -> dict:
    """t gününde oluşan sinyali t+1 açılışından itibaren yürütür. Döner {"status", "r", "exit_t", "fill"}.
    status: 'tp' | 'stop' | 'time' | 'open' (henüz sonuçlanmadı) | 'pending' (yarın açılışta) | 'skip' (açılış uygun değil)"""
    n = len(F["c"])
    if t + 1 >= n:
        return {"status": "pending"}
    entry, stop, tp = sig["entry"], sig["stop"], sig["tp"]
    plan_risk = entry - stop
    fill = F["o"][t + 1]
    if not np.isfinite(fill) or fill <= stop or fill > entry + CHASE_R * plan_risk:
        return {"status": "skip", "fill": fill}
    # R, PLANLANAN riske göre: pozisyon büyüklüğü sinyal akşamı (giriş − stop) ile belirlenir. Gerçekleşen açılışa göre
    # hesaplamak, açılış stopa çok yakın geldiğinde riski kâğıt üzerinde sıfıra yaklaştırıp sonucu şişirirdi.
    risk = plan_risk
    cost_r = COST * fill / risk

    def res(status, px, i):
        return {"status": status, "r": (px - fill) / risk - cost_r, "pct": (px - fill) / fill - COST,
                "exit_t": i, "fill": fill, "exit": px}

    for i in range(t + 1, min(n, t + 1 + HOLD_MAX)):
        o, h, lo = F["o"][i], F["h"][i], F["l"][i]
        if i > t + 1 and o <= stop:
            return res("stop", o, i)
        if i > t + 1 and o >= tp:
            return res("tp", o, i)
        if lo <= stop:
            return res("stop", stop, i)
        if h >= tp:
            return res("tp", tp, i)
    last = min(n, t + 1 + HOLD_MAX) - 1
    if last == n - 1 and n - 1 < t + HOLD_MAX:
        return {"status": "open", "r": (F["c"][-1] - fill) / risk, "pct": F["c"][-1] / fill - 1, "fill": fill}
    return res("time", F["c"][last], last)


ACCOUNT = {"capital": 100_000, "risk": 0.01, "maxPos": 10}


def account(trades: list[dict], capital: float = ACCOUNT["capital"], risk: float = ACCOUNT["risk"],
            max_pos: int = ACCOUNT["maxPos"]) -> dict | None:
    """Gerçekçi hesap: sinyaller tarih sırasıyla alınır; her işlemde 1R = özsermayenin `risk` oranı (pozisyon = risk /
    stop mesafesi), kaldıraç yok (nakit yetmezse pozisyon küçülür), en fazla `max_pos` açık pozisyon; aynı gün daha fazla
    sinyal varsa listedeki sıraya göre (hisse koduna göre) alınır. Açık pozisyonlar maliyetle değerlenir.
    Döner: alınan işlem, son değer, yıllık getiri, en büyük düşüş."""
    if not trades:
        return None
    T = sorted(trades, key=lambda x: (x["d0"], x["d1"]))
    days = sorted({x["d0"] for x in T} | {x["d1"] for x in T})
    by_day = {}
    for x in T:
        by_day.setdefault(x["d0"], []).append(x)
    cash, open_, taken, peak, mdd = capital, [], 0, capital, 0.0
    for d in days:
        for p in [p for p in open_ if p["d1"] <= d]:
            cash += p["pos"] * (1 + p["pct"])
            open_.remove(p)
        equity = cash + sum(p["pos"] for p in open_)
        peak = max(peak, equity)
        mdd = max(mdd, 1 - equity / peak)
        for x in by_day.get(d, []):
            if len(open_) >= max_pos:
                break
            pos = min(equity * risk / max(x["rp"], 1e-6), cash)
            if pos < equity * 0.02:  # nakit kalmadı
                continue
            cash -= pos
            open_.append({"pos": pos, "pct": x["pct"], "d1": x["d1"]})
            taken += 1
    final = cash + sum(p["pos"] * (1 + p["pct"]) for p in open_)
    yrs = max((days[-1] - days[0]).days / 365.25, 0.1)
    return {"taken": taken, "final": round(final), "cagr": round((final / capital) ** (1 / yrs) - 1, 4), "mdd": round(mdd, 4),
            "years": round(yrs, 1)}


def bench(idx: pd.DataFrame | None, years: int = 4) -> dict | None:
    """Aynı dönemde endeksi alıp tutmanın yıllık getirisi ve en büyük düşüşü (karşılaştırma için)."""
    if idx is None or len(idx) < 300:
        return None
    c = idx["Close"].dropna()
    c = c[c.index >= c.index[-1] - pd.DateOffset(years=years)]
    yrs = (c.index[-1] - c.index[0]).days / 365.25
    return {"cagr": round(float((c.iloc[-1] / c.iloc[0]) ** (1 / yrs) - 1), 4), "mdd": round(float((1 - c / c.cummax()).max()), 4)}


def run(prices: dict[str, pd.DataFrame], recent_days: int = 60, years: int = 4) -> dict:
    """Tüm hisselerde sinyal üret ve test et. Döner: {"stats", "active", "recent", "trades_n"}."""
    trades = {k: [] for k in SETUPS}
    active, recent = [], []
    end_dates = {}
    for sym, df in prices.items():
        F = frame(df)
        if F is None:
            continue
        n = len(F["c"])
        start = max(220, n - years * 252)
        busy = {k: -1 for k in SETUPS}  # o kurulumda açık işlemin bittiği gün
        end_dates[sym] = F["idx"][-1]
        for t in range(start, n):
            for sig in setups_at(F, t):
                k = sig["k"]
                if t <= busy[k]:
                    continue
                r = simulate(F, t, sig)
                date = F["idx"][t].strftime("%Y-%m-%d")
                rec = {"t": sym, "k": k, "d": date, "e": round(sig["entry"], 4), "s": round(sig["stop"], 4),
                       "tp": round(sig["tp"], 4), "st": r["status"]}
                if r["status"] in ("tp", "stop", "time"):
                    busy[k] = r["exit_t"]
                    trades[k].append({"r": r["r"], "pct": r["pct"], "bars": r["exit_t"] - t, "y": F["idx"][t].year, "st": r["status"],
                                      "d0": F["idx"][t + 1], "d1": F["idx"][r["exit_t"]], "rp": (sig["entry"] - sig["stop"]) / r["fill"]})
                    rec.update(r=round(r["r"], 3), xd=F["idx"][r["exit_t"]].strftime("%Y-%m-%d"), x=round(r["exit"], 4))
                elif r["status"] == "open":
                    busy[k] = n
                    rec.update(r=round(r["r"], 3), f=round(r["fill"], 4))
                if r["status"] == "skip" and "fill" in r:
                    rec["f"] = round(float(r["fill"]), 4)
                if t >= n - recent_days:
                    if r["status"] in ("pending", "open"):
                        rec["c"] = round(float(F["c"][-1]), 4)
                        active.append(rec)
                    else:
                        recent.append(rec)
    stats = {}
    for k, lst in trades.items():
        rs = np.array([x["r"] for x in lst])
        if not len(rs):
            stats[k] = {"n": 0}
            continue
        pos, neg = rs[rs > 0].sum(), -rs[rs < 0].sum()
        by_year = {}
        for y in sorted({x["y"] for x in lst}):
            ry = np.array([x["r"] for x in lst if x["y"] == y])
            by_year[str(y)] = {"n": int(len(ry)), "avgR": round(float(ry.mean()), 3), "win": round(float((ry > 0).mean()), 3)}
        stats[k] = {
            "n": int(len(rs)),
            "tp": round(sum(x["st"] == "tp" for x in lst) / len(lst), 3),
            "stop": round(sum(x["st"] == "stop" for x in lst) / len(lst), 3),
            "time": round(sum(x["st"] == "time" for x in lst) / len(lst), 3),
            "win": round(float((rs > 0).mean()), 3),
            "avgPct": round(float(np.mean([x["pct"] for x in lst])), 4),
            "avgR": round(float(rs.mean()), 3),
            "medR": round(float(np.median(rs)), 3),
            "pf": round(float(pos / neg), 2) if neg > 0 else None,
            "bars": round(float(np.mean([x["bars"] for x in lst])), 1),
            "byYear": by_year,
            "account": account(lst),
        }
    active = [a for a in active if a["st"] != "skip"]
    active.sort(key=lambda a: (a["d"], a["t"]), reverse=True)
    recent.sort(key=lambda a: (a["d"], a["t"]), reverse=True)
    return {"stats": stats, "active": active, "recent": recent}
