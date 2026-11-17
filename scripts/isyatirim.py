"""İş Yatırım'ın herkese açık sayfalarından temel veri.

- Özet tablo (tüm hisseler): ad, sektör, kapanış, piyasa değeri, halka açıklık oranı.
- Mali tablolar (şirket başına): bilanço, gelir tablosu, nakit akışı kalemleri, TL cinsinden.

Oranlar (F/K, PD/DD, FD/FAVÖK...) burada değil, fetch_data.py'de güncel fiyatla hesaplanır.
Sunucuyu yormamak için istekler arasında bekleme yapılır ve sonuçlar önbelleğe alınır.
"""
from __future__ import annotations

import datetime as dt
import html
import http.client
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://www.isyatirim.com.tr"
SUMMARY_URL = BASE + "/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx"
FIN_URL = BASE + "/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

# XI_29: sanayi/ticaret/hizmet şirketleri. UFRS: bankalar ve sigorta şirketleri.
GROUPS = ("XI_29", "UFRS")
# Saklanan kalemler (diğerleri atılır). Gelir tablosu ve nakit akışı kalemleri dönem başından itibaren kümülatiftir.
SCHEMA = 2  # kalem listesi değişince artırılır; eski şemadaki önbellek kayıtları öncelikle yenilenir
KEEP = {
    "XI_29": {
        "3C": "rev",        # Satış gelirleri
        "3D": "gross",      # Brüt kâr
        "3DF": "op",        # Faaliyet kârı
        "3Z": "net",        # Ana ortaklık payı net kâr
        "4B": "dep",        # Amortisman giderleri
        "4C": "cfo",        # İşletme faaliyetlerinden net nakit
        "4CAI": "capex",    # Sabit sermaye yatırımları (negatif)
        "4CBB": "div",      # Temettü ödemeleri (negatif)
        "4CBC": "capInc",   # Nakit sermaye artırımı (bedelli; bedelsiz burada görünmez)
        "1A": "curA",       # Dönen varlıklar
        "1AA": "cash",      # Nakit ve nakit benzerleri
        "1AB": "fininv",    # Kısa vadeli finansal yatırımlar
        "1BL": "assets",    # Toplam varlıklar
        "2A": "curL",       # Kısa vadeli yükümlülükler
        "2AA": "debtS",     # Kısa vadeli finansal borçlar
        "2BA": "debtL",     # Uzun vadeli finansal borçlar
        "2O": "eq",         # Ana ortaklığa ait özkaynaklar
        "2OA": "paidCap",   # Ödenmiş sermaye
    },
    "UFRS": {  # bankalar
        "3C": "nii",        # Net faiz geliri
        "3CA": "fees",      # Net ücret ve komisyon gelirleri
        "3CE": "opInc",     # Faaliyet gelirleri toplamı
        "3CF": "prov",      # Kredi değer düşüş karşılıkları (gider)
        "3Z": "net",        # Net dönem kârı
        "1Z": "assets",     # Aktif toplamı
        "1AF": "loans",     # Krediler
        "2A": "deposits",   # Mevduat
        "2O": "eq",         # Özkaynaklar
        "2OA": "paidCap",   # Ödenmiş sermaye
    },
}


