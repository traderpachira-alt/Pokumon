"""İndirgenmiş nakit akışı (DCF) ve ters DCF (fiyatın ima ettiği büyüme), DOLAR bazında.

Neden dolar: TL bazında hem nakit akışlarını hem de %40+ iskonto oranını yüksek ve değişken enflasyonla tahmin etmek gerekir;
enflasyon muhasebesi (TMS 29) de dönemleri karşılaştırmayı zorlaştırır. Nakit akışları her dönemin sonundaki USD/TRY
kuruyla dolara çevrilir ve dolar iskonto oranıyla indirgenir.

Model (web/js/dcf.js aynı formülü kullanır; hesaplayıcı varsayımları değiştirmeye izin verir):
- Başlangıç serbest nakit akışı = serbest nakit akışı marjı × son 12 ay satış ($). Marj varsayılanı: son yılların
  (faaliyet nakit akışı − yatırım harcaması) / satış ortalaması.
- 1–10. yıllar: büyüme g1'den başlayıp doğrusal olarak uç büyümeye (gT) iner. 10. yıldan sonrası Gordon uç değeri.
- İskonto: WACC = E/(D+E)·özkaynak maliyeti + D/(D+E)·borç maliyeti·(1 − vergi).
  Özkaynak maliyeti = ABD 10Y + beta(ayarlı) × olgun piyasa risk primi + ülke risk primi.
- Özsermaye değeri = firma değeri − net borç − azınlık payları; hisse başına = / pay sayısı, güncel kurla TL'ye.
- Ters DCF: bugünkü fiyatı veren g1 (diğer varsayımlar sabit).

Kapsam: normalize serbest nakit akışı pozitif sanayi/hizmet şirketleri. Banka, sigorta, finansal kiralama, aracı kurum,
GYO, yatırım ortaklığı ve holdingler hariç (bu yöntem onlara uygun değil).
"""
from __future__ import annotations

import pandas as pd

from scores import Fin

ERP = 0.045            # olgun piyasa hisse risk primi (varsayılan)
CRP = 0.04             # Türkiye ülke risk primi (varsayılan)
GT = 0.03              # uç (sonsuz) büyüme, $
YEARS = 10
TAX = 0.25             # kurumlar vergisi (borç maliyetinin vergi kalkanı)
DEBT_SPREAD = 0.02     # borç maliyeti = ABD 10Y + ülke primi + bu fark
G1_MIN, G1_MAX = 0.0, 0.10
EXCLUDED_SECTORS = {"GYO", "Holdingler", "Bankacılık", "Sigorta", "Fin.Kiralama ve Faktoring", "Aracı Kurumlar",
                    "Yatırım Ortaklıkları", "Varlık Yönetim"}


def market_inputs() -> dict | None:
    """ABD 10 yıllık faiz ve USD/TRY geçmişi (Yahoo)."""
    import yfinance as yf

    d = yf.download(["^TNX", "USDTRY=X"], period="5y", interval="1d", auto_adjust=False, group_by="ticker",
                    progress=False, threads=True)
    tnx = d["^TNX"]["Close"].dropna()
    fx = d["USDTRY=X"]["Close"].dropna()
    if tnx.empty or fx.empty:
        return None
    return {"rf": float(tnx.iloc[-1]) / 100, "fx": fx}


def fx_at(fx: pd.Series, y: int, m: int) -> float | None:
    end = pd.Timestamp(y, m, 1) + pd.offsets.MonthEnd(0)
    if fx.index.tz is not None:
        end = end.tz_localize(fx.index.tz)
    s = fx[fx.index <= end]
    return float(s.iloc[-1]) if len(s) else None


def wacc_of(rf: float, beta: float, mcap: float, debt: float, erp: float = ERP, crp: float = CRP) -> dict:
    b = 0.67 * beta + 0.33  # Blume ayarı: tarihsel beta zamanla 1'e yaklaşır
    coe = rf + b * erp + crp
    cod = rf + crp + DEBT_SPREAD
    w = mcap / (mcap + debt) if mcap + debt > 0 else 1.0
    return {"beta": b, "coe": coe, "cod": cod, "we": w, "wacc": w * coe + (1 - w) * cod * (1 - TAX)}


def equity_value(fcf0: float, g1: float, gt: float, wacc: float, nd: float, minority: float, years: int = YEARS) -> dict:
    """$ cinsinden firma değeri, özsermaye değeri ve uç değerin payı."""
    pv, f = 0.0, fcf0
    for t in range(1, years + 1):
        g = g1 + (gt - g1) * (t - 1) / (years - 1)
        f *= 1 + g
        pv += f / (1 + wacc) ** t
    tv = f * (1 + gt) / (wacc - gt) / (1 + wacc) ** years
    ev = pv + tv
    return {"ev": ev, "eq": ev - nd - minority, "tvShare": tv / ev if ev else None}


