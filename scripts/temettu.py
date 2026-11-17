"""temettuhisseleri.com hisse sayfalarından temettü geçmişi (ana kaynak) ve Yahoo ile birleştirme.

Sitedeki tutarlar NET (stopaj sonrası) ve bedelsiz/bölünmeye göre DÜZELTİLMEMİŞ hisse başı TL'dir.
Uygulama Yahoo ile aynı tabanı kullanır (brüt, bölünmeye göre düzeltilmiş), bu yüzden her kayıt çevrilir:
    brüt_düzeltilmiş = net / bölünme_çarpanı(tarihten sonraki bölünmeler, Yahoo) / (1 − stopaj(tarih))
Stopaj: 22.12.2021–21.12.2024 arası %10, öncesi ve sonrası %15; GYO gibi muaf şirketlerde %0
(muafiyet Yahoo ile eşleşen kayıtlardan anlaşılır).
"""
from __future__ import annotations

import datetime as dt
import html as html_lib
import json
import re
import statistics
import time
import urllib.request
from pathlib import Path

import pandas as pd

BASE = "https://temettuhisseleri.com/hisseanaliz/"
UA = "Mozilla/5.0 (Tahta; personal BIST dashboard)"
MONTHS = {"Oca": 1, "Şub": 2, "Mar": 3, "Nis": 4, "May": 5, "Haz": 6, "Tem": 7, "Ağu": 8, "Eyl": 9, "Eki": 10, "Kas": 11, "Ara": 12}
TAX10 = (dt.date(2021, 12, 22), dt.date(2024, 12, 22))  # stopajın %10 olduğu dönem [başlangıç, bitiş)
MATCH_DAYS = 5      # iki kaynaktaki aynı temettünün tarih farkı toleransı
AGREE_TOL = 0.03    # çevrilmiş site tutarı Yahoo'dan bu orandan fazla saparsa Yahoo hatalı sayılır


def parse(page: str) -> list[tuple[str, float]]:
    """Hisse sayfasındaki 'Tarih | Pay Başı | Yüzde | Kar Dağıtım' tablosu → [(ISO tarih, net TL)]."""
    out = []
    for table in re.findall(r"<table.*?</table>", page, re.S):
        rows = [[html_lib.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", tr, re.S)]
                for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S)]
        if not rows or rows[0][:2] != ["Tarih", "Pay Başı"]:
            continue
        for r in rows[1:]:
            m = re.fullmatch(r"(\d{1,2}) (\w{3}) (\d{4})", r[0]) if r else None
            if not m or m.group(2) not in MONTHS:
                continue
            try:
                net = float(r[1].replace("₺", "").replace(",", "").strip())
            except ValueError:
                continue
            if net > 0:
                out.append((dt.date(int(m.group(3)), MONTHS[m.group(2)], int(m.group(1))).isoformat(), net))
        break
    return sorted(out)


