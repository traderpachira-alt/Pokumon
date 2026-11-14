import { sma, rsi, macd, bollinger, stochRsi, fisher, supertrend, ichimoku, vwma, atr } from './ind.js';

/* ============================================================
   Biçimlendirme
   ============================================================ */
const nf = (min, max) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: min, maximumFractionDigits: max });
const F0 = nf(0, 0), F1 = nf(1, 1), F2 = nf(2, 2), F4 = nf(2, 4);
const ok = x => x != null && Number.isFinite(x);
const fmt = {
  price: x => !ok(x) ? '—' : Math.abs(x) < 1 ? F4.format(x) : F2.format(x),
  pct: x => !ok(x) ? '—' : (x > 0 ? '+' : '') + F1.format(x * 100) + '%',
  pctPlain: x => !ok(x) ? '—' : F1.format(x * 100) + '%',
  num: x => !ok(x) ? '—' : F1.format(x),
  num2: x => !ok(x) ? '—' : F2.format(x),
  x: x => !ok(x) ? '—' : F2.format(x) + 'x',
  big: x => !ok(x) ? '—' : Math.abs(x) >= 1e9 ? F1.format(x / 1e9) + ' mlr' : Math.abs(x) >= 1e6 ? F1.format(x / 1e6) + ' mn' : F0.format(x),
  vol: x => !ok(x) ? '—' : Math.abs(x) >= 1e9 ? F2.format(x / 1e9) + ' Mr' : Math.abs(x) >= 1e6 ? F1.format(x / 1e6) + ' Mn' : Math.abs(x) >= 1e3 ? F1.format(x / 1e3) + ' B' : F0.format(x),
  date: s => s ? s.split('-').reverse().join('.') : '—',
};
const cls = x => !ok(x) || x === 0 ? '' : x > 0 ? 'up' : 'down';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TREND = { up: ['Yükseliş', 'up'], down: ['Düşüş', 'down'], flat: ['Yatay', ''] };

/* ============================================================
   Alanlar: tablo sütunları ve filtreler aynı tanımı kullanır.
   pct: değer kesir olarak saklanır (0,12 = %12); filtrede kullanıcı yüzde yazar.
   fx: raporlama para birimi farklıysa güvenilmez olabilecek oran.
   ============================================================ */
const FIELDS = {
  last:      { label: 'Fiyat',            f: fmt.price },
  chg1d:     { label: 'Gün',              f: fmt.pct, pct: 1, color: 1 },
  chg1w:     { label: '1H',               f: fmt.pct, pct: 1, color: 1 },
  chg1m:     { label: '1A',               f: fmt.pct, pct: 1, color: 1 },
  chg3m:     { label: '3A',               f: fmt.pct, pct: 1, color: 1 },
  chg6m:     { label: '6A',               f: fmt.pct, pct: 1, color: 1 },
  chg1y:     { label: '1Y',               f: fmt.pct, pct: 1, color: 1 },
  ytd:       { label: 'YB',               f: fmt.pct, pct: 1, color: 1, title: 'Yılbaşından beri' },
  turnover:  { label: 'İşlem hacmi ₺',    f: fmt.vol, title: 'Son 20 günün ortalama günlük işlem hacmi (TL)' },
  volRatio:  { label: 'Hacim/Ort.',       f: fmt.x, title: 'Son gün hacmi / önceki 20 gün ortalaması' },
  rsi:       { label: 'RSI 14',           f: fmt.num },
  macdPct:   { label: 'MACD hist.',       f: x => !ok(x) ? '—' : (x > 0 ? '+' : '') + F2.format(x * 100) + '%', pct: 1, color: 1, title: 'MACD histogramı / fiyat' },
  vsSma20:   { label: 'SMA20 farkı',      f: fmt.pct, pct: 1, color: 1 },
  vsSma50:   { label: 'SMA50 farkı',      f: fmt.pct, pct: 1, color: 1 },
  vsSma200:  { label: 'SMA200 farkı',     f: fmt.pct, pct: 1, color: 1 },
  distHi52:  { label: '52H zirveye',      f: fmt.pct, pct: 1, color: 1 },
  distLo52:  { label: '52H dibe',         f: fmt.pct, pct: 1, color: 1 },
  volat:     { label: 'Volatilite',       f: fmt.pctPlain, pct: 1, title: 'Yıllıklandırılmış, son 3 ay' },
  beta:      { label: 'Beta',             f: fmt.num2, title: 'BIST 100\'e göre, son 1 yıl' },
  rs3m:      { label: 'Göreli güç 3A',    f: fmt.pct, pct: 1, color: 1, title: '3 aylık getiri − BIST 100 3 aylık getirisi' },
  mcap:      { label: 'Piyasa değeri ₺',  f: fmt.big },
  pe:        { label: 'F/K',              f: fmt.num, title: 'Piyasa değeri / son 12 ay net kâr (zarardaysa boş)' },
  pb:        { label: 'PD/DD',            f: fmt.num2 },
  evEbitda:  { label: 'FD/FAVÖK',         f: fmt.num, title: '(Piyasa değeri + net borç) / son 12 ay FAVÖK' },
  netMargin: { label: 'Net marj',         f: fmt.pctPlain, pct: 1, color: 1 },
  opMargin:  { label: 'Faaliyet marjı',   f: fmt.pctPlain, pct: 1, color: 1 },
  roe:       { label: 'ÖK kârlılığı',     f: fmt.pctPlain, pct: 1, color: 1, title: 'Özkaynak kârlılığı (ROE)' },
  de:        { label: 'Borç/ÖK',          f: fmt.x },
  freeFloat: { label: 'Halka açıklık',    f: fmt.pctPlain, pct: 1 },
  revGrowth: { label: 'Satış büyümesi',   f: fmt.pct, pct: 1, color: 1, title: 'Yılbaşından bu yana, geçen yılın aynı dönemine göre' },
  epsGrowth: { label: 'Kâr büyümesi',     f: fmt.pct, pct: 1, color: 1, title: 'Yılbaşından bu yana, geçen yılın aynı dönemine göre' },
  divYield:  { label: 'Temettü verimi',   f: fmt.pctPlain, pct: 1 },
  stochK:    { label: 'Stoch RSI',        f: fmt.num, title: 'Stokastik RSI %K (14, 14, 3, 3)' },
  fisher:    { label: 'Fisher',           f: fmt.num2, color: 1, title: 'Ehlers Fisher dönüşümü (9)' },
  atrPct:    { label: 'ATR %',            f: fmt.pctPlain, pct: 1, title: 'ATR 14 / fiyat: günlük ortalama oynaklık' },
  stDist:    { label: 'Supertrend farkı', f: fmt.pct, pct: 1, color: 1, title: 'Fiyatın Supertrend (10, 3) çizgisine uzaklığı' },
  vsVwma20:  { label: 'VWMA20 farkı',     f: fmt.pct, pct: 1, color: 1, title: 'Fiyatın 20 günlük hacim ağırlıklı ortalamaya uzaklığı' },
};
const VIEWS = {
  fiyat:    { label: 'Fiyat',    cols: ['_idx', 'last', 'chg1d', 'chg1w', 'chg1m', 'chg3m', 'chg1y', 'ytd', 'turnover', 'volRatio', 'mcap'] },
  trend:    { label: 'Trend',    cols: ['_idx', 'last', 'chg1d', '_trend', '_st', '_ichi', '_cross', 'vsSma50', 'vsSma200', 'vsVwma20', 'stDist', 'distHi52', 'rs3m'] },
  momentum: { label: 'Momentum', cols: ['_idx', 'last', 'chg1d', 'rsi', 'stochK', 'macdPct', 'fisher', '_cross', 'volRatio', 'atrPct', 'volat', 'beta'] },
  temel:    { label: 'Temel',    cols: ['_idx', 'last', 'mcap', 'pe', 'pb', 'evEbitda', 'netMargin', 'roe', 'de', 'revGrowth', 'epsGrowth', 'divYield', 'freeFloat', '_sector'] },
};
const ST = { up: ['Al', 'up'], down: ['Sat', 'down'] };
const ICHI = { above: ['Bulut üstü', 'up'], below: ['Bulut altı', 'down'], in: ['Bulut içi', ''] };
/* Endeks katmanı: her hisse yer aldığı en dar endeksle etiketlenir (BIST 30 ⊂ 50 ⊂ 100 ⊂ TÜM). */
const TIER_RANK = { '30': 0, '50': 1, '100': 2, 'TÜM': 3 };
const tierRank = s => TIER_RANK[s.idx] ?? 4;
const MKT_RANK = { 'Yıldız': 0, 'Ana': 1, 'Alt': 2, 'YİP': 3, 'GSP': 4, 'PÖİP': 5 };
const MKT_NAME = { 'Yıldız': 'Yıldız Pazar', 'Ana': 'Ana Pazar', 'Alt': 'Alt Pazar', 'YİP': 'Yakın İzleme Pazarı', 'GSP': 'Girişim Sermayesi Pazarı', 'PÖİP': 'Piyasa Öncesi İşlem Platformu' };
const tierChip = s => {
  const ix = s.idx ? `<span class="ix ix${tierRank(s)}">${s.idx === 'TÜM' ? 'TÜM' : 'BIST ' + s.idx}</span>` : '<span class="ix ix4">Endeks dışı</span>';
  const mk = s.mkt ? `<span class="mk${s.mkt === 'YİP' ? ' risk' : ''}" title="${MKT_NAME[s.mkt] || s.mkt}">${s.mkt}</span>` : '';
  return `<span class="ixmk">${ix}${mk}</span>`;
};
const TEXTCOLS = {
  _idx:    { label: 'Endeks · Pazar', sortKey: s => tierRank(s) * 10 + (MKT_RANK[s.mkt] ?? 9), cell: tierChip, title: 'Hissenin yer aldığı en dar endeks ve işlem gördüğü pazar' },
  _trend:  { label: 'Trend',  sortKey: s => ({ up: 2, flat: 1, down: 0 })[s.trend] ?? null,
             cell: s => s.trend ? `<span class="chip ${TREND[s.trend][1]}">${TREND[s.trend][0]}</span>` : '—' },
  _st:     { label: 'Supertrend', sortKey: s => s.stTrend ? (s.stTrend === 'up' ? 2 : 0) + (s.stFlip ? 1 : 0) : null,
             cell: s => s.stTrend ? `<span class="chip ${ST[s.stTrend][1]}">${ST[s.stTrend][0]}${s.stFlip ? ' · yeni' : ''}</span>` : '—',
             title: 'Supertrend (10, 3) yönü; "yeni" = son 3 günde döndü' },
  _ichi:   { label: 'Ichimoku', sortKey: s => ({ above: 2, in: 1, below: 0 })[s.ichi] ?? null,
             cell: s => s.ichi ? `<span class="chip ${ICHI[s.ichi][1]}">${ICHI[s.ichi][0]}</span>` : '—',
             title: 'Fiyatın Ichimoku bulutuna (9, 26, 52) göre konumu' },
  _cross:  { label: 'Sinyal', sortKey: s => signalScore(s),
             cell: s => signalChips(s) || '<span class="muted">—</span>', title: 'Son günlerdeki kesişim sinyalleri' },
  _sector: { label: 'Sektör', sortKey: s => s.sector || '', cell: s => esc(s.sector || '—') },
};
const val = (s, k) => (k in TEXTCOLS ? TEXTCOLS[k].sortKey(s) : s[k]);