def implied_growth(target_eq: float, fcf0: float, gt: float, wacc: float, nd: float, minority: float,
                   lo: float = -0.20, hi: float = 0.60) -> float | None:
    """Özsermaye değerini hedefe eşitleyen g1 (ikiye bölme). Aralık dışındaysa None."""
    f = lambda g: equity_value(fcf0, g, gt, wacc, nd, minority)["eq"] - target_eq  # noqa: E731
    if f(lo) > 0 or f(hi) < 0:
        return None
    for _ in range(60):
        mid = (lo + hi) / 2
        if f(mid) < 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def inputs(t: str, s: dict, fin: dict | None, mk: dict | None) -> dict:
    """Hisse için DCF girdileri ve sonuçları. Uygun değilse {"ok": False, "why": ...}."""
    if not mk:
        return {"ok": False, "why": "Piyasa verisi (ABD faizi, kur) alınamadı."}
    F = Fin(fin)
    if F.group != "XI_29" or (s.get("sector") in EXCLUDED_SECTORS) or t.endswith(("GY", "GYO")):
        return {"ok": False, "why": "Bu şirket türü (banka, sigorta, finansal kuruluş, GYO, yatırım ortaklığı ya da holding) için DCF uygun değil."}
    if not F.latest:
        return {"ok": False, "why": "Mali tablo verisi yok."}
    y, m = F.latest
    if F.get(y, m, "minority") is None:
        return {"ok": False, "why": "Mali tablo verisi yenileniyor (azınlık payları bekleniyor); birkaç güncelleme içinde gelir."}
    price, mcap = s.get("last"), s.get("mcap")
    if not price or not mcap:
        return {"ok": False, "why": "Piyasa değeri bilinmiyor."}
    fx, rf = mk["fx"], mk["rf"]
    fx_now = float(fx.iloc[-1])
    # Yıllık (ve son 12 ay) serbest nakit akışı ve satışlar, $
    pts = []
    years = sorted({int(p.split("/")[0]) for p in F.P})
    for yy in years:
        cfo, capex, rev, r = F.get(yy, 12, "cfo"), F.get(yy, 12, "capex"), F.get(yy, 12, "rev"), fx_at(fx, yy, 12)
        if None not in (cfo, capex, rev, r) and rev > 0 and (yy, 12) != (y, m):
            pts.append({"p": f"{yy}", "fcf": (cfo + capex) / r, "rev": rev / r})
    cfo, capex, rev, r = F.ttm(y, m, "cfo"), F.ttm(y, m, "capex"), F.ttm(y, m, "rev"), fx_at(fx, y, m)
    if None in (cfo, capex, rev, r) or rev <= 0:
        return {"ok": False, "why": "Son 12 ay nakit akışı ya da satış verisi eksik."}
    pts.append({"p": "Son 12 ay", "fcf": (cfo + capex) / r, "rev": rev / r})
    pts = pts[-3:]
    margin = sum(p["fcf"] for p in pts) / sum(p["rev"] for p in pts)
    rev0 = pts[-1]["rev"]
    debt = ((F.get(y, m, "debtS") or 0) + (F.get(y, m, "debtL") or 0)) / fx_now
    nd = debt - ((F.get(y, m, "cash") or 0) + (F.get(y, m, "fininv") or 0)) / fx_now
    minority = (F.get(y, m, "minority") or 0) / fx_now
    shares = mcap / price
    mcap_usd = mcap / fx_now
    w = wacc_of(rf, s.get("beta") if s.get("beta") is not None else 1.0, mcap_usd, debt)
    # Varsayılan büyüme: son yılların $ satış büyümesi, %0–10 aralığına sınırlanır
    g_hist = None
    if len(pts) >= 2 and pts[0]["rev"] > 0:
        n = len(pts) - 1
        g_hist = (pts[-1]["rev"] / pts[0]["rev"]) ** (1 / n) - 1
    g1 = min(max(g_hist if g_hist is not None else 0.03, G1_MIN), G1_MAX)
    base = {
        "ok": True, "rf": rf, "erp": ERP, "crp": CRP, "gt": GT, "years": YEARS, "tax": TAX, "spread": DEBT_SPREAD,
        "fx": fx_now, "shares": shares, "price": price, "rev0": rev0, "margin": margin, "g1": g1, "gHist": g_hist,
        "nd": nd, "debt": debt, "minority": minority, "mcapUsd": mcap_usd, "period": f"{y}/{m}",
        "pts": [{k: (round(v, 6) if isinstance(v, float) else v) for k, v in p.items()} for p in pts], **w,
    }
    fcf0 = margin * rev0
    if fcf0 <= 0:
        base.update(ok=False, why="Normalize serbest nakit akışı negatif (şirket yatırım döneminde ya da nakit yakıyor); DCF anlamlı değil.")
        return base
    v = equity_value(fcf0, g1, GT, w["wacc"], nd, minority)
    fair = v["eq"] * fx_now / shares
    lo = equity_value(fcf0, max(g1 - 0.05, -0.05), GT, w["wacc"] + 0.01, nd, minority)["eq"] * fx_now / shares
    hi = equity_value(fcf0, g1 + 0.05, GT, w["wacc"] - 0.01, nd, minority)["eq"] * fx_now / shares
    ig = implied_growth(mcap_usd, fcf0, GT, w["wacc"], nd, minority)
    clip = None
    if ig is None:  # fiyat aralığın dışında: hangi uçta olduğunu belirt
        clip = "low" if equity_value(fcf0, -0.20, GT, w["wacc"], nd, minority)["eq"] > mcap_usd else "high"
        ig = -0.20 if clip == "low" else 0.60
    base.update(fair=fair, fairLo=lo, fairHi=hi, upside=fair / price - 1, tvShare=v["tvShare"], impliedG=ig, impliedClip=clip)
    return base


def summary_fields(d: dict) -> dict:
    """Tarama tablosuna giden alanlar."""
    if not d.get("ok"):
        return {"dcfFair": None, "dcfUpside": None, "dcfImpliedG": None}
    return {"dcfFair": d["fair"], "dcfUpside": d["upside"], "dcfImpliedG": d["impliedG"]}
