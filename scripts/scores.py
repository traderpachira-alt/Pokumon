"""Mali tablo ve temettü verisinden skorlar.

- Piotroski F-skoru (0–9): son 12 ay (TTM) ile bir yıl önceki TTM karşılaştırılır. Yalnızca sanayi/hizmet şirketleri
  (İş Yatırım XI_29 grubu); bankalarda kalem yapısı farklı olduğu için hesaplanmaz.
- Temettü güvenlik skoru (0–100): 7 bileşen; verisi olmayan ya da şirket türüne uymayan bileşenler dışarıda bırakılır ve
  puan kalan bileşenlerin toplamı üzerinden 100'e ölçeklenir (uygulanabilir bileşenlerin en az %75'inin verisi gerekir).
- Verim bandı: güncel son 12 ay temettü verimi, hissenin kendi 5 yıllık günlük verim geçmişinin hangi yüzdelik dilimde.
- Mali tablo özeti: hisse sayfasındaki 'Mali tablolar' bölümü için çeyreklik/yıllık kalemler.

Not: TMS 29 (enflasyon muhasebesi) nedeniyle her rapor kendi dönem sonu satın alma gücüyle yayımlanır; TTM toplamları ve
dönemler arası karşılaştırmalar yaklaşık değerlerdir. Oran temelli kriterler bu etkiden daha az etkilenir.
"""
from __future__ import annotations

import pandas as pd


# ----------------------------------------------------------------------------
# Dönem yardımcıları (gelir tablosu ve nakit akışı kümülatif gelir)
# ----------------------------------------------------------------------------
class Fin:
    def __init__(self, fin: dict | None):
        self.group = (fin or {}).get("group")
        self.P = (fin or {}).get("periods") or {}
        keys = [tuple(map(int, k.split("/"))) for k in self.P]
        self.latest = max(keys) if keys else None

    def get(self, y: int, m: int, k: str):
        v = self.P.get(f"{y}/{m}", {}).get(k)
        return v

    def ttm(self, y: int, m: int, k: str):
        """(y, m) dönem sonunda biten son 12 ay toplamı."""
        cur = self.get(y, m, k)
        if cur is None:
            return None
        if m == 12:
            return cur
        a, s = self.get(y - 1, 12, k), self.get(y - 1, m, k)
        return None if a is None or s is None else cur + a - s

    def quarter(self, y: int, m: int, k: str):
        """Yalnızca o çeyreğin değeri."""
        cur = self.get(y, m, k)
        if cur is None:
            return None
        if m == 3:
            return cur
        prev = self.get(y, m - 3, k)
        return None if prev is None else cur - prev

    def quarters(self, n: int) -> list[tuple[int, int]]:
        """Son n çeyrek, eskiden yeniye."""
        if not self.latest:
            return []
        y, m = self.latest
        out = []
        for _ in range(n):
            out.append((y, m))
            m -= 3
            if m == 0:
                y, m = y - 1, 12
        return out[::-1]


def _div(a, b):
    return None if a is None or b is None or b == 0 else a / b