/* Tedbir: üçgen içinde ünlem; üzerine gelince ya da dokununca açılır pencerede tedbirler */
const WARN_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1.5 15 14H1z" fill="currentColor"/><path d="M8 6v3.6" stroke="var(--surface)" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="11.7" r=".95" fill="var(--surface)"/></svg>';
const tedbirIcon = s => s.tedbir?.length
  ? `<button type="button" class="tedbir" data-tedbir="${s.t}" aria-label="${s.t}: ${s.tedbir.length} tedbir uygulanıyor" aria-haspopup="dialog">${WARN_SVG}</button>` : '';
function tedbirHtml(t) {
  const s = BY.get(t);
  if (!s?.tedbir?.length) return '';
  return `<b>${t} · uygulanan tedbirler</b><ul>${s.tedbir.map(m => `<li><span>${esc(m.type)}</span><small>${m.from ? fmt.date(m.from) : '?'} – ${m.to ? fmt.date(m.to) : 'süresiz'}${m.note ? ' · ' + esc(m.note) : ''}</small></li>`).join('')}</ul>`;
}
const pop = document.createElement('div');
pop.className = 'pop'; pop.setAttribute('role', 'dialog'); pop.hidden = true;
document.body.appendChild(pop);
let popFor = null, popAt = 0;
function showPop(btn) {
  const html = tedbirHtml(btn.dataset.tedbir);
  if (!html) return;
  pop.innerHTML = html; pop.hidden = false; popFor = btn; popAt = performance.now();
  const r = btn.getBoundingClientRect(), w = pop.offsetWidth;
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  const below = r.bottom + 8 + pop.offsetHeight < innerHeight;
  pop.style.top = (below ? r.bottom + 8 : r.top - pop.offsetHeight - 8) + 'px';
}
function hidePop() { pop.hidden = true; popFor = null; }
// Fareli cihazlarda üzerine gelince aç/kapat; dokunmatikte yalnızca dokunma (tarayıcının ürettiği sahte fare olayları yok sayılır)
document.addEventListener('mouseover', e => {
  if (!matchMedia('(hover: hover)').matches) return;
  const b = e.target.closest?.('.tedbir');
  if (b) showPop(b);
  else if (popFor && !e.target.closest?.('.pop')) hidePop();
});
document.addEventListener('click', e => {
  const b = e.target.closest?.('.tedbir');
  if (b) { e.preventDefault(); e.stopPropagation(); popFor === b && !pop.hidden ? hidePop() : showPop(b); return; }
  if (!e.target.closest?.('.pop')) hidePop();
}, true);
// Açıldıktan hemen sonraki kaydırma (dokunma öncesi kaydırma, atalet) pencereyi kapatmasın
addEventListener('scroll', () => { if (!pop.hidden && performance.now() - popAt > 400) hidePop(); }, true);
addEventListener('keydown', e => { if (e.key === 'Escape') hidePop(); });

function signalChips(s) {
  const out = [];
  if (s.cross === 'golden') out.push('<span class="chip up">Golden cross</span>');
  if (s.cross === 'death') out.push('<span class="chip down">Death cross</span>');
  if (s.macdCross === 'up') out.push('<span class="chip up">MACD al</span>');
  if (s.macdCross === 'down') out.push('<span class="chip down">MACD sat</span>');
  if (s.stFlip === 'up') out.push('<span class="chip up">Supertrend al</span>');
  if (s.stFlip === 'down') out.push('<span class="chip down">Supertrend sat</span>');
  if (s.fisherCross === 'up') out.push('<span class="chip up">Fisher al</span>');
  if (s.fisherCross === 'down') out.push('<span class="chip down">Fisher sat</span>');
  if (s.stochCross === 'up' && s.stochK < 30) out.push('<span class="chip up">Stoch RSI al</span>');
  if (s.stochCross === 'down' && s.stochK > 70) out.push('<span class="chip down">Stoch RSI sat</span>');
  if (s.tkCross === 'up') out.push('<span class="chip up">Tenkan/Kijun al</span>');
  if (s.tkCross === 'down') out.push('<span class="chip down">Tenkan/Kijun sat</span>');
  return out.join(' ');
}
function signalScore(s) {
  const v = x => x === 'up' || x === 'golden' ? 1 : x === 'down' || x === 'death' ? -1 : 0;
  return 2 * v(s.cross) + v(s.macdCross) + v(s.stFlip) + v(s.fisherCross) + v(s.tkCross)
    + (s.stochCross === 'up' && s.stochK < 30 ? 1 : 0) - (s.stochCross === 'down' && s.stochK > 70 ? 1 : 0);
}

/* Hazır taramalar */
const PRESETS = [
  { id: 'all',      label: 'Tümü',             test: () => true },
  { id: 'watch',    label: '★ İzleme listem',  test: s => state.watch.includes(s.t) },
  { id: 'oversold', label: 'Aşırı satım',      test: s => s.rsi < 30,  hint: 'RSI < 30', sort: ['rsi', 1] },
  { id: 'overbought', label: 'Aşırı alım',     test: s => s.rsi > 70,  hint: 'RSI > 70', sort: ['rsi', -1] },
  { id: 'uptrend',  label: 'Güçlü trend',      test: s => s.trend === 'up', hint: 'Fiyat > SMA50 > SMA200', sort: ['rs3m', -1] },
  { id: 'golden',   label: 'Golden cross',     test: s => s.cross === 'golden', hint: 'Son 10 günde SMA50, SMA200\'ü yukarı kesti' },
  { id: 'macdUp',   label: 'MACD al',          test: s => s.macdCross === 'up', hint: 'Son 3 günde MACD sinyal çizgisini yukarı kesti' },
  { id: 'stUp',     label: 'Supertrend al',    test: s => s.stFlip === 'up', hint: 'Son 3 günde Supertrend (10, 3) yukarı döndü', sort: ['turnover', -1] },
  { id: 'fisherUp', label: 'Fisher al',        test: s => s.fisherCross === 'up' && s.fisher < 0, hint: 'Son 2 günde Fisher, tetik çizgisini sıfırın altında yukarı kesti', sort: ['fisher', 1] },
  { id: 'stochLow', label: 'Stoch RSI dipte',  test: s => s.stochK < 20, hint: 'Stokastik RSI %K < 20', sort: ['stochK', 1] },
  { id: 'cloudUp',  label: 'Bulut üstünde',    test: s => s.ichi === 'above' && s.tkCross !== 'down', hint: 'Fiyat Ichimoku bulutunun üstünde', sort: ['rs3m', -1] },
  { id: 'high52',   label: '52H zirvesinde',   test: s => s.distHi52 > -0.03, hint: '52 haftalık zirveye %3\'ten yakın', sort: ['distHi52', -1] },
  { id: 'volspike', label: 'Hacim patlaması',  test: s => s.volRatio >= 2, hint: 'Hacim, 20 günlük ortalamanın 2 katı', sort: ['volRatio', -1] },
  { id: 'tedbir',   label: '⚠ Tedbirli',       test: s => !!s.tedbir?.length, hint: 'Borsa İstanbul tedbiri uygulanan hisseler' },
  { id: 'value',    label: 'Ucuz',             test: s => s.pe > 0 && s.pe < 8 && s.pb > 0 && s.pb < 1.5, hint: 'F/K < 8 ve PD/DD < 1,5', sort: ['pe', 1] },
  { id: 'quality',  label: 'Kârlı büyüme',     test: s => s.roe > 0.25 && s.netMargin > 0.1 && s.revGrowth > 0, hint: 'ÖK kârlılığı > %25, net marj > %10, satış büyüyor', sort: ['roe', -1] },
];
const OPS = { '>': (a, b) => a > b, '<': (a, b) => a < b };