def _get(url: str, timeout: int = 30, tries: int = 3) -> bytes:
    """Yarıda kesilen yanıtlar (IncompleteRead) ve geçici hatalar için birkaç kez dener."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9"})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except (http.client.IncompleteRead, ConnectionError, TimeoutError, urllib.error.URLError):
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))
    raise RuntimeError("erişilemedi")


def _tr_num(s: str):
    s = s.strip().replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def fetch_summary() -> dict[str, dict]:
    """Tüm hisseler için özet: {KOD: {name, sector, close, mcapMn, freeFloat}}."""
    page = _get(SUMMARY_URL, timeout=60).decode("utf-8", "replace")
    i = page.find('id="summaryBasicData"')
    if i < 0:
        raise RuntimeError("özet tablo bulunamadı (sayfa yapısı değişmiş olabilir)")
    table = page[i:page.find("</table>", i)]
    out = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) < 7 or not re.fullmatch(r"[A-Z0-9]{3,6}", cells[0]):
            continue
        out[cells[0]] = {
            "name": cells[1] or None,
            "sector": cells[2] or None,
            "close": _tr_num(cells[3]),
            "mcapMn": _tr_num(cells[4]),
            "freeFloat": (_tr_num(cells[6]) or 0) / 100 if _tr_num(cells[6]) is not None else None,
        }
    if len(out) < 100:
        raise RuntimeError(f"özet tabloda yalnızca {len(out)} hisse bulundu")
    return out


def recent_periods(today: dt.date | None = None, n: int = 12) -> list[tuple[int, int]]:
    """Bugünden önce biten son n çeyrek, en yeniden eskiye: [(2026, 9), (2026, 6), ...]."""
    today = today or dt.date.today()
    y, m = today.year, (today.month - 1) // 3 * 3  # içinde bulunulan çeyrekten önceki çeyrek sonu
    if m == 0:
        y, m = y - 1, 12
    out = []
    for _ in range(n):
        out.append((y, m))
        m -= 3
        if m == 0:
            y, m = y - 1, 12
    return out


def _fetch_group(code: str, group: str, periods: list[tuple[int, int]]) -> dict[str, dict]:
    keep = KEEP[group]
    result: dict[str, dict] = {}
    for chunk in (periods[i:i + 4] for i in range(0, len(periods), 4)):
        if not chunk:
            continue
        q = {"companyCode": code, "exchange": "TRY", "financialGroup": group}
        for k, (y, m) in enumerate(chunk, 1):
            q[f"year{k}"], q[f"period{k}"] = y, m
        d = json.loads(_get(FIN_URL + "?" + urllib.parse.urlencode(q)))
        items = d.get("value") or []
        if not items:
            return {}
        for k, (y, m) in enumerate(chunk, 1):
            vals = {}
            for it in items:
                name = keep.get(it.get("itemCode"))
                v = it.get(f"value{k}")
                if name and v not in (None, ""):
                    try:
                        vals[name] = float(v)
                    except ValueError:
                        pass
            # Raporlanmamış dönemler boş gelir. Bankalarda eski dönemlerin bilançosu 0 gelebilir,
            # gelir tablosu ise dolu olur; bu yüzden herhangi bir kalem doluysa dönemi sakla.
            if any(v != 0 for v in vals.values()):
                result[f"{y}/{m}"] = vals
        time.sleep(0.6)
    return result


def fetch_financials(code: str, group_hint: str | None, periods: list[tuple[int, int]]):
    """(grup, {"2026/9": {...}, ...}) döner; veri yoksa (None, {})."""
    groups = [group_hint] + [g for g in GROUPS if g != group_hint] if group_hint else list(GROUPS)
    for g in groups:
        data = _fetch_group(code, g, periods)
        if data:
            return g, data
    return None, {}


def load(codes: list[str], cache_path, max_age_days: float = 3, max_per_run: int = 150, log=print):
    """Önbellekli yükleme. Döner: (summary, financials) — financials[KOD] = {"group", "periods"}."""
    try:
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        cache = {}
    now = time.time()
    summ = cache.get("summary") or {}
    if now - summ.get("_ts", 0) > 6 * 3600 or not summ.get("data"):
        try:
            summ = {"_ts": now, "data": fetch_summary()}
            cache["summary"] = summ
            log(f"İş Yatırım özet: {len(summ['data'])} hisse.")
        except Exception as e:
            log(f"  İş Yatırım özet alınamadı ({e}); önbellek kullanılacak.")

    fin = cache.setdefault("fin", {})
    periods = recent_periods()
    # codes öncelik sırasıyla gelir (BIST 30 önce); en eski güncellenenler önce, eşitse öncelik sırası
    prio = {c: i for i, c in enumerate(codes)}
    def fresh(c):
        e = fin.get(c, {})
        return e.get("v") == SCHEMA and now - e.get("_ts", 0) <= max_age_days * 86400

    stale = [c for c in codes if not fresh(c)]
    # Önce eski şemadakiler (yeni kalemler eksik), sonra en eski güncellenenler, eşitse öncelik sırası
    stale.sort(key=lambda c: (fin.get(c, {}).get("v") == SCHEMA, fin.get(c, {}).get("_ts", 0), prio[c]))
    done = failed = 0
    for c in stale[:max_per_run]:
        try:
            group, data = fetch_financials(c, fin.get(c, {}).get("group"), periods)
            old = fin.get(c, {}).get("periods", {}) if fin.get(c, {}).get("v") == SCHEMA else {}
            keep = {f"{y}/{m}" for y, m in periods}
            fin[c] = {"_ts": now, "v": SCHEMA, "group": group,
                      "periods": {k: v for k, v in {**old, **data}.items() if k in keep}}
            done += 1
        except Exception as e:
            failed += 1
            log(f"  mali tablo alınamadı {c}: {e}")
            time.sleep(2)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    log(f"İş Yatırım mali tablolar: {done} güncellendi, {failed} başarısız, "
        f"{max(0, len(stale) - done - failed)} sonraki çalışmaya kaldı.")
    return summ.get("data") or {}, fin


def ratios(price: float | None, summ: dict | None, fin: dict | None) -> dict:
    """Güncel fiyat + son mali tablolardan oranlar (son 12 ay)."""
    out = {k: None for k in ("mcap", "pe", "pb", "evEbitda", "netMargin", "opMargin", "roe", "de",
                             "revGrowth", "epsGrowth", "payout", "netDebt", "period", "finGroup")}
    shares = None
    if summ and summ.get("mcapMn") and summ.get("close"):
        shares = summ["mcapMn"] * 1e6 / summ["close"]
    if shares and price:
        out["mcap"] = shares * price
    elif summ and summ.get("mcapMn"):
        out["mcap"] = summ["mcapMn"] * 1e6
    if not fin or not fin.get("periods"):
        return out
    P = fin["periods"]
    out["finGroup"] = fin.get("group")

    def key(p):
        y, m = p.split("/")
        return int(y), int(m)

    latest = max(P, key=key)
    y, m = key(latest)
    L, A, S = P[latest], P.get(f"{y - 1}/12"), P.get(f"{y - 1}/{m}")
    out["period"] = latest

    def ttm(name):
        if L.get(name) is None:
            return None
        if m == 12:
            return L[name]
        if A is None or S is None or A.get(name) is None or S.get(name) is None:
            return None
        return L[name] + A[name] - S[name]

    def yoy(name):
        if S is None or L.get(name) is None or not S.get(name) or S[name] <= 0:
            return None
        return L[name] / S[name] - 1

    mcap, eq, net = out["mcap"], L.get("eq"), ttm("net")
    if mcap and net and net > 0:
        out["pe"] = mcap / net
    if mcap and eq and eq > 0:
        out["pb"] = mcap / eq
    if net is not None and eq and eq > 0:
        out["roe"] = net / eq
    out["epsGrowth"] = yoy("net")

    if fin.get("group") == "XI_29":
        rev, op, dep = ttm("rev"), ttm("op"), ttm("dep")
        debt = (L.get("debtS") or 0) + (L.get("debtL") or 0)
        net_debt = debt - (L.get("cash") or 0) - (L.get("fininv") or 0)
        out["netDebt"] = net_debt
        if rev and rev > 0:
            out["netMargin"] = net / rev if net is not None else None
            out["opMargin"] = op / rev if op is not None else None
        ebitda = op + abs(dep) if op is not None and dep is not None else None
        if mcap and ebitda and ebitda > 0:
            out["evEbitda"] = (mcap + net_debt) / ebitda
        if eq and eq > 0:
            out["de"] = debt / eq
        out["revGrowth"] = yoy("rev")
        div = ttm("div")
        if div is not None and net and net > 0:
            out["payout"] = abs(div) / net  # son 12 ayda ödenen temettü / son 12 ay net kâr
    return out
