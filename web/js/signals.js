import { destroyCharts } from './detail.js';
import { view } from './dom.js';
import { F1, F2, cls, esc, fmt, ok } from './util.js';

/* ============================================================
   Sinyaller: alım kurulumları (giriş / stop / hedef) ve geriye dönük test sonuçları
   Veri: data/signals.json (veri derlemesi her güncellemede üretir; scripts/signals.py)
   ============================================================ */
let SIG = null, sigFilter = 'all';
export async function loadSignals() {
  if (SIG) return SIG;
  const r = await fetch('data/signals.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  SIG = await r.json();
  return SIG;
}
export const setupName = k => SIG?.setups?.[k]?.name || k;

const rFmt = x => !ok(x) ? '—' : (x > 0 ? '+' : '') + F2.format(x) + 'R';
const pctFrom = (a, b) => ok(a) && ok(b) && b ? (a / b - 1) : null;
const STATUS = {
  pending: ['Yeni', 'up', 'Sinyal bugün oluştu; giriş bir sonraki seansın açılışında (açılış stopun altında ya da girişin 0,5R üstündeyse işlem yapılmaz)'],
  open: ['Pozisyonda', '', 'Ertesi gün açılışta girildi; stop ya da hedef henüz görülmedi'],
  tp: ['Hedef', 'up', 'Hedef fiyata ulaştı'],
  stop: ['Stop', 'down', 'Stop seviyesine indi'],
  time: ['Süre doldu', 'warn', 'En uzun tutma süresi doldu, kapanıştan çıkıldı'],
  skip: ['Açılmadı', '', 'Ertesi gün açılış uygun değildi (stopun altında ya da girişten 0,5R fazla yukarıda)'],
};
const chip = st => { const [l, c, t] = STATUS[st] || [st, '', '']; return `<span class="chip ${c}" title="${esc(t)}">${l}</span>`; };

function ctxChips(a) {
  const out = [];
  if (a.tedbir) out.push('<span class="chip warn" title="Hissede Borsa İstanbul tedbiri var">⚠ Tedbir</span>');
  if (ok(a.supS) && a.supS >= 10 && ok(a.supDist) && a.supDist <= 0.03) out.push('<span class="chip up" title="Fiyat güçlü bir destek bölgesinin (confluence skor ≥ 10) %3 yakınında">Güçlü destek</span>');
  if (ok(a.fScore) && a.fScore >= 7) out.push(`<span class="chip up" title="Piotroski F-skoru">F ${a.fScore}/9</span>`);
  if (ok(a.fScore) && a.fScore <= 3) out.push(`<span class="chip down" title="Piotroski F-skoru zayıf">F ${a.fScore}/9</span>`);
  if (ok(a.dsScore) && a.dsScore >= 70) out.push('<span class="chip up" title="Temettü güvenlik skoru ≥ 70">Güvenli temettü</span>');
  return out.join(' ');
}

function accountHtml(st, S) {
  const a = st.account, A = S.account, b = S.bench;
  if (!a || !A) return '';
  return `<div class="sigacct">
      <b>${fmt.big(A.capital)} ₺ hesapla ne olurdu?</b> İşlem başına sermayenin %${F1.format(A.risk * 100)}'i risk (1R), en fazla ${A.maxPos} pozisyon, kaldıraç yok:
      ${a.years} yılda ${a.taken} işlem, son değer <b class="${cls(a.final - A.capital)}">${fmt.big(a.final)} ₺</b>
      (yıllık <b class="${cls(a.cagr)}">${fmt.pct(a.cagr)}</b>), en büyük düşüş <b class="down">−%${Math.round(a.mdd * 100)}</b>.
      ${b ? `<br><span class="muted">Karşılaştırma: aynı dönemde BIST 100'ü alıp tutmak yıllık ${fmt.pct(b.cagr)}, en büyük düşüş −%${Math.round(b.mdd * 100)}. Hesapta boşta kalan nakit için faiz varsayılmadı.</span>` : ''}
    </div>`;
}
function statsHtml(st, S) {
  if (!st?.n) return '<p class="muted">Test döneminde bu kurulumdan işlem çıkmadı.</p>';
  const years = Object.entries(st.byYear || {});
  return `<div class="sigstats">
      <div><span>İşlem</span><b>${st.n}</b></div>
      <div><span>Hedefe ulaşan</span><b>%${Math.round(st.tp * 100)}</b></div>
      <div><span>Stop olan</span><b>%${Math.round(st.stop * 100)}</b></div>
      <div title="Komisyon ve kayma düşülmüş ortalama sonuç, risk birimi (R) cinsinden"><span>Ort. sonuç</span><b class="${cls(st.avgR)}">${rFmt(st.avgR)}</b></div>
      <div title="Gerçekleşen girişe göre ortalama yüzde getiri (komisyon ve kayma düşülmüş)"><span>İşlem başına ort.</span><b class="${cls(st.avgPct)}">${fmt.pct(st.avgPct)}</b></div>
      <div title="Toplam kazanç / toplam kayıp (R). 1'in üstü kârlı"><span>Kâr faktörü</span><b>${ok(st.pf) ? F2.format(st.pf) : '—'}</b></div>
      <div><span>Ort. süre</span><b>${F1.format(st.bars)} gün</b></div>
    </div>
    ${years.length ? `<div class="sigyearwrap"><table class="grid sigyears"><thead><tr><th class="tk">Yıl</th>${years.map(([y]) => `<th>${y}</th>`).join('')}</tr></thead><tbody>
      <tr><td class="tk">İşlem</td>${years.map(([, d]) => `<td>${d.n}</td>`).join('')}</tr>
      <tr><td class="tk">Ort. sonuç</td>${years.map(([, d]) => `<td class="${cls(d.avgR)}">${rFmt(d.avgR)}</td>`).join('')}</tr>
      <tr><td class="tk">Kazanan</td>${years.map(([, d]) => `<td>%${Math.round(d.win * 100)}</td>`).join('')}</tr>
    </tbody></table></div>` : ''}
    ${accountHtml(st, S)}`;
}

export async function renderSignals() {
  destroyCharts();
  document.title = 'Sinyaller · Tahta';
  view.innerHTML = '<p class="empty">Yükleniyor…</p>';
  let S;
  try { S = await loadSignals(); } catch { view.innerHTML = '<p class="empty">Sinyal verisi henüz yok; bir sonraki güncellemede oluşacak.</p>'; return; }
  if (!location.hash.startsWith('#/sinyal')) return;
  const keys = Object.keys(S.setups);
  const act = S.active.filter(a => sigFilter === 'all' || a.k === sigFilter);
  const rec = S.recent.filter(a => sigFilter === 'all' || a.k === sigFilter);
  const P = S.params;
  view.innerHTML = `
  <section class="dhead"><div><h1>Sinyaller</h1>
    <p class="sub">Gün sonu kapanışına göre alım kurulumları · giriş bir sonraki seansın açılışında · stop ve hedef sabit</p></div></section>
  <p class="note-fx" style="margin:0 0 12px">Kurallar son 4 yılın verisinde, aynı kodla geriye dönük test edildi; sonuçlar her kurulumun altında. Geçmiş başarı geleceği garanti etmez
    (test bugün borsada olan hisselerle yapıldı, kote olmaktan çıkanlar yok). Yatırım tavsiyesi değildir; pozisyon büyüklüğünü 1R kaybı göze alabileceğiniz tutara göre belirleyin.</p>
  <div class="presets" role="group" aria-label="Kurulum" style="margin-bottom:12px">
    <button type="button" data-sigf="all" aria-pressed="${sigFilter === 'all'}">Tümü <span class="n">${S.active.length}</span></button>
    ${keys.map(k => `<button type="button" data-sigf="${k}" aria-pressed="${sigFilter === k}">${esc(S.setups[k].name)} <span class="n">${S.active.filter(a => a.k === k).length}</span></button>`).join('')}
  </div>

  <section class="panel">
    <h2>Aktif sinyaller <span class="muted" style="font-weight:400">· ${act.length}</span></h2>
    ${act.length ? `<div class="tablewrap flat"><table class="grid sigtable"><thead><tr>
      <th class="tk">Hisse</th><th class="txt">Kurulum</th><th>Sinyal</th><th class="txt">Durum</th><th title="Sinyal günü kapanışı (planlanan giriş)">Giriş</th>
      <th>Stop</th><th>Hedef</th><th title="Hedef uzaklığı / stop uzaklığı">R:R</th><th>Son fiyat</th><th title="Pozisyondaysa gerçekleşen girişe göre güncel sonuç">Güncel</th>
      <th class="txt">Bağlam</th><th title="Bu kurulumun geriye dönük testteki ortalama sonucu">Test ort.</th></tr></thead><tbody>
      ${act.map(a => {
        const risk = a.e - a.s, st = S.setups[a.k]?.stats;
        return `<tr data-t="${a.t}"><td class="tk"><a class="code" href="#/h/${a.t}">${a.t}</a></td>
          <td class="txt">${esc(setupName(a.k))}</td><td>${fmt.date(a.d)}</td><td class="txt">${chip(a.st)}</td>
          <td>${fmt.price(a.e)}</td>
          <td>${fmt.price(a.s)} <small class="down">${fmt.pct(pctFrom(a.s, a.e))}</small></td>
          <td>${fmt.price(a.tp)} <small class="up">${fmt.pct(pctFrom(a.tp, a.e))}</small></td>
          <td>${F1.format((a.tp - a.e) / risk)}</td>
          <td>${fmt.price(a.c)}</td>
          <td class="${cls(a.r)}">${a.st === 'open' ? rFmt(a.r) : '—'}</td>
          <td class="txt">${ctxChips(a)}</td>
          <td class="${cls(st?.avgR)}">${rFmt(st?.avgR)}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="muted">Şu an bu filtreye uyan aktif sinyal yok.</p>'}
    <p class="muted" style="font-size:12px;margin:8px 0 0"><b>R</b> = risk birimi: sinyal akşamı belirlenen giriş − stop farkı; pozisyon büyüklüğü buna göre seçilir (ör. 1R = 1.000 ₺ risk ve stop %5 aşağıdaysa 20.000 ₺'lik pozisyon).
      +2R, riske ettiğinizin iki katı kazanç demektir. Ortalama R işlem başınadır; sermayenin getirisi değildir (kurulum kartlarındaki hesap simülasyonuna bakın). ${esc(P.tpRule)}
      Pozisyon en fazla ${P.hold} işlem günü tutulur. Testte gidiş-dönüş %${F1.format(P.cost * 100)} komisyon+kayma düşülür; yalnızca 20 günlük ortalama işlem hacmi
      ${fmt.big(P.minTurnover)} ₺ üstündeki hisseler ve stop mesafesi %${F1.format(P.riskMin * 100)}–%${Math.round(P.riskMax * 100)} arasındaki kurulumlar alınır.</p>
  </section>

  <div class="sigsetups">
    ${keys.filter(k => sigFilter === 'all' || k === sigFilter).map(k => { const u = S.setups[k]; return `<section class="panel">
      <h2>${esc(u.name)}</h2><p class="muted" style="margin:0 0 8px">${esc(u.summary)}</p>${u.trial ? `<p class="note-fx" style="margin:0 0 8px;font-size:12px">${esc(u.trial)}</p>` : ''}
      <ul class="sigrules">${u.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      <h3>Geriye dönük test (son 4 yıl)</h3>${statsHtml(u.stats, S)}</section>`; }).join('')}
  </div>

  <section class="panel">
    <h2>Son 60 günün sonuçlanan sinyalleri <span class="muted" style="font-weight:400">· ${rec.length}</span></h2>
    ${rec.length ? `<div class="tablewrap flat"><table class="grid sigtable"><thead><tr><th class="tk">Hisse</th><th class="txt">Kurulum</th><th>Sinyal</th>
      <th>Giriş</th><th>Stop</th><th>Hedef</th><th class="txt">Sonuç</th><th>Çıkış</th><th>Sonuç (R)</th></tr></thead><tbody>
      ${rec.map(a => `<tr data-t="${a.t}"><td class="tk"><a class="code" href="#/h/${a.t}">${a.t}</a></td><td class="txt">${esc(setupName(a.k))}</td><td>${fmt.date(a.d)}</td>
        <td>${fmt.price(a.f ?? a.e)}</td><td>${fmt.price(a.s)}</td><td>${fmt.price(a.tp)}</td><td class="txt">${chip(a.st)}</td>
        <td>${a.xd ? fmt.date(a.xd) : '—'}</td><td class="${cls(a.r)}">${rFmt(a.r)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Bu filtrede son 60 günde sonuçlanan sinyal yok.</p>'}
    <p class="muted" style="font-size:12px;margin:8px 0 0">Giriş sütunu gerçekleşen açılış fiyatıdır ("Açılmadı" satırlarında planlanan giriş). Bu liste, kuralların son dönemde nasıl çalıştığını görmeniz içindir.</p>
  </section>`;
  view.querySelectorAll('[data-sigf]').forEach(b => b.addEventListener('click', () => { sigFilter = b.dataset.sigf; renderSignals(); }));
}