/* ============================================================
   Durum (tarayıcıda saklanır)
   ============================================================ */
const KEY = 'tahta:v1';
const state = Object.assign({
  view: 'fiyat', sort: { key: 'turnover', dir: -1 }, preset: 'all', sector: '', index: '', market: '', hideTedbir: false, filters: [], watch: [], saved: [],
  compare: ['XU100'],
  chart: { range: '6A', sma20: false, sma50: true, sma200: true, bb: false, vwma: false, ichi: false, st: false,
           rsi: true, stoch: false, macd: true, fisher: false, atr: false },
}, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })());
if (!VIEWS[state.view]) state.view = 'trend'; // eski sürümdeki 'teknik' görünümü
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* özel pencere vb. */ } };

let DATA = null, BY = new Map(), MEDIANS = {};
const HIST = new Map();
const $ = s => document.querySelector(s);
const view = $('#view');

/* ============================================================
   Veri yükleme
   ============================================================ */
async function loadSummary() {
  const r = await fetch('data/summary.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  DATA = await r.json();
  BY = new Map(DATA.stocks.map(s => [s.t, s]));
  MEDIANS = sectorMedians(DATA.stocks);
  $('#tickerList').innerHTML = DATA.stocks.map(s => `<option value="${s.t}">${esc(s.name || '')}</option>`).join('');
  const ix = DATA.index;
  $('#idx').innerHTML = ix ? `<a href="#/h/XU100" class="muted" style="text-decoration:none">BIST 100</a> <b class="num">${F2.format(ix.last)}</b> <span class="num ${cls(ix.chg1d)}">${fmt.pct(ix.chg1d)}</span>` : '';
  const upd = new Date(DATA.updated);
  $('#stamp').textContent = `Son veri: ${fmt.date(DATA.lastDate)} · güncellendi ${upd.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`;
  const banner = $('#banner');
  const ageDays = (Date.now() - new Date(DATA.lastDate + 'T18:00:00+03:00')) / 864e5;
  if (DATA.sample) { banner.textContent = 'ÖRNEK VERİ: Bu sayılar rastgele üretildi, gerçek piyasa verisi değildir. Yalnızca arayüzü denemek içindir.'; banner.hidden = false; }
  else if (ageDays > 4) { banner.textContent = `Veri ${fmt.date(DATA.lastDate)} tarihli. Otomatik güncelleme aksamış olabilir (GitHub Actions'ı kontrol edin).`; banner.hidden = false; }
}
async function loadHist(t) {
  if (HIST.has(t)) return HIST.get(t);
  const r = await fetch(`data/hist/${encodeURIComponent(t)}.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  const h = await r.json();
  HIST.set(t, h);
  return h;
}
function median(a) {
  const v = a.filter(ok).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
function sectorMedians(stocks) {
  const by = {};
  for (const s of stocks) (by[s.sector || '—'] ||= []).push(s);
  const out = {};
  for (const [sec, list] of Object.entries(by)) {
    out[sec] = { n: list.length };
    for (const k of ['pe', 'pb', 'evEbitda', 'netMargin', 'roe', 'de', 'revGrowth', 'epsGrowth', 'divYield', 'freeFloat', 'mcap'])
      out[sec][k] = median(list.filter(s => !((k === 'pe' || k === 'evEbitda') && s[k] <= 0)).map(s => s[k]));
  }
  return out;
}

/* ============================================================
   Tarama ekranı
   ============================================================ */
function filtered() {
  const preset = PRESETS.find(p => p.id === state.preset) || PRESETS[0];
  return DATA.stocks.filter(s =>
    preset.test(s) &&
    (!state.sector || s.sector === state.sector) &&
    (!state.index || tierRank(s) <= TIER_RANK[state.index]) &&
    (!state.market || s.mkt === state.market) &&
    (!state.hideTedbir || !s.tedbir?.length || state.preset === 'tedbir') &&
    state.filters.every(f => {
      const v = s[f.key], fd = FIELDS[f.key];
      if (f.value === '' || f.value == null) return true;
      if (!ok(v)) return false;
      const target = parseFloat(String(f.value).replace(',', '.')) / (fd.pct ? 100 : 1);
      return Number.isFinite(target) ? OPS[f.op](v, target) : true;
    }));
}
function sorted(list) {
  const { key, dir } = state.sort;
  return [...list].sort((a, b) => {
    const x = val(a, key), y = val(b, key);
    const nx = x == null || x === '' || (typeof x === 'number' && !Number.isFinite(x));
    const ny = y == null || y === '' || (typeof y === 'number' && !Number.isFinite(y));
    if (nx || ny) return nx - ny; // boşlar hep sonda
    if (typeof x === 'string') return x.localeCompare(y, 'tr') * dir;
    return (x - y) * dir;
  });
}

function cellHtml(s, k) {
  if (k in TEXTCOLS) return `<td class="txt">${TEXTCOLS[k].cell(s)}</td>`;
  const fd = FIELDS[k], v = s[k];
  return `<td class="${fd.color ? cls(v) : ''}">${fd.f(v)}</td>`;
}
function tableHtml(rows, cols, { sortable = true, highlight = null } = {}) {
  const th = k => {
    const def = FIELDS[k] || TEXTCOLS[k];
    const sort = state.sort.key === k ? (state.sort.dir > 0 ? 'ascending' : 'descending') : null;
    const inner = sortable ? `<button type="button" data-sort="${k}">${esc(def.label)}</button>` : esc(def.label);
    return `<th${sort && sortable ? ` aria-sort="${sort}"` : ''}${def.title ? ` title="${esc(def.title)}"` : ''}>${inner}</th>`;
  };
  const head = `<tr><th class="tk">${sortable ? '<button type="button" data-sort="t">Hisse</button>' : 'Hisse'}</th>${cols.map(th).join('')}</tr>`;
  const body = rows.map(s => {
    const starred = state.watch.includes(s.t);
    return `<tr data-t="${s.t}"${s.t === highlight ? ' style="font-weight:600"' : ''}>
      <td class="tk"><button type="button" class="star" data-star="${s.t}" aria-pressed="${starred}" aria-label="${s.t} izleme listesi">★</button><span class="code" title="${esc(s.name || '')}">${s.t}</span>${tedbirIcon(s)}</td>
      ${cols.map(k => cellHtml(s, k)).join('')}</tr>`;
  }).join('');
  return `<table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/* Kayıtlı taramalar: hazır tarama + endeks + sektör + filtreler + görünüm + sıralama */
let savingOpen = false;
const screenOf = () => ({ preset: state.preset, index: state.index, market: state.market, sector: state.sector, view: state.view,
  sort: { ...state.sort }, filters: state.filters.filter(f => f.value !== '').map(f => ({ ...f })) });
const sameScreen = sv => {
  const c = screenOf();
  return c.preset === sv.preset && c.index === sv.index && (c.market || '') === (sv.market || '') && c.sector === sv.sector && JSON.stringify(c.filters) === JSON.stringify(sv.filters);
};
function describeScreen(sv) {
  const p = [];
  if (sv.preset && sv.preset !== 'all') p.push(PRESETS.find(x => x.id === sv.preset)?.label);
  if (sv.index) p.push('BIST ' + sv.index);
  if (sv.market) p.push(MKT_NAME[sv.market] || sv.market);
  if (sv.sector) p.push(sv.sector);
  for (const f of sv.filters || []) p.push(`${FIELDS[f.key]?.label} ${f.op} ${f.value}${FIELDS[f.key]?.pct ? '%' : ''}`);
  return p.join(' · ') || 'Tüm hisseler';
}

function renderScreener() {
  destroyCharts();
  document.title = 'Tahta';
  const sectors = [...new Set(DATA.stocks.map(s => s.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const numericKeys = Object.keys(FIELDS);
  const counts = Object.fromEntries(PRESETS.map(p => [p.id, DATA.stocks.filter(p.test).length]));
  const rows = sorted(filtered());
  const cols = VIEWS[state.view].cols;
  const preset = PRESETS.find(p => p.id === state.preset);

  view.innerHTML = `
  <section class="toolbar">
    <div class="presets" role="group" aria-label="Hazır taramalar">
      ${PRESETS.map(p => `<button type="button" data-preset="${p.id}" aria-pressed="${state.preset === p.id}" title="${esc(p.hint || '')}">${esc(p.label)}<span class="n">${counts[p.id]}</span></button>`).join('')}
    </div>
    <div class="saved" role="group" aria-label="Kayıtlı taramalar">
      ${state.saved.map((sv, i) => `<span class="svchip${sameScreen(sv) ? ' on' : ''}"><button type="button" data-load="${i}" title="${esc(describeScreen(sv))}">${esc(sv.name)}</button><button type="button" class="x" data-unsave="${i}" aria-label="${esc(sv.name)} taramasını sil">×</button></span>`).join('')}
      ${savingOpen
        ? `<form id="saveForm" class="saveform"><label class="sr" for="saveName">Tarama adı</label><input id="saveName" maxlength="40" placeholder="Tarama adı, ör. Dipteki BIST 100" required><button class="btn">Kaydet</button><button type="button" class="btn" data-cancelsave="1">İptal</button></form>`
        : `<button type="button" class="btn ghost" id="saveBtn">☆ Bu taramayı kaydet</button>`}
    </div>
    <div class="controls">
      <div class="seg" role="group" aria-label="Sütun grubu">
        ${Object.entries(VIEWS).map(([id, v]) => `<button type="button" data-view="${id}" aria-pressed="${state.view === id}">${v.label}</button>`).join('')}
      </div>
      <label class="sr" for="indexSel">Endeks</label>
      <select id="indexSel" class="btn">${[['', 'Tüm hisseler'], ['30', 'BIST 30'], ['50', 'BIST 50'], ['100', 'BIST 100']].map(([v, l]) => `<option value="${v}"${v === state.index ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <label class="sr" for="marketSel">Pazar</label>
      <select id="marketSel" class="btn">${[['', 'Tüm pazarlar'], ['Yıldız', 'Yıldız Pazar'], ['Ana', 'Ana Pazar'], ['Alt', 'Alt Pazar'], ['YİP', 'Yakın İzleme Pazarı']].map(([v, l]) => `<option value="${v}"${v === state.market ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <label class="sr" for="sector">Sektör</label>
      <select id="sector" class="btn"><option value="">Tüm sektörler</option>${sectors.map(s => `<option${s === state.sector ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <label class="btn chk"><input type="checkbox" id="hideTedbir"${state.hideTedbir ? ' checked' : ''}> Tedbirlileri gizle</label>
      <button type="button" class="btn" id="addFilter">+ Filtre ekle</button>
      <span class="count"><b class="num">${rows.length}</b> / ${DATA.stocks.length} hisse${preset?.hint ? ` · ${esc(preset.hint)}` : ''}</span>
    </div>
    <div class="filters" id="filters">
      ${state.filters.map((f, i) => `
        <div class="frow" data-i="${i}">
          <select data-f="key" aria-label="Alan">${numericKeys.map(k => `<option value="${k}"${k === f.key ? ' selected' : ''}>${esc(FIELDS[k].label)}</option>`).join('')}</select>
          <select data-f="op" aria-label="Koşul"><option value=">"${f.op === '>' ? ' selected' : ''}>büyüktür</option><option value="<"${f.op === '<' ? ' selected' : ''}>küçüktür</option></select>
          <input data-f="value" inputmode="decimal" value="${esc(f.value)}" aria-label="Değer" placeholder="değer">
          <span class="unit">${FIELDS[f.key]?.pct ? '%' : ''}</span>
          <button type="button" class="x" data-remove="${i}" aria-label="Filtreyi kaldır">×</button>
        </div>`).join('')}
    </div>
  </section>
  <div class="tablewrap">${rows.length ? tableHtml(rows, cols) : '<p class="empty">Bu koşullara uyan hisse yok.</p>'}</div>`;
}

/* ============================================================
   Hisse detayı
   ============================================================ */
let charts = [];
function destroyCharts() { charts.forEach(c => c.remove()); charts = []; }
const RANGES = { '1A': 1, '3A': 3, '6A': 6, '1Y': 12, '2Y': 24 };
// Ana grafik katmanları: [anahtar, etiket, renk değişkeni]
const OVERLAYS = [
  ['sma20', 'SMA20', '--c-sma20'], ['sma50', 'SMA50', '--c-sma50'], ['sma200', 'SMA200', '--c-sma200'],
  ['vwma', 'VWMA20', '--c-vwma'], ['bb', 'Bollinger', '--c-bb'], ['ichi', 'Ichimoku', '--c-ichi'], ['st', 'Supertrend', '--up'],
];
// Alt paneller: [anahtar, düğme etiketi, panel başlığı]
const PANES = [
  ['rsi', 'RSI', 'RSI 14'], ['stoch', 'Stoch RSI', 'Stoch RSI 14, 14, 3, 3'], ['macd', 'MACD', 'MACD 12, 26, 9'],
  ['fisher', 'Fisher', 'Fisher 9'], ['atr', 'ATR', 'ATR 14'],
];

async function renderDetail(t) {
  destroyCharts();
  const s = BY.get(t) || (t === 'XU100' ? DATA.index : null);
  if (!s) { view.innerHTML = `<p class="empty">"${esc(t)}" bulunamadı. <a href="#/">Taramaya dön</a></p>`; return; }
  document.title = `${t} · Tahta`;
  const isIdx = t === 'XU100';
  const starred = state.watch.includes(t);
  const med = MEDIANS[s.sector || '—'] || {};
  const peers = isIdx ? [] : DATA.stocks.filter(p => p.sector && p.sector === s.sector);

  const rets = [['Gün', 'chg1d'], ['1 hafta', 'chg1w'], ['1 ay', 'chg1m'], ['3 ay', 'chg3m'], ['6 ay', 'chg6m'], ['1 yıl', 'chg1y'], ['Yılbaşı', 'ytd'], ['BIST\'e göre 3A', 'rs3m']];
  const pos52 = ok(s.hi52) && ok(s.lo52) && s.hi52 > s.lo52 ? (s.last - s.lo52) / (s.hi52 - s.lo52) * 100 : null;

  const tech = [
    ['RSI 14', fmt.num(s.rsi), s.rsi < 30 ? '<span class="chip up">Aşırı satım</span>' : s.rsi > 70 ? '<span class="chip down">Aşırı alım</span>' : '<span class="chip">Nötr</span>'],
    ['MACD', FIELDS.macdPct.f(s.macdPct), s.macdCross === 'up' ? '<span class="chip up">Al kesişimi</span>' : s.macdCross === 'down' ? '<span class="chip down">Sat kesişimi</span>' : ok(s.macdPct) ? `<span class="chip ${s.macdPct > 0 ? 'up' : 'down'}">${s.macdPct > 0 ? 'Pozitif' : 'Negatif'}</span>` : ''],
    ['Trend', '', s.trend ? `<span class="chip ${TREND[s.trend][1]}">${TREND[s.trend][0]}</span>` : '—'],
    ['SMA50 / SMA200', '', s.cross === 'golden' ? '<span class="chip up">Golden cross</span>' : s.cross === 'death' ? '<span class="chip down">Death cross</span>' : '<span class="muted">Yeni kesişim yok</span>'],
    ['SMA20 farkı', `<span class="${cls(s.vsSma20)}">${fmt.pct(s.vsSma20)}</span>`, ''],
    ['SMA50 farkı', `<span class="${cls(s.vsSma50)}">${fmt.pct(s.vsSma50)}</span>`, ''],
    ['SMA200 farkı', `<span class="${cls(s.vsSma200)}">${fmt.pct(s.vsSma200)}</span>`, ''],
    ['Hacim / 20g ort.', fmt.x(s.volRatio), s.volRatio >= 2 ? '<span class="chip warn">Hacim patlaması</span>' : ''],
    ['Ort. işlem hacmi', fmt.vol(s.turnover) + ' ₺', ''],
    ['Volatilite (yıllık)', fmt.pctPlain(s.volat), ''],
    ['Beta', fmt.num2(s.beta), ''],
    ['Stoch RSI %K', fmt.num(s.stochK), s.stochK < 20 ? '<span class="chip up">Dipte</span>' : s.stochK > 80 ? '<span class="chip down">Tepede</span>' : ''],
    ['Fisher', fmt.num2(s.fisher), s.fisherCross === 'up' ? '<span class="chip up">Al kesişimi</span>' : s.fisherCross === 'down' ? '<span class="chip down">Sat kesişimi</span>' : ''],
    ['Supertrend', `<span class="${cls(s.stDist)}">${fmt.pct(s.stDist)}</span>`, s.stTrend ? `<span class="chip ${ST[s.stTrend][1]}">${ST[s.stTrend][0]}${s.stFlip ? ' · yeni' : ''}</span>` : ''],
    ['Ichimoku', '', s.ichi ? `<span class="chip ${ICHI[s.ichi][1]}">${ICHI[s.ichi][0]}</span>` : '—'],
    ['VWMA20 farkı', `<span class="${cls(s.vsVwma20)}">${fmt.pct(s.vsVwma20)}</span>`, ''],
    ['ATR 14', fmt.pctPlain(s.atrPct), ok(s.atrPct) && ok(s.last) ? `<span class="muted num">≈ ${fmt.price(s.atrPct * s.last)} ₺</span>` : ''],
  ];
  const fundRows = [
    ['Piyasa değeri', 'mcap', x => fmt.big(x) + ' ₺'], ['F/K', 'pe'], ['PD/DD', 'pb'], ['FD/FAVÖK', 'evEbitda'],
    ['Net marj', 'netMargin'], ['ÖK kârlılığı', 'roe'], ['Borç / ÖK', 'de'], ['Satış büyümesi', 'revGrowth'], ['Kâr büyümesi', 'epsGrowth'], ['Temettü verimi', 'divYield'], ['Halka açıklık', 'freeFloat'],
  ];

  view.innerHTML = `
  <section class="dhead">
    <a class="back" href="#/">← Tarama</a>
    <div>
      <h1>${isIdx ? '' : `<button type="button" class="star" data-star="${t}" aria-pressed="${starred}" aria-label="İzleme listesi">★</button>`}${esc(t)}${tedbirIcon(s)}</h1>
      <p class="sub">${isIdx ? '' : tierChip(s) + ' '}${esc(s.name || '')}${s.sector ? ' · ' + esc(s.sector) : ''}${s.industry ? ' · ' + esc(s.industry) : ''}</p>
    </div>
    <div class="px"><span class="price">${fmt.price(s.last)}${isIdx ? '' : ' ₺'}</span><span class="chg ${cls(s.chg1d)}">${fmt.pct(s.chg1d)}</span><span class="date">${fmt.date(s.date)} kapanış</span></div>
    ${isIdx ? '' : `<button type="button" class="btn" data-cmpadd="${t}">${state.compare.includes(t) ? '⇆ Karşılaştırmada' : '⇆ Karşılaştır'}</button>`}
  </section>

  <div class="chartbar">
    <div class="seg" role="group" aria-label="Zaman aralığı">${Object.keys(RANGES).map(r => `<button type="button" data-range="${r}" aria-pressed="${state.chart.range === r}">${r}</button>`).join('')}</div>
    <div class="toggles" role="group" aria-label="Grafik katmanları">${OVERLAYS.map(([k, l, c]) => `<button type="button" class="tg" data-tg="${k}" aria-pressed="${!!state.chart[k]}"><i style="--c:var(${c})"></i>${l}</button>`).join('')}</div>
    <div class="toggles" role="group" aria-label="Alt paneller">${PANES.map(([k, l]) => `<button type="button" class="tg" data-tg="${k}" aria-pressed="${!!state.chart[k]}">${l}</button>`).join('')}</div>
  </div>
  <div class="charts">
    <div class="legend" id="legend"></div>
    <div class="c-main" id="cMain"></div>
    ${PANES.map(([k, , title]) => `<div class="c-sub" id="pane-${k}"${state.chart[k] ? '' : ' hidden'}><span class="lbl">${title}</span></div>`).join('')}
  </div>

  <div class="panels">
    <section class="panel">
      <h2>Getiriler</h2>
      <div class="rets">${rets.map(([l, k]) => `<div class="ret"><span>${l}</span><b class="${cls(s[k])}">${fmt.pct(s[k])}</b></div>`).join('')}</div>
      <div class="range52">
        <div class="muted" style="font-size:12px">52 haftalık aralık · zirveye ${fmt.pct(s.distHi52)}</div>
        <div class="bar">${pos52 != null ? `<span class="dot" style="left:${Math.min(100, Math.max(0, pos52))}%"></span>` : ''}</div>
        <div class="ends"><span>${fmt.price(s.lo52)}</span><span>${fmt.price(s.hi52)}</span></div>
      </div>
    </section>
    <section class="panel">
      <h2>Teknik görünüm</h2>
      <dl class="kv">${tech.map(([l, v, n]) => `<dt>${l}</dt><dd>${v}</dd><dd class="note">${n}</dd>`).join('')}</dl>
    </section>
    <section class="panel">
      <h2>Temel veriler</h2>
      ${isIdx ? '<p class="muted">Endeks için temel veri yok.</p>' : `
      <dl class="kv">
        <dt class="colhead"></dt><dd class="colhead">${esc(t)}</dd><dd class="colhead note">Sektör medyanı</dd>
        ${fundRows.map(([l, k, f]) => {
          const fd = FIELDS[k], fn = f || fd.f;
          return `<dt>${l}</dt><dd class="${fd.color ? cls(s[k]) : ''}">${fn(s[k])}</dd><dd class="note num">${fn(med[k])}</dd>`;
        }).join('')}
      </dl>
      <p class="muted" style="font-size:12px;margin:8px 0 0">${s.period ? `Son bilanço: <b>${esc(s.period)}</b> · ` : 'Mali tablo bulunamadı · '}Gelir kalemleri son 12 ay. ${s.finGroup === 'UFRS' ? 'Banka/sigorta: satışa dayalı oranlar hesaplanmaz. ' : ''}Sektör: ${esc(s.sector || '—')} (${med.n || 0} hisse).</p>`}
    </section>
  </div>

  ${peers.length > 1 ? `<section class="panel peers"><h2>${esc(s.sector)} sektöründeki hisseler</h2>
    <div class="tablewrap">${tableHtml(sorted(peers), VIEWS[state.view].cols, { sortable: false, highlight: t })}</div></section>` : ''}`;

  try {
    const h = await loadHist(t);
    if (location.hash !== `#/h/${t}`) return; // kullanıcı bu arada başka sayfaya geçti
    drawCharts(h);
  } catch (e) {
    $('#cMain').innerHTML = '<p class="empty">Grafik verisi yüklenemedi.</p>';
  }
}

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function drawCharts(h) {
  destroyCharts();
  const LWC = window.LightweightCharts;
  if (!LWC) return;
  const C = state.chart;
  const subs = PANES.map(([k]) => k).filter(k => C[k]);
  const base = (bottom) => ({
    autoSize: true,
    layout: { background: { type: 'solid', color: css('--surface') }, textColor: css('--muted'), fontFamily: css('--mono'), fontSize: 11 },
    grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } },
    rightPriceScale: { borderColor: css('--line'), minimumWidth: 72 },
    timeScale: { borderColor: css('--line'), visible: bottom, rightOffset: 3 },
    crosshair: { mode: 0 },
    localization: { locale: 'tr-TR', priceFormatter: p => (Math.abs(p) < 1 ? F4 : F2).format(p) },
    handleScale: { axisPressedMouseMove: { time: true, price: false } },
  });
  const up = css('--up'), down = css('--down');
  const T = h.d;
  const line = arr => T.map((time, i) => arr[i] == null ? { time } : { time, value: arr[i] });

  // Ana grafik: mum + hacim + hareketli ortalamalar
  const main = LWC.createChart($('#cMain'), base(subs.length === 0));
  charts.push(main);
  const candle = main.addCandlestickSeries({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down, priceLineVisible: false });
  candle.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
  candle.setData(T.map((time, i) => ({ time, open: h.o[i], high: h.h[i], low: h.l[i], close: h.c[i] })));
  const vol = main.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
  main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  vol.setData(T.map((time, i) => ({ time, value: h.v[i], color: (h.c[i] >= h.o[i] ? up : down) + '55' })));

  const ma = {};
  const addLine = (arr, color, width = 1.5, style = 0) => {
    const sr = main.addLineSeries({ color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    sr.setData(line(arr));
    return arr;
  };
  if (C.sma20) ma.sma20 = addLine(sma(h.c, 20), css('--c-sma20'));
  if (C.sma50) ma.sma50 = addLine(sma(h.c, 50), css('--c-sma50'));
  if (C.sma200) ma.sma200 = addLine(sma(h.c, 200), css('--c-sma200'));
  if (C.bb) {
    const bb = bollinger(h.c);
    addLine(bb.upper, css('--c-bb'), 1, 2); addLine(bb.lower, css('--c-bb'), 1, 2); addLine(bb.mid, css('--c-bb'), 1, 1);
  }
  if (C.vwma) ma.vwma = addLine(vwma(h.c, h.v, 20), css('--c-vwma'));
  if (C.ichi) {
    const ic = ichimoku(h.h, h.l);
    addLine(ic.tenkan, css('--c-ichi'), 1);
    addLine(ic.kijun, css('--c-sma50'), 1);
    addLine(ic.spanA, up + 'aa', 1, 2);
    addLine(ic.spanB, down + 'aa', 1, 2);
  }
  let stLine = null;
  if (C.st) {
    const st = supertrend(h.h, h.l, h.c);
    stLine = st.line;
    // Tek seri, nokta bazında renk: yön değiştiği gündeki geçiş çizgisi görünmez yapılır
    const sr = main.addLineSeries({ lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    sr.setData(T.map((time, i) => {
      if (st.line[i] == null) return { time };
      const flip = i > 0 && st.trend[i - 1] != null && st.trend[i - 1] !== st.trend[i];
      return { time, value: st.line[i], color: flip ? 'rgba(0,0,0,0)' : st.trend[i] === 1 ? up : down };
    }));
  }

  // Alt paneller
  const sub = (k, build) => {
    if (!C[k]) return;
    const c = LWC.createChart($(`#pane-${k}`), base(subs.at(-1) === k));
    charts.push(c);
    const L = (arr, color, opts = {}) => {
      const sr = c.addLineSeries({ color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: !!opts.last, crosshairMarkerVisible: false });
      sr.setData(line(arr));
      for (const p of opts.levels || []) sr.createPriceLine({ price: p, color: css('--muted'), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      return sr;
    };
    build(c, L);
  };
  let rsiArr = null;
  sub('rsi', (c, L) => { rsiArr = rsi(h.c); L(rsiArr, css('--accent'), { last: 1, levels: [70, 30] }); });
  sub('stoch', (c, L) => { const s = stochRsi(h.c); L(s.k, css('--accent'), { last: 1, levels: [80, 20] }); L(s.d, css('--c-sma20')); });
  sub('macd', (c, L) => {
    const m = macd(h.c);
    c.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false })
      .setData(T.map((time, i) => ({ time, value: m.hist[i], color: (m.hist[i] >= 0 ? up : down) + '99' })));
    L(m.line, css('--c-sma50')); L(m.signal, css('--c-sma20'));
  });
  sub('fisher', (c, L) => { const f = fisher(h.h, h.l); L(f.fish, css('--accent'), { last: 1, levels: [0] }); L(f.trigger, css('--c-sma20')); });
  sub('atr', (c, L) => { L(atr(h.h, h.l, h.c, 14), css('--accent'), { last: 1 }); });

  // Panelleri zaman ekseninde eşitle
  let syncing = false;
  for (const src of charts) {
    src.timeScale().subscribeVisibleLogicalRangeChange(r => {
      if (!r || syncing) return;
      syncing = true;
      for (const o of charts) if (o !== src) o.timeScale().setVisibleLogicalRange(r);
      syncing = false;
    });
  }

  // Lejant (imleçteki gün, yoksa son gün)
  const idxOf = new Map(T.map((d, i) => [d, i]));
  const legend = $('#legend');
  const showLegend = i => {
    const parts = [`<span>${fmt.date(T[i])}</span>`,
      `<span>A <b>${fmt.price(h.o[i])}</b></span>`, `<span>Y <b>${fmt.price(h.h[i])}</b></span>`,
      `<span>D <b>${fmt.price(h.l[i])}</b></span>`, `<span>K <b class="${cls(h.c[i] - (h.c[i - 1] ?? h.c[i]))}">${fmt.price(h.c[i])}</b></span>`,
      `<span>Hacim <b>${fmt.vol(h.v[i])}</b></span>`];
    for (const [k, l, c] of OVERLAYS.slice(0, 4)) if (ma[k]?.[i] != null) parts.push(`<span style="color:var(${c})">${l} <b style="color:inherit">${fmt.price(ma[k][i])}</b></span>`);
    if (stLine?.[i] != null) parts.push(`<span>Supertrend <b>${fmt.price(stLine[i])}</b></span>`);
    if (rsiArr?.[i] != null) parts.push(`<span>RSI <b>${fmt.num(rsiArr[i])}</b></span>`);
    legend.innerHTML = parts.join('');
  };
  showLegend(T.length - 1);
  main.subscribeCrosshairMove(p => {
    const i = p?.time ? idxOf.get(typeof p.time === 'string' ? p.time : `${p.time.year}-${String(p.time.month).padStart(2, '0')}-${String(p.time.day).padStart(2, '0')}`) : undefined;
    showLegend(i ?? T.length - 1);
  });

  setRange(state.chart.range, T);
}

function setRange(r, T) {
  const main = charts[0];
  if (!main) return;
  const last = new Date(T.at(-1) + 'T00:00:00Z');
  const from = new Date(last); from.setUTCMonth(from.getUTCMonth() - RANGES[r]);
  const fromS = from.toISOString().slice(0, 10);
  if (fromS <= T[0]) main.timeScale().fitContent();
  else main.timeScale().setVisibleRange({ from: fromS, to: T.at(-1) });
}

/* ============================================================
   Karşılaştırma: seçilen dönemin başı = 100
   ============================================================ */
const CMP_COLORS = ['--c-sma50', '--c-vwma', '--c-ichi', '--c-sma200', '--c-sma20'];
const CMP_MAX = 5;
const cmpList = () => {
  const stocks = state.compare.filter(t => t !== 'XU100' && BY.has(t)).slice(0, CMP_MAX);
  return state.compare.includes('XU100') ? [...stocks, 'XU100'] : stocks;
};
const cmpColor = (t, i) => t === 'XU100' ? '--muted' : CMP_COLORS[i % CMP_COLORS.length];

async function renderCompare() {
  destroyCharts();
  document.title = 'Karşılaştır · Tahta';
  const list = cmpList();
  const nStocks = list.filter(t => t !== 'XU100').length;
  state.cmpRange ||= '1Y';
  view.innerHTML = `
  <section class="dhead">
    <div><h1>Karşılaştır</h1><p class="sub">Seçilen dönemin ilk günü 100 kabul edilir. En fazla ${CMP_MAX} hisse ve BIST 100.</p></div>
  </section>
  <div class="chartbar">
    <div class="saved">
      ${list.map((t, i) => `<span class="svchip cmpchip"><i style="background:var(${cmpColor(t, i)})"></i><a href="#/h/${t}">${t === 'XU100' ? 'BIST 100' : t}</a><button type="button" class="x" data-cmpdel="${t}" aria-label="${t} çıkar">×</button></span>`).join('')}
      ${!list.includes('XU100') ? '<button type="button" class="btn ghost" data-cmpidx="1">+ BIST 100</button>' : ''}
      ${nStocks < CMP_MAX ? `<form id="cmpForm" class="saveform"><label class="sr" for="cmpAdd">Hisse ekle</label><input id="cmpAdd" list="tickerList" placeholder="Hisse ekle, ör. THYAO" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn">Ekle</button></form>` : ''}
    </div>
    <div class="seg" role="group" aria-label="Zaman aralığı">${Object.keys(RANGES).map(r => `<button type="button" data-crange="${r}" aria-pressed="${state.cmpRange === r}">${r}</button>`).join('')}</div>
  </div>
  ${list.length ? `<div class="charts"><div class="legend" id="legend"></div><div class="c-main" id="cCmp"></div></div>
  <section class="panel"><h2>Dönem özeti</h2><div class="tablewrap" id="cmpTable" style="max-height:none;min-height:0;border:0"></div></section>`
    : '<p class="empty">Karşılaştırmak için yukarıdan hisse ekleyin. Hisse sayfalarındaki "Karşılaştır" düğmesiyle de ekleyebilirsiniz.</p>'}`;
  if (!list.length) return;
  const hists = {};
  await Promise.all(list.map(t => loadHist(t).then(h => { hists[t] = h; }).catch(() => {})));
  if (location.hash !== '#/karsilastir') return;
  drawCompare(list.filter(t => hists[t]), hists);
}

function drawCompare(list, hists) {
  destroyCharts();
  const LWC = window.LightweightCharts;
  if (!LWC || !list.length) return;
  const lastDate = list.map(t => hists[t].d.at(-1)).sort().at(-1);
  const from = new Date(lastDate + 'T00:00:00Z'); from.setUTCMonth(from.getUTCMonth() - RANGES[state.cmpRange]);
  const fromS = from.toISOString().slice(0, 10);
  const chart = LWC.createChart($('#cCmp'), {
    autoSize: true,
    layout: { background: { type: 'solid', color: css('--surface') }, textColor: css('--muted'), fontFamily: css('--mono'), fontSize: 11 },
    grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } },
    rightPriceScale: { borderColor: css('--line'), minimumWidth: 72 },
    timeScale: { borderColor: css('--line'), rightOffset: 3 },
    crosshair: { mode: 0 },
    localization: { locale: 'tr-TR', priceFormatter: p => F1.format(p) },
  });
  charts.push(chart);
  const rows = [], series = {};
  list.forEach((t, i) => {
    const h = hists[t];
    const bi = h.d.findIndex(d => d >= fromS);
    if (bi < 0) return;
    const base = h.c[bi];
    const norm = h.c.map((c, j) => j < bi ? null : c / base * 100);
    const sr = chart.addLineSeries({ color: css(cmpColor(t, i)), lineWidth: t === 'XU100' ? 1.5 : 2, lineStyle: t === 'XU100' ? 2 : 0,
      priceLineVisible: false, lastValueVisible: true, title: t === 'XU100' ? 'BIST 100' : t });
    sr.setData(h.d.map((time, j) => j < bi ? { time } : { time, value: norm[j] }));
    if (i === 0) sr.createPriceLine({ price: 100, color: css('--line'), lineWidth: 1, lineStyle: 0, axisLabelVisible: false, title: '' });
    series[t] = { idx: new Map(h.d.map((d, j) => [d, j])), norm, i };
    // dönem özeti
    const seg = h.c.slice(bi);
    let peak = seg[0], mdd = 0;
    for (const c of seg) { peak = Math.max(peak, c); mdd = Math.min(mdd, c / peak - 1); }
    const r = seg.slice(1).map((c, j) => Math.log(c / seg[j]));
    const sd = r.length > 1 ? Math.sqrt(r.reduce((a, x) => a + x * x, 0) / r.length - (r.reduce((a, x) => a + x, 0) / r.length) ** 2) * Math.sqrt(252) : null;
    rows.push({ t, i, ret: seg.at(-1) / seg[0] - 1, mdd, vol: sd, hi: Math.max(...seg) / seg[0] - 1, lo: Math.min(...seg) / seg[0] - 1 });
  });
  chart.timeScale().setVisibleRange({ from: fromS, to: lastDate });

  const xu = rows.find(r => r.t === 'XU100');
  rows.sort((a, b) => b.ret - a.ret);
  $('#cmpTable').innerHTML = `<table class="grid"><thead><tr><th class="tk">Hisse</th><th>Getiri</th><th title="BIST 100 getirisine göre fark">BIST 100'e göre</th><th>En yüksek</th><th>En düşük</th><th title="Zirveden en büyük düşüş">En büyük düşüş</th><th title="Yıllıklandırılmış">Volatilite</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-t="${r.t}"><td class="tk"><span class="dot" style="background:var(${cmpColor(r.t, r.i)})"></span><span class="code">${r.t === 'XU100' ? 'BIST 100' : r.t}</span></td>
      <td class="${cls(r.ret)}">${fmt.pct(r.ret)}</td><td class="${xu && r.t !== 'XU100' ? cls(r.ret - xu.ret) : ''}">${xu && r.t !== 'XU100' ? fmt.pct(r.ret - xu.ret) : '—'}</td>
      <td class="up">${fmt.pct(r.hi)}</td><td class="${cls(r.lo)}">${fmt.pct(r.lo)}</td><td class="down">${fmt.pct(r.mdd)}</td><td>${fmt.pctPlain(r.vol)}</td></tr>`).join('')}
  </tbody></table>`;

  const legend = $('#legend');
  const show = date => {
    legend.innerHTML = `<span>${fmt.date(date)}</span>` + list.map(t => {
      const s = series[t]; if (!s) return '';
      const j = s.idx.get(date), v = j != null ? s.norm[j] : null;
      return v == null ? '' : `<span style="color:var(${cmpColor(t, s.i)})">${t === 'XU100' ? 'BIST 100' : t} <b style="color:inherit">${fmt.pct(v / 100 - 1)}</b></span>`;
    }).join('');
  };
  show(lastDate);
  chart.subscribeCrosshairMove(p => {
    const d = p?.time ? (typeof p.time === 'string' ? p.time : `${p.time.year}-${String(p.time.month).padStart(2, '0')}-${String(p.time.day).padStart(2, '0')}`) : lastDate;
    show(d);
  });
}

/* ============================================================
   Aktarma: izleme listesi ve kayıtlı taramaları kodla taşı
   ============================================================ */
const b64e = str => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
const exportCode = () => 'T1.' + b64e(JSON.stringify({ w: state.watch, s: state.saved, c: state.compare }));
function parseCode(code) {
  const m = String(code).trim().match(/(?:#\/aktar\/)?(T1\.[A-Za-z0-9_-]+)\s*$/);
  if (!m) throw new Error('Kod tanınmadı. "T1." ile başlayan kodun tamamını yapıştırın.');
  const d = JSON.parse(b64d(m[1].slice(3)));
  return { w: Array.isArray(d.w) ? d.w.filter(x => typeof x === 'string') : [], s: Array.isArray(d.s) ? d.s.filter(x => x && x.name) : [], c: Array.isArray(d.c) ? d.c : [] };
}

function renderTransfer(incoming) {
  destroyCharts();
  document.title = 'Aktar · Tahta';
  const code = exportCode();
  const link = `${location.origin}${location.pathname}#/aktar/${code}`;
  let preview = '';
  if (incoming) {
    try {
      const d = parseCode(incoming);
      preview = `<p class="note-ok">Bu bağlantıda <b>${d.w.length}</b> izleme listesi hissesi ve <b>${d.s.length}</b> kayıtlı tarama var. Eklemek için aşağıdaki <b>İçe aktar</b> düğmesine basın.</p>`;
    } catch (e) { preview = `<p class="note-fx">${esc(e.message)}</p>`; }
  }
  view.innerHTML = `
  <section class="dhead"><div><h1>Aktar</h1><p class="sub">İzleme listenizi ve kayıtlı taramalarınızı başka bir cihaza taşıyın.</p></div></section>
  <div class="panels two">
    <section class="panel">
      <h2>Bu cihazdan gönder</h2>
      <p>İzleme listesi: <b>${state.watch.length}</b> hisse · Kayıtlı tarama: <b>${state.saved.length}</b></p>
      <label class="muted" for="exportLink" style="font-size:12px">Bağlantı (diğer cihazda açınca kod hazır gelir)</label>
      <textarea id="exportLink" class="code" rows="3" readonly>${esc(link)}</textarea>
      <div class="row"><button type="button" class="btn" data-copy="exportLink">Bağlantıyı kopyala</button><button type="button" class="btn" data-copy="exportCode">Yalnızca kodu kopyala</button><span class="muted" id="copyMsg" role="status"></span></div>
      <textarea id="exportCode" class="code" rows="2" readonly hidden>${esc(code)}</textarea>
    </section>
    <section class="panel">
      <h2>Bu cihaza ekle</h2>
      ${preview}
      <label class="muted" for="importCode" style="font-size:12px">Kodu ya da bağlantıyı yapıştırın</label>
      <textarea id="importCode" class="code" rows="3" placeholder="T1.…">${esc(incoming || '')}</textarea>
      <div class="row"><button type="button" class="btn primary" id="importBtn">İçe aktar</button><span id="importMsg" role="status"></span></div>
      <p class="muted" style="font-size:12px">Mevcut listeniz silinmez; yeni hisseler eklenir, aynı adlı taramalar güncellenir.</p>
    </section>
  </div>`;
}

/* ============================================================
   Olaylar
   ============================================================ */
view.addEventListener('click', e => {
  const b = e.target.closest('button, tr[data-t]');
  if (!b) return;
  const d = b.dataset;
  if (d.star) {
    e.stopPropagation();
    const i = state.watch.indexOf(d.star);
    if (i >= 0) state.watch.splice(i, 1); else state.watch.push(d.star);
    persist();
    document.querySelectorAll(`[data-star="${d.star}"]`).forEach(x => x.setAttribute('aria-pressed', i < 0));
    if (state.preset === 'watch' && !location.hash.startsWith('#/h/')) renderScreener();
    return;
  }
  if (d.preset) {
    state.preset = d.preset;
    const p = PRESETS.find(x => x.id === d.preset);
    if (p?.sort) state.sort = { key: p.sort[0], dir: p.sort[1] };
    persist(); renderScreener(); return;
  }
  if (d.view) { state.view = d.view; persist(); renderScreener(); return; }
  if (d.sort) {
    state.sort = state.sort.key === d.sort ? { key: d.sort, dir: -state.sort.dir } : { key: d.sort, dir: ['t', '_sector', '_idx'].includes(d.sort) ? 1 : -1 };
    persist(); renderScreener(); return;
  }
  // Karşılaştırma
  if (d.cmpadd) {
    if (!state.compare.includes(d.cmpadd)) {
      const stocks = state.compare.filter(x => x !== 'XU100');
      if (stocks.length >= CMP_MAX) state.compare.splice(state.compare.indexOf(stocks[0]), 1); // en eskisini çıkar
      state.compare.unshift(d.cmpadd);
    }
    persist(); location.hash = '#/karsilastir'; return;
  }
  if (d.cmpdel) { state.compare = state.compare.filter(x => x !== d.cmpdel); persist(); renderCompare(); return; }
  if (d.cmpidx) { state.compare.push('XU100'); persist(); renderCompare(); return; }
  if (d.crange) { state.cmpRange = d.crange; persist(); renderCompare(); return; }
  // Aktarma
  if (d.copy) {
    const el = $('#' + d.copy), msg = $('#copyMsg');
    const done = () => { msg.textContent = 'Kopyalandı'; setTimeout(() => { msg.textContent = ''; }, 2000); };
    const fallback = () => { el.hidden = false; el.focus(); el.select(); msg.textContent = 'Seçili metni kopyalayın'; };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(el.value).then(done, fallback); else fallback();
    return;
  }
  if (b.id === 'importBtn') {
    const msg = $('#importMsg');
    try {
      const d2 = parseCode($('#importCode').value);
      const before = state.watch.length;
      for (const t of d2.w) if (!state.watch.includes(t)) state.watch.push(t);
      for (const sv of d2.s) { const i = state.saved.findIndex(x => x.name === sv.name); if (i >= 0) state.saved[i] = sv; else state.saved.push(sv); }
      persist();
      msg.className = 'up';
      msg.textContent = `${state.watch.length - before} yeni hisse ve ${d2.s.length} tarama eklendi.`;
      if (location.hash.startsWith('#/aktar/')) history.replaceState(null, '', '#/aktar');
    } catch (e) {
      msg.className = 'down';
      msg.textContent = e.message.startsWith('Kod') ? e.message : 'Kod okunamadı. Eksik ya da bozuk kopyalanmış olabilir.';
    }
    return;
  }
  if (b.id === 'saveBtn') { savingOpen = true; renderScreener(); $('#saveName')?.focus(); return; }
  if (d.cancelsave) { savingOpen = false; renderScreener(); return; }
  if (d.load != null) {
    const sv = state.saved[+d.load];
    if (sv) Object.assign(state, { preset: sv.preset, index: sv.index, market: sv.market || '', sector: sv.sector, view: VIEWS[sv.view] ? sv.view : state.view,
      sort: { ...sv.sort }, filters: sv.filters.map(f => ({ ...f })) });
    persist(); renderScreener(); return;
  }
  if (d.unsave != null) { state.saved.splice(+d.unsave, 1); persist(); renderScreener(); return; }
  if (b.id === 'addFilter') { state.filters.push({ key: 'rsi', op: '<', value: '' }); persist(); renderScreener(); view.querySelector('.frow:last-child input')?.focus(); return; }
  if (d.remove != null) { state.filters.splice(+d.remove, 1); persist(); renderScreener(); return; }
  if (d.range) {
    state.chart.range = d.range; persist();
    view.querySelectorAll('[data-range]').forEach(x => x.setAttribute('aria-pressed', x.dataset.range === d.range));
    const t = location.hash.slice(4);
    if (HIST.has(t)) setRange(d.range, HIST.get(t).d);
    return;
  }
  if (d.tg) {
    state.chart[d.tg] = !state.chart[d.tg]; persist();
    b.setAttribute('aria-pressed', state.chart[d.tg]);
    for (const [k] of PANES) $(`#pane-${k}`).hidden = !state.chart[k];
    const t = location.hash.slice(4);
    if (HIST.has(t)) drawCharts(HIST.get(t));
    return;
  }
  if (d.t) location.hash = `#/h/${d.t}`;
});

view.addEventListener('change', e => {
  if (e.target.id === 'sector') { state.sector = e.target.value; persist(); renderScreener(); return; }
  if (e.target.id === 'indexSel') { state.index = e.target.value; persist(); renderScreener(); return; }
  if (e.target.id === 'hideTedbir') { state.hideTedbir = e.target.checked; persist(); renderScreener(); return; }
  if (e.target.id === 'marketSel') { state.market = e.target.value; persist(); renderScreener(); return; }
  const row = e.target.closest('.frow');
  if (!row) return;
  const f = state.filters[+row.dataset.i];
  f[e.target.dataset.f] = e.target.value;
  persist(); renderScreener();
});
// Değer yazarken anında süz (odak kaybolmasın diye yalnızca tablo ve sayaç yenilenir)
view.addEventListener('input', e => {
  if (e.target.dataset.f !== 'value') return;
  state.filters[+e.target.closest('.frow').dataset.i].value = e.target.value;
  persist();
  const rows = sorted(filtered());
  view.querySelector('.tablewrap').innerHTML = rows.length ? tableHtml(rows, VIEWS[state.view].cols) : '<p class="empty">Bu koşullara uyan hisse yok.</p>';
  view.querySelector('.count b').textContent = rows.length;
});

view.addEventListener('submit', e => {
  if (e.target.id === 'cmpForm') {
    e.preventDefault();
    const q = $('#cmpAdd').value.trim().toUpperCase();
    const hit = BY.has(q) ? q : DATA.stocks.find(s => s.t.startsWith(q))?.t;
    if (!hit) { $('#cmpAdd').setCustomValidity('Bu kodla hisse bulunamadı'); $('#cmpAdd').reportValidity(); return; }
    if (!state.compare.includes(hit)) state.compare.unshift(hit);
    persist(); renderCompare(); return;
  }
  if (e.target.id !== 'saveForm') return;
  e.preventDefault();
  const name = $('#saveName').value.trim();
  if (!name) return;
  const i = state.saved.findIndex(s => s.name === name);
  const sv = { name, ...screenOf() };
  if (i >= 0) state.saved[i] = sv; else state.saved.push(sv); // aynı ad varsa üzerine yaz
  savingOpen = false; persist(); renderScreener();
});

$('#searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#search').value.trim().toUpperCase();
  if (!q || !DATA) return;
  const hit = BY.has(q) || q === 'XU100' ? q : DATA.stocks.find(s => s.t.startsWith(q) || (s.name || '').toUpperCase().includes(q))?.t;
  if (hit) { location.hash = `#/h/${hit}`; $('#search').value = ''; $('#search').blur(); }
});
$('#search').addEventListener('change', e => { const q = e.target.value.trim().toUpperCase(); if (BY.has(q)) $('#searchForm').requestSubmit(); });

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const t = location.hash.slice(4);
  if (location.hash.startsWith('#/h/') && HIST.has(t)) drawCharts(HIST.get(t));
});

/* ============================================================
   Yönlendirme
   ============================================================ */
let lastScroll = 0;
function route() {
  if (!DATA) return;
  const h = location.hash;
  const onScreener = !!view.querySelector('.toolbar');
  if (onScreener) lastScroll = view.querySelector('.tablewrap')?.scrollTop || 0;
  const m = h.match(/^#\/h\/([A-Z0-9]+)$/i);
  const section = m ? 'hisse' : h.startsWith('#/karsilastir') ? 'karsilastir' : h.startsWith('#/aktar') ? 'aktar' : 'tarama';
  document.querySelectorAll('[data-nav]').forEach(a => a.toggleAttribute('aria-current', a.dataset.nav === section));
  if (m) renderDetail(m[1].toUpperCase());
  else if (section === 'karsilastir') renderCompare();
  else if (section === 'aktar') renderTransfer(h.startsWith('#/aktar/') ? h.slice(8) : null);
  else {
    renderScreener();
    const tw = view.querySelector('.tablewrap');
    if (tw) tw.scrollTop = lastScroll;
    return;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

(async () => {
  try {
    await loadSummary();
    route();
  } catch (e) {
    view.innerHTML = `<p class="empty">Veri yüklenemedi. GitHub Actions'taki "Veriyi güncelle ve yayınla" iş akışı henüz çalışmamış olabilir.<br>Yerelde denemek için: <code>scripts/dev.sh</code></p>`;
  }
})();

// Uygulama dosyaları güncellenince service worker haber verir; kullanıcı tek dokunuşla yeniler.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'update') $('#updateBar').hidden = false;
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    // Yeni bir service worker devreye girdiğinde de uyar
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'activated' && navigator.serviceWorker.controller) $('#updateBar').hidden = false; });
    });
  }).catch(() => {});
}
$('#reloadBtn').addEventListener('click', () => location.reload());