def _avg(*xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


# ----------------------------------------------------------------------------
# Piotroski F-skoru
# ----------------------------------------------------------------------------
F_LABELS = [
    "Varlık kârlılığı pozitif",
    "Faaliyet nakit akışı pozitif",
    "Varlık kârlılığı arttı",
    "Nakit akışı > net kâr",
    "Uzun vadeli borç/varlık azaldı",
    "Cari oran arttı",
    "Bedelli sermaye artırımı yok",
    "Brüt marj arttı",
    "Varlık devir hızı arttı",
]


def piotroski(fin: dict | None) -> dict:
    """{"fScore": 0–9 | None, "fItems": [1/0/None × 9], "fVals": [[şimdi, önce] × 9]}"""
    F = Fin(fin)
    out = {"fScore": None, "fItems": None, "fVals": None}
    if F.group != "XI_29" or not F.latest:
        return out
    y, m = F.latest
    t = lambda k, dy=0: F.ttm(y - dy, m, k)  # noqa: E731
    b = lambda k, dy=0: F.get(y - dy, m, k)  # noqa: E731  bilanço kalemi (dönem sonu)

    # Dönem başı varlıklar (Piotroski: yıl başı varlıklar) → bir yıl önceki aynı çeyrek sonu
    roa = _div(t("net"), b("assets", 1))
    roa_p = _div(t("net", 1), b("assets", 2))
    cfo, cfo_p = t("cfo"), t("cfo", 1)
    lev = _div(b("debtL") or 0 if b("assets") else None, _avg(b("assets"), b("assets", 1)))
    lev_p = _div(b("debtL", 1) or 0 if b("assets", 1) else None, _avg(b("assets", 1), b("assets", 2)))
    cr, cr_p = _div(b("curA"), b("curL")), _div(b("curA", 1), b("curL", 1))
    cap_inc = t("capInc")
    gm, gm_p = _div(t("gross"), t("rev")), _div(t("gross", 1), t("rev", 1))
    at, at_p = _div(t("rev"), b("assets", 1)), _div(t("rev", 1), b("assets", 2))
    net = t("net")

    def gt(a, c):
        return None if a is None or c is None else int(a > c)

    items = [
        gt(roa, 0),
        gt(cfo, 0),
        gt(roa, roa_p),
        None if cfo is None or net is None or b("assets") is None else int(cfo > net),
        None if lev is None or lev_p is None else int(lev < lev_p or (lev == 0 and lev_p == 0)),
        gt(cr, cr_p),
        None if cap_inc is None else int(abs(cap_inc) < 1e-6 * (b("assets") or 1)),
        gt(gm, gm_p),
        gt(at, at_p),
    ]
    vals = [[roa, 0], [cfo, 0], [roa, roa_p], [cfo, net], [lev, lev_p], [cr, cr_p], [cap_inc, 0], [gm, gm_p], [at, at_p]]
    out["fItems"] = items
    out["fVals"] = [[None if v is None else round(v, 6) for v in pair] for pair in vals]
    if sum(i is None for i in items) <= 2:  # en fazla 2 eksik kriter; eksikler 0 sayılır
        out["fScore"] = sum(i or 0 for i in items)
    return out


# ----------------------------------------------------------------------------
# Temettü güvenlik skoru
# ----------------------------------------------------------------------------
DS_PARTS = [  # anahtar, etiket, en yüksek puan
    ("payout", "Dağıtma oranı (kâra göre)", 20),
    ("fcfCover", "Serbest nakit akışı karşılama", 20),
    ("leverage", "Net borç / FAVÖK", 15),
    ("continuity", "Süreklilik (son 5 yıl, kesintisiz)", 15),
    ("cuts", "Kesinti geçmişi (son 3 yıl)", 10),
    ("roe", "Özkaynak kârlılığı", 10),
    ("fscore", "F-skoru (finansal sağlık)", 10),
]


BANK_NA = {"fcfCover", "leverage", "fscore"}  # bankalarda uygulanmayan bileşenler


def _step(x, steps):
    """steps: [(eşik, puan), ...] artan eşik; x eşikten küçük/eşitse o puan; hiçbiri değilse son puan."""
    for th, pts in steps[:-1]:
        if x <= th:
            return pts
    return steps[-1][1]


def dividend_safety(fin: dict | None, d: dict) -> dict:
    """d: hisse ölçütleri (divYears5, divStreak, divByYear {yıl: toplam}, payout, roe, fScore, divPaid12 (TL),
    curYear). Döner {"dsScore": 0–100 | None, "dsParts": [[anahtar, puan | None, en yüksek, değer]]}"""
    F = Fin(fin)
    bank = F.group == "UFRS"
    y, m = F.latest or (None, None)
    t = (lambda k: F.ttm(y, m, k)) if F.latest else (lambda k: None)
    b = (lambda k: F.get(y, m, k)) if F.latest else (lambda k: None)
    parts = {}

    # 1) Dağıtma oranı: son 12 ayda ödenen temettü / son 12 ay net kâr
    p = d.get("payout")
    net = t("net")
    if net is not None and net <= 0 and (d.get("divPaid12") or 0) > 0:
        parts["payout"] = (0, net)  # zararda temettü
    elif p is not None:
        parts["payout"] = (_step(p, [(0.40, 20), (0.60, 15), (0.80, 8), (1.00, 3), (9e9, 0)]), p)

    # 2) Serbest nakit akışı (faaliyet nakit akışı − yatırım harcaması) / ödenen temettü
    if not bank:
        cfo, capex = t("cfo"), t("capex")
        paid = d.get("paid12") or (abs(t("div")) if t("div") else None)  # şirketin kendi temettüsü; yoksa nakit akışı kalemi
        if cfo is not None and capex is not None:
            fcf = cfo + capex
            if paid and abs(paid) > 0:
                cov = fcf / abs(paid)
                parts["fcfCover"] = (_step(-cov, [(-2.0, 20), (-1.5, 16), (-1.0, 10), (-0.5, 4), (9e9, 0)]), cov)
            else:
                parts["fcfCover"] = (10 if fcf > 0 else 0, None)  # son 12 ayda temettü ödenmemiş: nötr

    # 3) Net borç / FAVÖK
    if not bank:
        op, dep = t("op"), t("dep")
        debt = (b("debtS") or 0) + (b("debtL") or 0)
        if op is not None and dep is not None and b("eq") is not None:
            ebitda = op + abs(dep)
            nd = debt - (b("cash") or 0) - (b("fininv") or 0)
            if nd <= 0:
                parts["leverage"] = (15, nd / ebitda if ebitda > 0 else None)
            elif ebitda <= 0:
                parts["leverage"] = (0, None)
            else:
                r = nd / ebitda
                parts["leverage"] = (_step(r, [(1.0, 13), (2.0, 9), (3.0, 4), (9e9, 0)]), r)

    # 4) Süreklilik: son 5 takvim yılının kaçında ödedi (×2) + kesintisiz ≥5 yıl ise +5
    y5, streak = d.get("divYears5"), d.get("divStreak")
    if y5 is not None:
        parts["continuity"] = (min(15, 2 * y5 + (5 if (streak or 0) >= 5 else 0)), y5)

    # 5) Kesinti geçmişi: tamamlanmış son 3 yılda yıllık toplam bir önceki yılın %90'ının altına düştü mü
    by, cy = d.get("divByYear") or {}, d.get("curYear")
    if cy and by:
        yrs = [cy - 3, cy - 2, cy - 1]
        cuts = sum(1 for yy in yrs if by.get(yy - 1, 0) > 0 and by.get(yy, 0) < 0.9 * by[yy - 1])
        parts["cuts"] = ({0: 10, 1: 5}.get(cuts, 0), cuts)

    # 6) Özkaynak kârlılığı (yüksek enflasyon ortamında düşük ROE reel olarak sermaye eritir)
    roe = d.get("roe")
    if roe is not None:
        parts["roe"] = (_step(-roe, [(-0.25, 10), (-0.15, 6), (-0.05, 3), (9e9, 0)]), roe)

    # 7) F-skoru
    fs = d.get("fScore")
    if fs is not None and not bank:
        parts["fscore"] = (round(fs / 9 * 10, 1), fs)

    rows, got, avail = [], 0.0, 0
    for k, _label, mx in DS_PARTS:
        if k in parts:
            pts, val = parts[k]
            got += pts
            avail += mx
            rows.append([k, pts, mx, None if val is None else round(val, 4)])
        else:
            rows.append([k, None, mx, None])
    # Şirket türüne uygulanabilir bileşenlerin en az %75'inin verisi olmalı (bankalarda nakit akışı/borç/F-skoru yok)
    applicable = sum(mx for k, _l, mx in DS_PARTS if not (bank and k in BANK_NA))
    score = round(got / avail * 100) if avail and avail >= 0.75 * applicable else None
    return {"dsScore": score, "dsParts": rows}


# ----------------------------------------------------------------------------
# Verim bandı
# ----------------------------------------------------------------------------
def yield_band(df: pd.DataFrame) -> dict:
    """Son 12 ay temettüsü / fiyat serisinin (günlük) son 4 yıllık dağılımında güncel değerin yeri.
    En az 2 farklı yılda temettü ve pozitif güncel verim gerekir."""
    out = {"ttmYield": None, "yieldPct": None, "yieldMin": None, "yieldMed": None, "yieldMax": None}
    if "Dividends" not in df.columns:
        return out
    d = df["Dividends"].fillna(0)
    paid = d[d > 0]
    if paid.empty or len(set(paid.index.year)) < 2:
        return out
    ttm = d.rolling("365D").sum()
    y = (ttm / df["Close"]).where(df["Close"] > 0)
    y = y[y.index >= y.index[0] + pd.DateOffset(days=365)]  # ilk yıl eksik pencere
    if len(y) < 250:
        return out
    cur = float(y.iloc[-1])
    out["ttmYield"] = cur
    if cur <= 0:
        return out
    out["yieldPct"] = float((y < cur).mean())
    out["yieldMin"], out["yieldMed"], out["yieldMax"] = float(y.min()), float(y.median()), float(y.max())
    return out


# ----------------------------------------------------------------------------
# Mali tablo özeti (hisse sayfası)
# ----------------------------------------------------------------------------
ROWS = {
    "XI_29": [  # anahtar, etiket, tür: f=akış (çeyrek farkı alınır), b=bilanço, r=oran (hesaplanır)
        ("rev", "Satışlar", "f"), ("gross", "Brüt kâr", "f"), ("gm", "Brüt marj", "r"),
        ("ebitda", "FAVÖK", "f"), ("em", "FAVÖK marjı", "r"), ("net", "Net kâr", "f"), ("nm", "Net marj", "r"),
        ("cfo", "Faaliyet nakit akışı", "f"), ("capex", "Yatırım harcaması", "f"), ("fcf", "Serbest nakit akışı", "f"),
        ("div", "Ödenen temettü", "f"),
        ("assets", "Toplam varlıklar", "b"), ("eq", "Özkaynak", "b"), ("nd", "Net borç", "b"), ("cr", "Cari oran", "r"),
    ],
    "UFRS": [
        ("nii", "Net faiz geliri", "f"), ("fees", "Net ücret ve komisyon", "f"), ("opInc", "Faaliyet gelirleri", "f"),
        ("prov", "Karşılık giderleri", "f"), ("net", "Net kâr", "f"),
        ("loans", "Krediler", "b"), ("deposits", "Mevduat", "b"), ("ldr", "Kredi / mevduat", "r"),
        ("assets", "Aktif toplamı", "b"), ("eq", "Özkaynak", "b"),
    ],
}


def statements(fin: dict | None) -> dict | None:
    """{"group", "q": [dönemler], "y": [yıllar], "rows": [[anahtar, etiket, tür, [çeyrek değerleri], [yıllık değerler]]]}"""
    F = Fin(fin)
    if F.group not in ROWS or not F.latest:
        return None
    qs = F.quarters(8)
    years = sorted({yy for yy, mm in F.quarters(12) if F.get(yy, 12, "net") is not None and mm == 12})[-3:]

    def raw(k, y, m, mode):  # mode: 'q' çeyrek, 'y' yıl (12. ay kümülatif)
        if k == "ebitda":
            op, dep = raw("op", y, m, mode), raw("dep", y, m, mode)
            return None if op is None or dep is None else op + abs(dep)
        if k == "fcf":
            c, x = raw("cfo", y, m, mode), raw("capex", y, m, mode)
            return None if c is None or x is None else c + x
        if k == "nd":
            if F.get(y, m, "eq") is None:
                return None
            return (F.get(y, m, "debtS") or 0) + (F.get(y, m, "debtL") or 0) - (F.get(y, m, "cash") or 0) - (F.get(y, m, "fininv") or 0)
        kind = next(r[2] for r in ROWS[F.group] if r[0] == k) if any(r[0] == k for r in ROWS[F.group]) else "f"
        if kind == "b" or k in ("debtS", "debtL", "cash", "fininv", "curA", "curL"):
            return F.get(y, m, k)
        return F.quarter(y, m, k) if mode == "q" else F.get(y, m, k)

    ratio = {
        "gm": ("gross", "rev"), "em": ("ebitda", "rev"), "nm": ("net", "rev"),
        "cr": ("curA", "curL"), "ldr": ("loans", "deposits"),
    }
    rows = []
    for k, label, kind in ROWS[F.group]:
        def val(y, m, mode):
            if kind == "r":
                a, c = ratio[k]
                return _div(raw(a, y, m, mode), raw(c, y, m, mode))
            return raw(k, y, m, mode)
        qv = [val(y, m, "q") for y, m in qs]
        yv = [val(y, 12, "y") for y in years]
        rnd = lambda v: None if v is None else round(v, 4 if kind == "r" else 0)  # noqa: E731
        rows.append([k, label, kind, [rnd(v) for v in qv], [rnd(v) for v in yv]])
    return {"group": F.group, "q": [f"{y}/{m}" for y, m in qs], "y": years, "rows": rows}