def load(symbols: list[str], cache_path: Path, recent: dict[str, list[str]] | None = None,
         max_age_days: float = 7, max_per_run: int = 120, delay: float = 0.4, log=print) -> dict[str, list[tuple[str, float]]]:
    """Önbellekli çekim. recent: takvimde görünen yakın tarihli temettüler {KOD: [ISO tarih]};
    önbellekte olmayan tarihi olan hisseler önce yenilenir. Döner: {KOD: [(tarih, net)]} (yalnızca önbellekte olanlar)."""
    try:
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        cache = {}
    now = time.time()

    def stale(s):
        c = cache.get(s)
        if not c:
            return True, 0
        dates = {d for d, _ in c["rows"]}
        missing = any(d not in dates for d in (recent or {}).get(s, []))
        return missing or now - c["_ts"] > max_age_days * 86400, c["_ts"]

    todo = []
    for s in symbols:
        need, ts = stale(s)
        if need:
            # Önce takvimde yeni kaydı olanlar, sonra hiç çekilmemişler, sonra en eskiler
            missing = s in cache and any(d not in {x for x, _ in cache[s]["rows"]} for d in (recent or {}).get(s, []))
            todo.append((0 if missing else 1 if not ts else 2, ts, s))
    todo.sort()
    fetched = failed = 0
    for _, _, s in todo[:max_per_run]:
        try:
            req = urllib.request.Request(BASE + s, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                rows = parse(r.read().decode("utf-8", "replace"))
            cache[s] = {"_ts": now, "rows": rows}
            fetched += 1
        except Exception as e:  # noqa: BLE001 — tek hisse hatası tümünü durdurmasın
            failed += 1
            if failed <= 3:
                log(f"  temettuhisseleri {s}: {e}")
            if failed >= 10:
                log("  temettuhisseleri: çok fazla hata, bu çalışmada bırakıldı.")
                break
        time.sleep(delay)
    if fetched:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    have = sum(1 for s in symbols if s in cache)
    log(f"Temettü geçmişi (temettuhisseleri): {fetched} hisse güncellendi, {have}/{len(symbols)} önbellekte"
        + (f", {len(todo) - fetched - failed} sonraki çalışmalara kaldı" if len(todo) > max_per_run else "") + ".")
    return {s: [tuple(x) for x in cache[s]["rows"]] for s in symbols if s in cache}


def tax_rate(date: dt.date, exempt: bool) -> float:
    if exempt:
        return 0.0
    return 0.10 if TAX10[0] <= date < TAX10[1] else 0.15


def merge(df: pd.DataFrame, site: list[tuple[str, float]] | None, exempt_hint: bool = False) -> tuple[pd.Series, dict]:
    """Yahoo temettülerini (df['Dividends']) site kayıtlarıyla karşılaştırıp düzeltir. Döner: (yeni seri, istatistik).

    Site her zaman tutarlı değildir (bazı eski kayıtlar brüt, bazı net tutarlar eski stopajla), Yahoo da ara sıra
    hatalıdır (ör. TUPRS 2023/09 iki kat). Kurallar:
      1. Uyumlu (site net ≈ Yahoo brüt × çarpan × {%85, %90, %100}) → Yahoo.
      2. Uyumsuz ama fark fiyatın %1'inden az (verime etkisi önemsiz) → Yahoo.
      3. Önemli fark → hak kullanım günündeki fiyat boşluğu (önceki kapanış − açılış) bilgi veriyorsa ona yakın olan,
         vermiyorsa site (ana kaynak).
      4. Yalnızca sitede olan → eklenir; yalnızca Yahoo'da olan → korunur.
    Site kaydı yoksa Yahoo olduğu gibi kalır."""
    idx = df.index
    yahoo = df["Dividends"] if "Dividends" in df.columns else pd.Series(0.0, index=idx)
    stats = {"src": "yahoo", "fixed": 0, "added": 0, "exempt": exempt_hint, "notes": []}
    if not site:
        return yahoo, stats
    start, end = idx[0].date(), idx[-1].date()
    splits = df["Stock Splits"] if "Stock Splits" in df.columns else pd.Series(dtype=float)
    splits = [(i.date(), float(r)) for i, r in splits.items() if r and r > 0 and r != 1]

    def factor(d: dt.date) -> float:
        f = 1.0
        for sd, r in splits:
            if sd > d:
                f *= r
        return f

    pos_of = {i.date(): k for k, i in enumerate(idx)}
    ys = [(i.date(), float(v)) for i, v in yahoo.items() if v > 0]
    sv = [(dt.date.fromisoformat(d), n) for d, n in site]
    sv = [(d, n) for d, n in sv if start <= d <= end]
    pairs, used = [], set()
    for d, n in sv:
        cand = [(abs((yd - d).days), j) for j, (yd, _) in enumerate(ys) if j not in used]
        best = min(cand) if cand else None
        if best and best[0] <= MATCH_DAYS:
            used.add(best[1])
            pairs.append((d, n, ys[best[1]]))
        else:
            pairs.append((d, n, None))

    def kind(d, n, y):  # site net / (Yahoo brüt × çarpan): 1 → stopajsız/brüt kayıt, 0,85/0,90 → net
        r = n / (y * factor(d))
        if abs(r - 1) <= AGREE_TOL:
            return "gross"
        if any(abs(r / k - 1) <= AGREE_TOL for k in (0.85, 0.90)):
            return "net"
        return None

    # Muafiyet: en son uyumlu kayıttaki duruma göre (GYO'larda site net = brüt)
    kinds = [kind(d, n, y[1]) for d, n, y in pairs if y]
    last = next((k for k in reversed(kinds) if k), None)
    exempt = (last == "gross") if last else exempt_hint
    stats.update(src="site", exempt=exempt)

    out = yahoo.copy()
    close, opn = df["Close"], df["Open"] if "Open" in df.columns else df["Close"]
    for d, n, y in pairs:
        g = n / factor(d) / (1 - tax_rate(d, exempt))
        if y is None:
            k = idx.searchsorted(pd.Timestamp(d).tz_localize(idx.tz) if idx.tz else pd.Timestamp(d))
            if k < len(idx):
                out.iloc[k] += g
                stats["added"] += 1
                stats["notes"].append(f"{d} eklendi {g:.4f}")
            continue
        yd, yv = y
        if kind(d, n, yv):
            continue
        k = pos_of.get(yd)
        if k is None or k == 0:
            continue
        prev = float(close.iloc[k - 1])
        if not prev or abs(yv - g) / prev < 0.01:
            continue
        gap = prev - float(opn.iloc[k])
        informative = abs(gap) > 1e-9 and abs(gap) >= 0.25 * abs(yv - g)
        if informative and abs(gap - yv) <= abs(gap - g):
            continue
        out.iloc[k] += g - yv
        stats["fixed"] += 1
        stats["notes"].append(f"{yd} {yv:.4f}→{g:.4f}" + (" (fiyat boşluğu)" if informative else ""))
    return out, stats
