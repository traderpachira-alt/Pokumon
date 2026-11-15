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
  divYield:  { label: 'Temettü verimi',   f: fmt.pctPlain, pct: 1, title: 'Son 12 ayda ödenen hisse başı temettü / güncel fiyat' },
  divTtm:    { label: '12A temettü ₺',    f: x => !ok(x) || x === 0 ? '—' : fmt.price(x), title: 'Son 12 ayda ödenen hisse başı brüt temettü (TL)' },
  lastDivDate: { label: 'Son ödeme',      f: fmt.date, nofilter: 1, title: 'Son temettünün hak kullanım (eski: ex-date) tarihi' },
  lastDivAmt: { label: 'Son tutar ₺',     f: fmt.price, title: 'Son ödenen hisse başı brüt temettü (TL)' },
  divFreq:   { label: '12A ödeme',        f: x => !ok(x) || x === 0 ? '—' : x + '×', title: 'Son 12 aydaki temettü ödemesi sayısı' },
  divYears5: { label: 'Son 5 yıl',        f: x => !ok(x) ? '—' : `${x}/5`, title: 'Bu yıl dahil son 5 takvim yılının kaçında temettü ödendi' },
  divStreak: { label: 'Kesintisiz',       f: x => !ok(x) || x === 0 ? '—' : x + ' yıl', title: 'Kaç yıldır her yıl temettü ödüyor (yaklaşık 5 yıllık veriyle; en fazla 6 takvim yılı görünür)' },
  divGrowth: { label: 'Temettü değişimi', f: fmt.pct, pct: 1, color: 1, title: 'Son 12 ay toplamı / önceki 12 ay toplamı' },
  divAvg5:   { label: '5Y ort. verim',    f: fmt.pctPlain, pct: 1, title: 'Son 5 tamamlanmış yılın ortalama yıllık temettüsü / güncel fiyat' },
  nextDivNet:   { label: 'Sıradaki tutar (net) ₺', f: fmt.price, title: 'Açıklanan sıradaki temettünün stopaj sonrası pay başı tutarı (temettuhisseleri.com)' },
  nextDivYield: { label: 'Sıradaki verim (net)',   f: fmt.pctPlain, pct: 1, title: 'Sıradaki net temettü / güncel fiyat' },
  payout:    { label: 'Dağıtma oranı',    f: fmt.pctPlain, pct: 1, title: 'Son 12 ayda ödenen temettü / son 12 ay net kâr (İş Yatırım mali tabloları)' },
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
  temettu:  { label: 'Temettü',  cols: ['_idx', 'last', '_nextDiv', 'nextDivNet', 'nextDivYield', 'divYield', 'divTtm', 'lastDivDate', 'lastDivAmt', 'divFreq', 'divYears5', 'divStreak', 'divGrowth', 'divAvg5', 'payout'] },
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
  _nextDiv: { label: 'Sıradaki temettü', sortKey: s => s.divUpcoming?.length ? (s.nextDivDate || '9999-12-31') : null,
             cell: s => !s.divUpcoming?.length ? '<span class="muted">—</span>'
               : s.nextDivDate ? `<span class="chip up">${fmt.date(s.nextDivDate)}</span>${s.divUpcoming.length > 1 ? ` <span class="muted">+${s.divUpcoming.length - 1}</span>` : ''}`
               : '<span class="chip warn" title="Temettü kararı alındı, ödeme tarihi henüz açıklanmadı">Tarih bekleniyor</span>',
             title: 'Açıklanmış ama henüz ödenmemiş temettü (temettuhisseleri.com)' },
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
  const at = DATA.tedbirAt ? new Date(DATA.tedbirAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : null;
  return `<b>${t} · uygulanan tedbirler</b><ul>${s.tedbir.map(m => `<li><span>${esc(m.type)}</span><small>${m.from ? fmt.date(m.from) : '?'} – ${m.to ? fmt.date(m.to) : 'süresiz'}${m.note ? ' · ' + esc(m.note) : ''}</small></li>`).join('')}</ul>
    <p class="src">Kaynak: GCM Yatırım tedbir listesi${at ? ' · ' + at : ''}. İşlem öncesi aracı kurumunuzdan teyit edin.</p>`;
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
addEventListener('keydown', e => { if (e.key === 'Escape') { hidePop(); closeMs?.(); } });

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
  { id: 'divSoon',  label: 'Yaklaşan temettü', test: s => !!s.divUpcoming?.length, hint: 'Açıklanmış, henüz ödenmemiş temettüsü olanlar (tarihli olanlar önce)', sort: ['_nextDiv', 1] },
  { id: 'divHigh',  label: 'Yüksek temettü',   test: s => s.divYield >= 0.06, hint: 'Son 12 ay temettü verimi ≥ %6', sort: ['divYield', -1] },
  { id: 'divReg',   label: 'Düzenli temettü',  test: s => s.divYears5 >= 5, hint: 'Son 5 yılın her birinde temettü ödedi', sort: ['divAvg5', -1] },
  { id: 'value',    label: 'Ucuz',             test: s => s.pe > 0 && s.pe < 8 && s.pb > 0 && s.pb < 1.5, hint: 'F/K < 8 ve PD/DD < 1,5', sort: ['pe', 1] },
  { id: 'quality',  label: 'Kârlı büyüme',     test: s => s.roe > 0.25 && s.netMargin > 0.1 && s.revGrowth > 0, hint: 'ÖK kârlılığı > %25, net marj > %10, satış büyüyor', sort: ['roe', -1] },
];
const OPS = { '>': (a, b) => a > b, '<': (a, b) => a < b };

/* ============================================================
   Durum (tarayıcıda saklanır)
   ============================================================ */
const KEY = 'tahta:v1';
const state = Object.assign({
  view: 'fiyat', sort: { key: 'turnover', dir: -1 }, preset: 'all', sectors: [], index: '', markets: [], hideTedbir: false, filters: [], watch: [], saved: [],
  compare: ['XU100'], portfolio: [],
  chart: { range: '6A', sma20: false, sma50: true, sma200: true, bb: false, vwma: false, ichi: false, st: false,
           rsi: true, stoch: false, macd: true, fisher: false, atr: false },
}, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })());
if (!VIEWS[state.view]) state.view = 'trend'; // eski sürümdeki 'teknik' görünümü
// Eski tekli seçimleri (sector/market) çoklu seçime çevir
const listOf = (o, key) => Array.isArray(o[key + 's']) ? o[key + 's'] : o[key] ? [o[key]] : [];
if (state.sector) state.sectors = [state.sector];
if (state.market) state.markets = [state.market];
if (!Array.isArray(state.sectors)) state.sectors = [];
if (!Array.isArray(state.markets)) state.markets = [];
delete state.sector; delete state.market;
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
    for (const k of ['pe', 'pb', 'evEbitda', 'netMargin', 'roe', 'de', 'revGrowth', 'epsGrowth', 'divYield', 'payout', 'freeFloat', 'mcap'])
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
    (!state.sectors.length || state.sectors.includes(s.sector)) &&
    (!state.index || tierRank(s) <= TIER_RANK[state.index]) &&
    (!state.markets.length || state.markets.includes(s.mkt)) &&
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
const screenOf = () => ({ preset: state.preset, index: state.index, markets: [...state.markets], sectors: [...state.sectors], view: state.view,
  sort: { ...state.sort }, filters: state.filters.filter(f => f.value !== '').map(f => ({ ...f })) });
const sameScreen = sv => {
  const c = screenOf();
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  return c.preset === sv.preset && c.index === sv.index && same(c.markets, listOf(sv, 'market')) && same(c.sectors, listOf(sv, 'sector')) && JSON.stringify(c.filters) === JSON.stringify(sv.filters);
};
function describeScreen(sv) {
  const p = [];
  if (sv.preset && sv.preset !== 'all') p.push(PRESETS.find(x => x.id === sv.preset)?.label);
  if (sv.index) p.push('BIST ' + sv.index);
  const mk = listOf(sv, 'market'), sc = listOf(sv, 'sector');
  if (mk.length) p.push(mk.map(m => MKT_NAME[m] || m).join(' + '));
  if (sc.length) p.push(sc.length > 2 ? `${sc.length} sektör` : sc.join(' + '));
  for (const f of sv.filters || []) p.push(`${FIELDS[f.key]?.label} ${f.op} ${f.value}${FIELDS[f.key]?.pct ? '%' : ''}`);
  return p.join(' · ') || 'Tüm hisseler';
}

/* Çoklu seçim kutusu (pazar, sektör) */
const MARKET_OPTS = [['Yıldız', 'Yıldız Pazar'], ['Ana', 'Ana Pazar'], ['Alt', 'Alt Pazar'], ['YİP', 'Yakın İzleme Pazarı']];
let msOpen = null;
function msLabel(key, allLabel, unit) {
  const sel = state[key];
  if (!sel.length) return allLabel;
  if (sel.length === 1) return key === 'markets' ? (MARKET_OPTS.find(o => o[0] === sel[0])?.[1] || sel[0]) : sel[0];
  return `${sel.length} ${unit}`;
}
function multiSelect(key, allLabel, unit, options, searchable) {
  const sel = new Set(state[key]), open = msOpen === key;
  return `<div class="ms${sel.size ? ' on' : ''}" data-ms="${key}" data-all="${esc(allLabel)}" data-unit="${unit}">
    <button type="button" class="btn ms-btn" data-mstoggle="${key}" aria-haspopup="true" aria-expanded="${open}"><span class="ms-lbl">${esc(msLabel(key, allLabel, unit))}</span> ▾</button>
    <div class="ms-panel"${open ? '' : ' hidden'}>
      ${searchable ? `<input type="search" class="ms-q" placeholder="Ara…" aria-label="${unit} ara" autocomplete="off">` : ''}
      <div class="ms-list">${options.map(([v, l, n]) => `<label><input type="checkbox" value="${esc(v)}"${sel.has(v) ? ' checked' : ''}> <span>${esc(l)}</span> <span class="n">${n}</span></label>`).join('')}</div>
      <div class="ms-foot"><button type="button" class="btn" data-msclear="${key}">Temizle</button><button type="button" class="btn primary" data-msclose="1">Tamam</button></div>
    </div>
  </div>`;
}
// Tabloyu ve sayacı yenile (araç çubuğunu yeniden çizmeden; açık paneller ve odak korunur)
function refreshResults() {
  const rows = sorted(filtered());
  view.querySelector('.tablewrap').innerHTML = rows.length ? tableHtml(rows, VIEWS[state.view].cols) : '<p class="empty">Bu koşullara uyan hisse yok.</p>';
  view.querySelector('.count b').textContent = rows.length;
  view.querySelectorAll('.ms').forEach(m => {
    const k = m.dataset.ms;
    m.querySelector('.ms-lbl').textContent = msLabel(k, m.dataset.all, m.dataset.unit);
    m.classList.toggle('on', state[k].length > 0);
  });
}
function closeMs() {
  if (!msOpen) return;
  msOpen = null;
  view.querySelectorAll('.ms-panel').forEach(p => { p.hidden = true; });
  view.querySelectorAll('[data-mstoggle]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
document.addEventListener('click', e => { if (msOpen && !e.target.closest?.('.ms')) closeMs(); });

function renderScreener() {
  destroyCharts();
  document.title = 'Tahta';
  const sectors = [...new Set(DATA.stocks.map(s => s.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const numericKeys = Object.keys(FIELDS).filter(k => !FIELDS[k].nofilter);
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
      ${multiSelect('markets', 'Tüm pazarlar', 'pazar', MARKET_OPTS.map(([v, l]) => [v, l, DATA.stocks.filter(x => x.mkt === v).length]), false)}
      ${multiSelect('sectors', 'Tüm sektörler', 'sektör', sectors.map(v => [v, v, DATA.stocks.filter(x => x.sector === v).length]), true)}
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
    ['Net marj', 'netMargin'], ['ÖK kârlılığı', 'roe'], ['Borç / ÖK', 'de'], ['Satış büyümesi', 'revGrowth'], ['Kâr büyümesi', 'epsGrowth'], ['Temettü verimi', 'divYield'], ['Dağıtma oranı', 'payout'], ['Halka açıklık', 'freeFloat'],
  ];

  view.innerHTML = `
  <section class="dhead">
    <a class="back" href="#/">← Tarama</a>
    <div>
      <h1>${isIdx ? '' : `<button type="button" class="star" data-star="${t}" aria-pressed="${starred}" aria-label="İzleme listesi">★</button>`}${esc(t)}${tedbirIcon(s)}</h1>
      <p class="sub">${isIdx ? '' : tierChip(s) + ' '}${esc(s.name || '')}${s.sector ? ' · ' + esc(s.sector) : ''}${s.industry ? ' · ' + esc(s.industry) : ''}</p>
    </div>
    <div class="px"><span class="price">${fmt.price(s.last)}${isIdx ? '' : ' ₺'}</span><span class="chg ${cls(s.chg1d)}">${fmt.pct(s.chg1d)}</span><span class="date">${fmt.date(s.date)} kapanış</span></div>
    ${isIdx ? '' : `<div class="row"><button type="button" class="btn" data-cmpadd="${t}">${state.compare.includes(t) ? '⇆ Karşılaştırmada' : '⇆ Karşılaştır'}</button><button type="button" class="btn" data-pfaddsym="${t}">+ Portföye ekle${state.portfolio.some(p => p.sym === t) ? ' <span class="chip up">var</span>' : ''}</button></div>`}
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

  ${isIdx ? '' : '<section class="panel" id="divPanel"><h2>Temettü geçmişi</h2><p class="muted">Yükleniyor…</p></section>'}

  ${peers.length > 1 ? `<section class="panel peers"><h2>${esc(s.sector)} sektöründeki hisseler</h2>
    <div class="tablewrap">${tableHtml(sorted(peers), VIEWS[state.view].cols, { sortable: false, highlight: t })}</div></section>` : ''}`;

  try {
    const h = await loadHist(t);
    if (location.hash !== `#/h/${t}`) return; // kullanıcı bu arada başka sayfaya geçti
    drawCharts(h);
    if (!isIdx) renderDivPanel(s, h);
  } catch (e) {
    $('#cMain').innerHTML = '<p class="empty">Grafik verisi yüklenemedi.</p>';
  }
}

function renderDivPanel(s, h) {
  const el = $('#divPanel');
  if (!el) return;
  const div = (h.div || []).slice().reverse();
  if (!div.length && !s.divUpcoming?.length) { el.innerHTML = '<h2>Temettü geçmişi</h2><p class="muted">Son 5 yılda temettü ödemesi görünmüyor.</p>'; return; }
  const closeOn = new Map(h.d.map((d, i) => [d, h.c[i]]));
  // Ödeme günündeki (ya da hemen önceki işlem günündeki) kapanışa göre o günkü verim
  const pxAt = d => { if (closeOn.has(d)) return closeOn.get(d); const i = h.d.findIndex(x => x > d); return i > 0 ? h.c[i - 1] : null; };
  const byYear = {};
  for (const [d, a] of div) byYear[d.slice(0, 4)] = (byYear[d.slice(0, 4)] || 0) + a;
  const years = Object.keys(byYear).sort().reverse();
  const up = s.divUpcoming || [];
  const upHtml = up.length ? `<div class="upcoming"><b>Açıklanan temettü${up.length > 1 ? 'ler' : ''}</b>${up.map(u =>
      `<span class="chip ${u.date ? 'up' : 'warn'}">${u.date ? fmt.date(u.date) : 'Tarih bekleniyor'}</span> <span class="num">${fmt.price(u.net)} ₺ net</span> <span class="muted">(${fmt.pctPlain(u.net / s.last)})</span>`).join(' · ')}</div>` : '';
  el.innerHTML = `<h2>Temettü geçmişi</h2>
  ${upHtml}
  <div class="divgrid">
    <dl class="kv">
      <dt>Son 12 ay verim</dt><dd>${fmt.pctPlain(s.divYield)}</dd><dd class="note">${s.divTtm ? fmt.price(s.divTtm) + ' ₺' : ''}</dd>
      <dt>Son 5 yıl</dt><dd>${FIELDS.divYears5.f(s.divYears5)}</dd><dd class="note">${s.divStreak ? s.divStreak + ' yıldır kesintisiz' : ''}</dd>
      <dt>5 yıllık ort. verim</dt><dd>${fmt.pctPlain(s.divAvg5)}</dd><dd class="note"></dd>
      <dt>Temettü değişimi</dt><dd class="${cls(s.divGrowth)}">${fmt.pct(s.divGrowth)}</dd><dd class="note">son 12 ay / önceki 12 ay</dd>
      <dt>Dağıtma oranı</dt><dd>${fmt.pctPlain(s.payout)}</dd><dd class="note">${s.payout != null ? 'temettü / net kâr' : ''}</dd>
    </dl>
    <div class="tablewrap flat"><table class="grid"><thead><tr><th class="tk">Tarih</th><th>Hisse başı ₺</th><th title="Ödeme günündeki kapanışa göre">O günkü verim</th><th>Bugünkü fiyata göre</th></tr></thead><tbody>
      ${div.slice(0, 12).map(([d, a, y]) => { const p = pxAt(d); const yy = y ?? (p ? a / p : null); return `<tr><td class="tk">${fmt.date(d)}</td><td>${fmt.price(a)}</td><td>${fmt.pctPlain(yy)}</td><td>${fmt.pctPlain(a / s.last)}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="tablewrap flat"><table class="grid"><thead><tr><th class="tk">Yıl</th><th>Toplam ₺</th><th>Bugünkü fiyata göre</th></tr></thead><tbody>
      ${years.map(y => `<tr><td class="tk">${y}</td><td>${fmt.price(byYear[y])}</td><td>${fmt.pctPlain(byYear[y] / s.last)}</td></tr>`).join('')}
    </tbody></table></div>
  </div>
  <p class="muted" style="font-size:12px;margin:8px 0 0">Geçmiş ödemeler brüt, bedelsiz sermaye artırımlarına göre düzeltilmiş (Yahoo Finance); tarih, hak kullanım tarihidir. Açıklanan temettüler stopaj sonrası net tutardır (temettuhisseleri.com).</p>`;
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
const exportCode = () => 'T1.' + b64e(JSON.stringify({ w: state.watch, s: state.saved, c: state.compare, p: state.portfolio }));
function parseCode(code) {
  const m = String(code).trim().match(/(?:#\/aktar\/)?(T1\.[A-Za-z0-9_-]+)\s*$/);
  if (!m) throw new Error('Kod tanınmadı. "T1." ile başlayan kodun tamamını yapıştırın.');
  const d = JSON.parse(b64d(m[1].slice(3)));
  return { w: Array.isArray(d.w) ? d.w.filter(x => typeof x === 'string') : [], s: Array.isArray(d.s) ? d.s.filter(x => x && x.name) : [], c: Array.isArray(d.c) ? d.c : [],
    p: Array.isArray(d.p) ? d.p.filter(x => x && x.id && x.sym && PF_CATS[x.cat] && (Array.isArray(x.txs) || Number.isFinite(x.qty)))
      .map(x => Array.isArray(x.txs) ? x : { id: x.id, cat: x.cat, sym: x.sym, note: x.note || null, txs: [{ id: pfId(), type: 'buy', date: x.date || null, qty: x.qty, price: x.cost, fee: 0 }] }) : [] };
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
      preview = `<p class="note-ok">Bu bağlantıda <b>${d.w.length}</b> izleme listesi hissesi, <b>${d.s.length}</b> kayıtlı tarama ve <b>${d.p.length}</b> portföy varlığı var. Eklemek için aşağıdaki <b>İçe aktar</b> düğmesine basın.</p>`;
    } catch (e) { preview = `<p class="note-fx">${esc(e.message)}</p>`; }
  }
  view.innerHTML = `
  <section class="dhead"><div><h1>Aktar</h1><p class="sub">İzleme listenizi, kayıtlı taramalarınızı ve portföyünüzü başka bir cihaza taşıyın.</p></div></section>
  <div class="panels two">
    <section class="panel">
      <h2>Bu cihazdan gönder</h2>
      <p>İzleme listesi: <b>${state.watch.length}</b> hisse · Kayıtlı tarama: <b>${state.saved.length}</b> · Portföy: <b>${state.portfolio.length}</b> varlık</p>
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
   Portföy (yalnızca bu cihazda saklanır; Aktar ile taşınır)
   Her pozisyon bir işlem listesidir: alım/satım (tarih, adet, fiyat, komisyon).
   Adet, ortalama maliyet ve gerçekleşen K/Z bu listeden ortalama maliyet yöntemiyle hesaplanır.
   ============================================================ */
const PF_CATS = {
  temettu: { label: 'Temettü', hint: 'Temettüsü için tutulan hisseler', color: '--c-sma50' },
  trend:   { label: 'Trend / Momentum', hint: 'Trend sürdükçe tutulup momentum bitince satılacak hisseler', color: '--c-vwma' },
  emtia:   { label: 'Emtia / İtibari', hint: 'Altın, gümüş, TL, dolar, euro', color: '--c-ichi' },
};
const ASSETS = {
  XAU: { name: 'Altın', unit: 'gram', qtyLabel: 'Gram' },
  XAG: { name: 'Gümüş', unit: 'gram', qtyLabel: 'Gram' },
  TRY: { name: 'Türk lirası', unit: '₺', qtyLabel: 'Tutar (₺)' },
  USD: { name: 'Dolar', unit: '$', qtyLabel: 'Tutar ($)' },
  EUR: { name: 'Euro', unit: '€', qtyLabel: 'Tutar (€)' },
};
let pfForm = null;    // yeni varlık / kategori-not düzenleme formu
let txForm = null;    // alım-satım formu: {pid, type, date, qty, price, fee}
let pfDelArmed = null; // iki dokunuşla silme (pozisyon ya da işlem kimliği)
const pfHist = new Set(); // işlem geçmişi açık pozisyonlar
const pfId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const isAsset = p => p.cat === 'emtia';
const todayIso = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const unitOf = p => isAsset(p) ? (ASSETS[p.sym]?.unit || '') : 'hisse';
const assetName = p => isAsset(p) ? (ASSETS[p.sym]?.name || p.sym) : p.sym;

// Eski biçimdeki pozisyonları ({qty, cost, date}) tek alım işlemine çevir
state.portfolio = (state.portfolio || []).map(p => Array.isArray(p.txs) ? p : {
  id: p.id || pfId(), cat: p.cat, sym: p.sym, note: p.note || null,
  txs: [{ id: pfId(), type: 'buy', date: p.date || null, qty: p.qty, price: p.cost, fee: 0 }],
});

function pfCalc(p, extra) {
  // Tarih sırasıyla; tarihsiz işlemler en başta, girildikleri sırada
  const txs = [...p.txs, ...(extra ? [extra] : [])].map((t, i) => ({ ...t, _i: i }))
    .sort((a, b) => (a.date || '') === (b.date || '') ? a._i - b._i : (a.date || '') < (b.date || '') ? -1 : 1);
  let qty = 0, cost = 0, realized = 0, bought = 0, sold = 0, lastSell = null, oversold = null;
  for (const t of txs) {
    if (t.type === 'buy') { qty += t.qty; cost += t.qty * t.price + (t.fee || 0); bought += t.qty; continue; }
    if (t.qty > qty + 1e-9) oversold ??= { date: t.date, have: qty };
    const q = Math.min(t.qty, qty), avg = qty ? cost / qty : 0;
    realized += q * t.price - (t.fee || 0) - q * avg;
    cost -= q * avg; qty -= q; sold += q; lastSell = t.date || lastSell;
  }
  if (qty < 1e-9) { qty = 0; cost = 0; }
  return { qty, cost, avg: qty ? cost / qty : 0, realized, bought, sold, lastSell, oversold, txs };
}
function pfQuote(p) {
  if (isAsset(p)) { const a = DATA.assets?.[p.sym]; return a ? { last: a.last, chg1d: a.chg1d } : null; }
  const s = BY.get(p.sym); return s ? { last: s.last, chg1d: s.chg1d, s } : null;
}
function pfRows() {
  return state.portfolio.map(p => {
    const c = pfCalc(p), q = pfQuote(p), value = q && c.qty ? q.last * c.qty : (c.qty ? null : 0);
    const pl = value != null ? value - c.cost : null;
    const day = q && ok(q.chg1d) && c.qty ? value - value / (1 + q.chg1d) : 0;
    return { p, c, q, s: q?.s, value, pl, plPct: pl != null && c.cost ? pl / c.cost : null, day, open: c.qty > 0 };
  });
}
// Trend pozisyonunda çıkış uyarıları: güçlüler "Çıkış sinyali", zayıflar "Dikkat"
function exitSignals(s) {
  const strong = [], weak = [];
  if (s.stTrend === 'down') strong.push(s.stFlip === 'down' ? 'Supertrend yeni döndü (sat)' : 'Supertrend sat');
  if (s.macdCross === 'down') strong.push('MACD sat kesişimi');
  if (s.trend === 'down') strong.push('Fiyat < SMA50 < SMA200');
  if (s.fisherCross === 'down') weak.push('Fisher sat kesişimi');
  if (s.vsSma20 < 0) weak.push('SMA20 altında');
  if (s.rsi > 70) weak.push('RSI aşırı alım');
  if (s.tkCross === 'down') weak.push('Tenkan/Kijun sat');
  return { strong, weak };
}
const qtyFmt = q => Number.isInteger(q) ? F0.format(q) : F2.format(q);
const signed = x => !ok(x) ? '—' : (x > 0 ? '+' : '') + fmt.big(x);

/* --- TL nakit akışı ---
   TL bakiye = Emtia / İtibari'deki "Türk lirası" pozisyonu. Bir alım TL'den fonlanırsa ya da bir satışın geliri
   TL'ye aktarılırsa, nakit pozisyonunda karşılık işlemi oluşur. İki işlem birbirine bağlıdır (link) ve birlikte silinir.
   flow: 'cash' = TL bakiyeden/TL bakiyeye, 'ext' (ya da boş) = portföy dışından/dışına. */
const isCash = p => p?.cat === 'emtia' && p?.sym === 'TRY';
const CASH = () => state.portfolio.find(isCash);
function ensureCash() {
  let c = CASH();
  if (!c) { c = { id: pfId(), cat: 'emtia', sym: 'TRY', note: null, txs: [] }; state.portfolio.push(c); }
  return c;
}
const cashBal = () => { const c = CASH(); return c ? pfCalc(c).qty : 0; };
const txAmount = t => t.type === 'buy' ? t.qty * t.price + (t.fee || 0) : t.qty * t.price - (t.fee || 0);
const tl = x => fmt.big(x) + ' ₺';
// İşlemi uygular; sorun varsa açıklama metni döner (hiçbir şey değişmez), yoksa null.
function applyTx(p, tx, flow) {
  const own = pfCalc(p, tx);
  if (own.oversold) return `${own.oversold.date ? fmt.date(own.oversold.date) : 'Bu'} tarihinde elinizde ${qtyFmt(own.oversold.have)} ${unitOf(p)} var; daha fazlası satılamaz.`;
  if (isCash(p) || flow !== 'cash') { if (!isCash(p)) tx.flow = 'ext'; p.txs.push(tx); return null; }
  const amount = txAmount(tx);
  const ctx = { id: pfId(), type: tx.type === 'buy' ? 'sell' : 'buy', date: tx.date, qty: amount, price: 1, fee: 0, link: tx.id, src: p.id };
  if (tx.type === 'buy') {
    const cash = CASH(), cc = cash ? pfCalc(cash, ctx) : { oversold: { have: 0, date: tx.date } };
    if (cc.oversold) return `TL bakiye yetersiz: ${cc.oversold.date ? fmt.date(cc.oversold.date) + ' tarihinde ' : ''}${tl(cc.oversold.have)} var, ${tl(amount)} gerekiyor. "Dışarıdan" seçin ya da önce para yatırın.`;
  } else if (amount <= 0) return 'Komisyon satış tutarından büyük olamaz.';
  tx.flow = 'cash'; tx.link = ctx.id;
  p.txs.push(tx); ensureCash().txs.push(ctx);
  return null;
}
// İşlemi (ve TL'deki karşılığını) siler; sorun varsa açıklama döner.
function removeTx(p, tid) {
  const t = p.txs.find(x => x.id === tid);
  if (!t) return null;
  if (t.src) { const sp = state.portfolio.find(x => x.id === t.src); return `Bu kayıt ${sp ? assetName(sp) : 'başka bir'} işleminden otomatik oluştu; o işlemi silin.`; }
  const plan = [[p, p.txs.filter(x => x.id !== tid)]];
  const cash = CASH();
  if (t.link && cash && cash !== p) plan.push([cash, cash.txs.filter(x => x.id !== t.link)]);
  for (const [pos, txs] of plan) {
    const c = pfCalc({ ...pos, txs });
    if (c.oversold) return isCash(pos)
      ? `Bu işlem silinirse TL bakiye ${c.oversold.date ? fmt.date(c.oversold.date) + ' tarihinde ' : ''}eksiye düşer (sonraki alımlar bu parayla yapılmış). Önce o alımları silin.`
      : `Bu işlem silinirse ${c.oversold.date ? fmt.date(c.oversold.date) + ' tarihli ' : ''}satış elde olandan fazla olur. Önce o satışı silin.`;
  }
  for (const [pos, txs] of plan) pos.txs = txs;
  return null;
}
function removePosition(pid) {
  const p = state.portfolio.find(x => x.id === pid);
  if (!p) return null;
  if (isCash(p) && p.txs.some(t => t.src)) return 'TL bakiyede başka varlıkların alım/satımından gelen kayıtlar var. Önce o işlemleri silin.';
  const cash = CASH();
  if (cash && !isCash(p)) {
    const txs = cash.txs.filter(t => t.src !== p.id), c = pfCalc({ ...cash, txs });
    if (c.oversold) return `${assetName(p)} silinirse TL bakiye eksiye düşer (satış gelirleri başka alımlarda kullanılmış). Önce o alımları silin.`;
    cash.txs = txs;
  }
  state.portfolio = state.portfolio.filter(x => x.id !== pid);
  return null;
}
// Portföye dışarıdan giren (+) ve çıkan (−) para: net yatırılan
function netInvested() {
  let net = 0;
  for (const p of state.portfolio) for (const t of p.txs) {
    if (isCash(p)) { if (!t.src) net += t.type === 'buy' ? t.qty : -t.qty; continue; }
    if (t.flow === 'cash') continue;
    net += t.type === 'buy' ? txAmount(t) : -txAmount(t);
  }
  return net;
}

function alertMsg(text) {
  const el = document.createElement('div'); el.className = 'updatebar'; el.textContent = text; el.setAttribute('role', 'alert');
  document.body.appendChild(el); setTimeout(() => el.remove(), 5000);
}

function renderPortfolio() {
  destroyCharts();
  document.title = 'Portföy · Tahta';
  const all = pfRows(), rows = all.filter(r => r.open), closed = all.filter(r => !r.open && r.c.txs.length);
  const tot = rows.reduce((a, r) => ({ value: a.value + (r.value || 0), cost: a.cost + r.c.cost, day: a.day + (r.day || 0) }), { value: 0, cost: 0, day: 0 });
  const unreal = tot.value - tot.cost, realized = all.reduce((a, r) => a + r.c.realized, 0), inv = netInvested();
  const divYear = rows.filter(r => r.s && !isAsset(r.p)).reduce((a, r) => a + (r.s.divTtm || 0) * r.c.qty, 0);
  const byCat = Object.fromEntries(Object.keys(PF_CATS).map(c => [c, rows.filter(r => r.p.cat === c)]));
  const catVal = c => byCat[c].reduce((a, r) => a + (r.value || 0), 0);
  const share = r => tot.value ? (r.value || 0) / tot.value : null;

  const actions = r => `<td class="txt act">
    <button type="button" class="ic buy" data-pftx="buy:${r.p.id}" title="${isCash(r.p) ? 'Para yatır' : 'Alım ekle'}">${isCash(r.p) ? 'Yatır' : 'Al'}</button>
    <button type="button" class="ic sell" data-pftx="sell:${r.p.id}" title="${isCash(r.p) ? 'Para çek' : 'Satış ekle'}">${isCash(r.p) ? 'Çek' : 'Sat'}</button>
    <button type="button" class="ic" data-pfhist="${r.p.id}" aria-expanded="${pfHist.has(r.p.id)}" title="İşlem geçmişi">İşlemler <span class="muted">${r.c.txs.length}</span></button>
    <button type="button" class="ic" data-pfedit="${r.p.id}" aria-label="Kategori / not düzenle">✎</button>
    <button type="button" class="ic${pfDelArmed === r.p.id ? ' armed' : ''}" data-pfdel="${r.p.id}" aria-label="Pozisyonu sil">${pfDelArmed === r.p.id ? 'Sil?' : '×'}</button></td>`;
  const name = r => isAsset(r.p) ? `<span class="code">${assetName(r.p)}</span>` : `<span class="code">${r.p.sym}</span>${r.s ? tedbirIcon(r.s) : ' <span class="muted">(veri yok)</span>'}`;
  const note = r => r.p.note ? `<span class="nm">${esc(r.p.note)}</span>` : '';
  const common = r => `<td>${qtyFmt(r.c.qty)}</td><td>${fmt.price(r.c.avg)}</td><td>${r.q ? fmt.price(r.q.last) : '—'}</td><td>${r.value != null ? fmt.big(r.value) : '—'}</td>
    <td class="${cls(r.pl)}">${signed(r.pl)}</td><td class="${cls(r.plPct)}">${fmt.pct(r.plPct)}</td><td>${fmt.pctPlain(share(r))}</td>`;
  const commonHead = (q = 'Adet') => `<th>${q}</th><th title="Birim başına ortalama maliyet (₺), komisyon dahil">Ort. maliyet</th><th>Fiyat</th><th>Değer ₺</th><th>K/Z ₺</th><th>K/Z %</th><th title="Portföy içindeki payı">Pay</th>`;
  const histRow = (r, cols) => !pfHist.has(r.p.id) ? '' : `<tr class="txrow"><td colspan="${cols}">${txTable(r)}</td></tr>`;

  const tables = {
    temettu: list => `<table class="grid"><thead><tr><th class="tk">Hisse</th>${commonHead()}<th title="Son 12 ay temettü / güncel fiyat">12A verim</th><th title="Son 12 ay temettü / ortalama maliyet">Maliyete göre</th><th title="Son 12 ayın temettüsü × adet (brüt)">Yıllık temettü ₺</th><th>Sıradaki temettü</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr data-t="${r.p.sym}"><td class="tk">${name(r)}${note(r)}</td>${common(r)}
        <td>${fmt.pctPlain(r.s?.divYield)}</td><td>${r.s?.divTtm && r.c.avg ? fmt.pctPlain(r.s.divTtm / r.c.avg) : '—'}</td><td>${r.s?.divTtm ? fmt.big(r.s.divTtm * r.c.qty) : '—'}</td>
        <td class="txt">${r.s?.divUpcoming?.length ? `${r.s.nextDivDate ? `<span class="chip up">${fmt.date(r.s.nextDivDate)}</span>` : '<span class="chip warn">Tarih bekleniyor</span>'} <span class="num">${fmt.big(r.s.nextDivNet * r.c.qty)} ₺ net</span>` : '<span class="muted">—</span>'}</td>${actions(r)}</tr>${histRow(r, 13)}`).join('')}
    </tbody></table>`,
    trend: list => `<table class="grid"><thead><tr><th class="tk">Hisse</th>${commonHead()}<th>Durum</th><th>Supertrend</th><th>Trend</th><th>RSI</th><th title="Supertrend çizgisi: olası stop seviyesi">ST stop</th><th></th></tr></thead><tbody>
      ${list.map(r => {
        const s = r.s, sig = s ? exitSignals(s) : { strong: [], weak: [] };
        const status = !s ? '—' : sig.strong.length ? `<span class="chip down" title="${esc([...sig.strong, ...sig.weak].join(' · '))}">Çıkış sinyali</span> <small class="muted">${esc(sig.strong[0])}</small>`
          : sig.weak.length ? `<span class="chip warn" title="${esc(sig.weak.join(' · '))}">Dikkat</span> <small class="muted">${esc(sig.weak[0])}</small>` : '<span class="chip up">Trend sürüyor</span>';
        return `<tr data-t="${r.p.sym}" class="${sig.strong.length ? 'exit' : ''}"><td class="tk">${name(r)}${note(r)}</td>${common(r)}
          <td class="txt">${status}</td><td class="txt">${s?.stTrend ? `<span class="chip ${ST[s.stTrend][1]}">${ST[s.stTrend][0]}</span>` : '—'}</td>
          <td class="txt">${s?.trend ? `<span class="chip ${TREND[s.trend][1]}">${TREND[s.trend][0]}</span>` : '—'}</td><td>${fmt.num(s?.rsi)}</td>
          <td>${s && ok(s.stDist) ? fmt.price(s.last / (1 + s.stDist)) : '—'}</td>${actions(r)}</tr>${histRow(r, 14)}`;
      }).join('')}
    </tbody></table>`,
    emtia: list => `<table class="grid"><thead><tr><th class="tk">Varlık</th>${commonHead('Miktar')}<th>Gün</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr><td class="tk">${name(r)}${note(r)}</td>${common(r)}<td class="${cls(r.q?.chg1d)}">${fmt.pct(r.q?.chg1d)}</td>${actions(r)}</tr>${histRow(r, 10)}`).join('')}
    </tbody></table>`,
  };

  view.innerHTML = `
  <section class="dhead">
    <div><h1>Portföy</h1><p class="sub">Veriler yalnızca bu cihazda saklanır; başka cihaza <a href="#/aktar">Aktar</a> ile taşıyabilirsiniz.</p></div>
    <div class="row"><button type="button" class="btn" data-cashflow="buy">± Para yatır / çek</button><button type="button" class="btn primary" data-pfadd="temettu">+ Varlık ekle</button></div>
  </section>
  ${pfForm ? pfFormHtml() : ''}
  ${txForm ? txFormHtml() : ''}
  ${all.length ? `
  <div class="pfsum">
    <div class="ret"><span>Toplam değer</span><b>${fmt.big(tot.value)} ₺</b></div>
    <div class="ret"><span title="Emtia / İtibari'deki Türk lirası bakiyesi">Nakit (TL)</span><b>${tl(cashBal())}</b></div>
    <div class="ret"><span title="Dışarıdan yatırılan − dışarı çekilen para">Net yatırılan</span><b>${tl(inv)}</b></div>
    <div class="ret"><span title="Toplam değer − net yatırılan (gerçekleşen ve açık K/Z birlikte; temettüler TL bakiyeye girildiyse dahil)">Toplam getiri</span><b class="${cls(tot.value - inv)}">${signed(tot.value - inv)} ₺ · ${fmt.pct(inv > 0 ? (tot.value - inv) / inv : null)}</b></div>
    <div class="ret"><span title="Açık pozisyonların ortalama maliyet × adet toplamı">Maliyet</span><b>${fmt.big(tot.cost)} ₺</b></div>
    <div class="ret"><span title="Elde tutulan varlıkların kâr/zararı">Açık K/Z</span><b class="${cls(unreal)}">${signed(unreal)} ₺ · ${fmt.pct(tot.cost ? unreal / tot.cost : null)}</b></div>
    <div class="ret"><span title="Satışlardan gerçekleşen kâr/zarar (ortalama maliyet yöntemi, komisyon dahil)">Gerçekleşen K/Z</span><b class="${cls(realized)}">${signed(realized)} ₺</b></div>
    <div class="ret"><span>Bugün</span><b class="${cls(tot.day)}">${signed(tot.day)} ₺ · ${fmt.pct(tot.value - tot.day ? tot.day / (tot.value - tot.day) : null)}</b></div>
    <div class="ret"><span title="Hisselerin son 12 ay temettüsü × adet (brüt)">Yıllık temettü</span><b>${fmt.big(divYear)} ₺ · ${fmt.pctPlain(tot.value ? divYear / tot.value : null)}</b></div>
  </div>
  ${tot.value ? `<div class="alloc" aria-label="Kategori dağılımı">
    <div class="bar">${Object.entries(PF_CATS).map(([c, d]) => { const v = catVal(c); return v > 0 ? `<i style="width:${v / tot.value * 100}%;background:var(${d.color})" title="${d.label}"></i>` : ''; }).join('')}</div>
    <div class="legend2">${Object.entries(PF_CATS).filter(([c]) => catVal(c) > 0).map(([c, d]) => `<span><i style="background:var(${d.color})"></i>${d.label} <b class="num">${fmt.pctPlain(catVal(c) / tot.value)}</b> <span class="muted num">${fmt.big(catVal(c))} ₺</span></span>`).join('')}</div>
  </div>` : ''}` : `<p class="empty">Portföyünüz boş. "+ Varlık ekle" ile başlayın ya da bir hisse sayfasındaki "+ Portföye ekle" düğmesini kullanın.</p>`}
  ${Object.entries(PF_CATS).filter(([c]) => byCat[c].length).map(([c, d]) => `
  <section class="panel pfcat">
    <h2><i style="background:var(${d.color})"></i>${d.label} <span class="muted">· ${byCat[c].length} varlık · ${fmt.big(catVal(c))} ₺</span>
      <button type="button" class="btn ghost" data-pfadd="${c}">+ Ekle</button></h2>
    <div class="tablewrap flat">${tables[c](byCat[c].sort((a, b) => (b.value || 0) - (a.value || 0)))}</div>
  </section>`).join('')}
  ${closed.length ? `
  <section class="panel pfcat">
    <h2>Kapanan pozisyonlar <span class="muted">· tamamı satılanlar</span></h2>
    <div class="tablewrap flat"><table class="grid"><thead><tr><th class="tk">Varlık</th><th>Kategori</th><th>Alınan</th><th>Satılan</th><th>Gerçekleşen K/Z ₺</th><th>Son satış</th><th></th></tr></thead><tbody>
      ${closed.map(r => `<tr${isAsset(r.p) ? '' : ` data-t="${r.p.sym}"`}><td class="tk"><span class="code">${assetName(r.p)}</span>${note(r)}</td><td class="txt">${PF_CATS[r.p.cat].label}</td>
        <td>${qtyFmt(r.c.bought)}</td><td>${qtyFmt(r.c.sold)}</td><td class="${cls(r.c.realized)}">${signed(r.c.realized)}</td><td>${fmt.date(r.c.lastSell)}</td>
        <td class="txt act"><button type="button" class="ic buy" data-pftx="buy:${r.p.id}" title="Yeniden al">Al</button>
          <button type="button" class="ic" data-pfhist="${r.p.id}" aria-expanded="${pfHist.has(r.p.id)}">İşlemler <span class="muted">${r.c.txs.length}</span></button>
          <button type="button" class="ic${pfDelArmed === r.p.id ? ' armed' : ''}" data-pfdel="${r.p.id}" aria-label="Sil">${pfDelArmed === r.p.id ? 'Sil?' : '×'}</button></td></tr>${histRow(r, 7)}`).join('')}
    </tbody></table></div>
  </section>` : ''}
  <p class="muted" style="font-size:12px">Fiyatlar gecikmelidir. Gerçekleşen K/Z ortalama maliyet yöntemiyle hesaplanır; temettüler dahil değildir. Altın ve gümüş gram fiyatı uluslararası ons fiyatı × dolar kurundan hesaplanır; Kapalıçarşı ve banka fiyatlarından farklı olabilir.</p>`;
}

const txLabel = (p, t) => isCash(p) ? (t.src ? (t.type === 'buy' ? 'Satış geliri' : 'Alım ödemesi') : (t.type === 'buy' ? 'Yatırma' : 'Çekme')) : (t.type === 'buy' ? 'Alım' : 'Satış');
function txFlowNote(p, t) {
  if (isCash(p)) { const sp = t.src && state.portfolio.find(x => x.id === t.src); return sp ? ` <small class="muted">${esc(assetName(sp))}</small>` : ''; }
  return t.flow === 'cash' ? ` <small class="muted">${t.type === 'buy' ? 'TL bakiyeden' : '→ TL bakiye'}</small>` : '';
}
function txTable(r) {
  const u = unitOf(r.p);
  // Her satışın o anki gerçekleşen K/Z'si için sırayla yeniden hesapla
  let qty = 0, cost = 0;
  const lines = r.c.txs.map(t => {
    let res = null;
    if (t.type === 'buy') { qty += t.qty; cost += t.qty * t.price + (t.fee || 0); }
    else { const q = Math.min(t.qty, qty), avg = qty ? cost / qty : 0; res = q * t.price - (t.fee || 0) - q * avg; cost -= q * avg; qty -= q; }
    return { t, res, after: qty };
  });
  return `<div class="txbox"><table class="grid mini"><thead><tr><th class="tk">Tarih</th><th>İşlem</th><th>Miktar</th><th>Fiyat ₺</th><th>Komisyon ₺</th><th>Tutar ₺</th><th title="Satışta gerçekleşen kâr/zarar">K/Z ₺</th><th>Sonra elde</th><th></th></tr></thead><tbody>
    ${lines.slice().reverse().map(({ t, res, after }) => `<tr><td class="tk">${t.date ? fmt.date(t.date) : '<span class="muted">tarihsiz</span>'}</td>
      <td class="txt"><span class="chip ${t.type === 'buy' ? 'up' : 'down'}">${txLabel(r.p, t)}</span>${txFlowNote(r.p, t)}</td>
      <td>${qtyFmt(t.qty)} <span class="muted">${u}</span></td><td>${fmt.price(t.price)}</td><td>${t.fee ? fmt.price(t.fee) : '—'}</td><td>${fmt.big(t.qty * t.price)}</td>
      <td class="${cls(res)}">${res == null ? '—' : signed(res)}</td><td>${qtyFmt(after)}</td>
      <td class="txt act">${t.src ? '<span class="muted" title="Otomatik oluştu; kaynak işlemi silin">🔗</span>' : `<button type="button" class="ic${pfDelArmed === t.id ? ' armed' : ''}" data-txdel="${r.p.id}:${t.id}" aria-label="İşlemi sil">${pfDelArmed === t.id ? 'Sil?' : '×'}</button>`}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function pfFormHtml() {
  const f = pfForm, asset = f.cat === 'emtia', edit = !!f.id;
  const cats = edit ? Object.entries(PF_CATS).filter(([c]) => (c === 'emtia') === asset) : Object.entries(PF_CATS);
  return `<form class="panel pfform" id="pfForm">
    <h2>${edit ? `${esc(assetName(f))} · kategori ve not` : 'Varlık ekle'}</h2>
    ${cats.length > 1 ? `<div class="seg" role="radiogroup" aria-label="Kategori">${cats.map(([c, d]) => `<button type="button" data-pfcat="${c}" aria-pressed="${f.cat === c}" title="${esc(d.hint)}">${d.label}</button>`).join('')}</div>
    <p class="muted" style="font-size:12px;margin:0">${esc(PF_CATS[f.cat].hint)}</p>` : ''}
    <div class="pfgrid">
      ${edit ? '' : asset
        ? `<label>Varlık<select id="pfSym" class="btn">${Object.entries(ASSETS).map(([k, a]) => `<option value="${k}"${k === f.sym ? ' selected' : ''}>${a.name}</option>`).join('')}</select></label>`
        : `<label>Hisse kodu<input id="pfSym" list="tickerList" value="${esc(f.sym || '')}" placeholder="ör. TUPRS" autocapitalize="characters" autocomplete="off" required></label>`}
      ${edit ? '' : `<label>${asset ? (ASSETS[f.sym]?.qtyLabel || 'Miktar') : 'Adet'}<input id="pfQty" inputmode="decimal" value="${esc(f.qty ?? '')}" required></label>
      ${asset && f.sym === 'TRY' ? '' : `<label>Alış fiyatı (₺ / ${asset ? ASSETS[f.sym]?.unit : 'hisse'})<input id="pfCost" inputmode="decimal" value="${esc(f.cost ?? '')}" required></label>`}
      <label>Alış tarihi<input id="pfDate" type="date" value="${f.date || ''}"></label>
      <label>Komisyon (₺) <small class="muted">(isteğe bağlı)</small><input id="pfFee" inputmode="decimal" value="${esc(f.fee ?? '')}"></label>
      ${asset && f.sym === 'TRY' ? '' : (sell => `<label>${sell ? 'Satış geliri' : 'Para nereden?'}<select id="pfFlow" class="btn">
        ${sell ? `<option value="cash"${f.flow !== 'ext' ? ' selected' : ''}>TL bakiyeye ekle</option><option value="ext"${f.flow === 'ext' ? ' selected' : ''}>Portföy dışına (çekildi)</option>`
               : `<option value="cash"${f.flow === 'cash' ? ' selected' : ''}>TL bakiyeden (${tl(cashBal())})</option><option value="ext"${f.flow !== 'cash' ? ' selected' : ''}>Dışarıdan (yeni para)</option>`}</select></label>`)(false)}`}
      <label class="wide">Not <small class="muted">(isteğe bağlı)</small><input id="pfNote" maxlength="80" value="${esc(f.note || '')}"></label>
    </div>
    ${edit ? '' : '<p class="muted" style="font-size:12px;margin:0">Aynı kategoride bu varlık zaten varsa yeni alım olarak eklenir ve ortalama maliyet güncellenir.</p>'}
    <div class="row"><button class="btn primary">${edit ? 'Kaydet' : 'Ekle'}</button><button type="button" class="btn" data-pfcancel="1">İptal</button><span id="pfMsg" class="down" role="status"></span></div>
  </form>`;
}
function txPreview(f) {
  const q = num(f.qty), pr = num(f.price), fee = f.fee ? num(f.fee) : 0;
  if (!(q > 0) || !(pr > 0)) return 'Tutar, miktar ve fiyat girilince hesaplanır.';
  const amt = f.type === 'buy' ? q * pr + (fee || 0) : q * pr - (fee || 0);
  return f.type === 'buy' ? `Ödenecek: <b>${tl(amt)}</b>${fee ? ' (komisyon dahil)' : ''}${f.flow === 'cash' ? ` · alım sonrası TL bakiye: ${tl(cashBal() - amt)}` : ''}`
                          : `Elinize geçecek: <b>${tl(amt)}</b>${fee ? ' (komisyon düşülmüş)' : ''}${f.flow !== 'ext' ? ` · satış sonrası TL bakiye: ${tl(cashBal() + amt)}` : ''}`;
}
function txFormHtml() {
  const f = txForm, p = state.portfolio.find(x => x.id === f.pid);
  if (!p) return '';
  const c = pfCalc(p), sell = f.type === 'sell', u = unitOf(p), fixed = isAsset(p) && p.sym === 'TRY';
  return `<form class="panel pfform ${sell ? 'sellform' : ''}" id="txForm">
    <h2>${fixed ? 'TL bakiye · para yatır / çek' : `${esc(assetName(p))} · ${sell ? 'Satış' : 'Alım'}`} <span class="muted">· ${fixed ? `bakiye ${tl(c.qty)}` : `elde ${qtyFmt(c.qty)} ${u}${c.qty ? `, ort. maliyet ${fmt.price(c.avg)} ₺` : ''}`}</span></h2>
    <div class="seg" role="radiogroup" aria-label="İşlem türü"><button type="button" data-txtype="buy" aria-pressed="${!sell}">${fixed ? 'Para yatır' : 'Alım'}</button><button type="button" data-txtype="sell" aria-pressed="${sell}">${fixed ? 'Para çek' : 'Satış'}</button></div>
    <div class="pfgrid">
      <label>Tarih<input id="txDate" type="date" value="${f.date || ''}" required></label>
      <label>${isAsset(p) ? (ASSETS[p.sym]?.qtyLabel || 'Miktar') : 'Adet'}${sell && c.qty ? ` <button type="button" class="linkbtn" data-txall="1">tümü (${qtyFmt(c.qty)})</button>` : ''}<input id="txQty" inputmode="decimal" value="${esc(f.qty ?? '')}" required></label>
      ${fixed ? '' : `<label>${sell ? 'Satış' : 'Alış'} fiyatı (₺ / ${isAsset(p) ? u : 'hisse'})<input id="txPrice" inputmode="decimal" value="${esc(f.price ?? '')}" required></label>`}
      ${fixed ? '' : `<label>Komisyon (₺) <small class="muted">(isteğe bağlı)</small><input id="txFee" inputmode="decimal" value="${esc(f.fee ?? '')}"></label>
      <label>${sell ? 'Satış geliri' : 'Para nereden?'}<select id="txFlow" class="btn">
        ${sell ? `<option value="cash"${f.flow !== 'ext' ? ' selected' : ''}>TL bakiyeye ekle</option><option value="ext"${f.flow === 'ext' ? ' selected' : ''}>Portföy dışına (çekildi)</option>`
               : `<option value="cash"${f.flow === 'cash' ? ' selected' : ''}>TL bakiyeden (${tl(cashBal())})</option><option value="ext"${f.flow !== 'cash' ? ' selected' : ''}>Dışarıdan (yeni para)</option>`}</select></label>`}
    </div>
    ${fixed ? '' : `<p class="muted" id="txAmt" style="font-size:12px;margin:0">${txPreview(f)}</p>`}
    <div class="row"><button class="btn primary">${fixed ? (sell ? 'Çekimi kaydet' : 'Yatırmayı kaydet') : sell ? 'Satışı kaydet' : 'Alımı kaydet'}</button><button type="button" class="btn" data-txcancel="1">İptal</button><span id="txMsg" class="down" role="status"></span></div>
  </form>`;
}
// Türkçe sayı girişi: "1.234,56" / "1234,56" / "1.000" (binlik) / "4.95" (virgül yoksa ve noktadan sonra 3 hane değilse ondalık)
const num = v => {
  let t = String(v ?? '').trim().replace(/\s/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const x = parseFloat(t);
  return Number.isFinite(x) ? x : NaN;
};
const trNum = x => String(+x.toFixed(4)).replace('.', ',');
function pfReadForm() {
  if (!pfForm || !$('#pfForm')) return;
  for (const [k, id] of [['sym', 'pfSym'], ['qty', 'pfQty'], ['cost', 'pfCost'], ['date', 'pfDate'], ['fee', 'pfFee'], ['note', 'pfNote'], ['flow', 'pfFlow']]) {
    const el = $('#' + id);
    if (el) pfForm[k] = k === 'sym' ? el.value.trim().toUpperCase() : el.value;
  }
}
function txReadForm() {
  if (!txForm || !$('#txForm')) return;
  for (const [k, id] of [['date', 'txDate'], ['qty', 'txQty'], ['price', 'txPrice'], ['fee', 'txFee'], ['flow', 'txFlow']]) { const el = $('#' + id); if (el) txForm[k] = el.value; }
}
const currentPrice = p => { const q = pfQuote(p); return q ? trNum(q.last) : ''; };
function pfOpen(cat, sym) {
  txForm = null;
  pfForm = { cat, sym: sym || (cat === 'emtia' ? 'XAU' : ''), qty: '', cost: '', date: todayIso(), fee: '', note: '', flow: cashBal() > 0 ? 'cash' : 'ext' };
  if (pfForm.sym) pfForm.cost = currentPrice(pfForm);
}
function txOpen(type, pid) {
  pfForm = null;
  const p = state.portfolio.find(x => x.id === pid);
  txForm = { pid, type, date: todayIso(), qty: '', price: p ? currentPrice(p) : '', fee: '', flow: type === 'sell' || cashBal() > 0 ? 'cash' : 'ext' };
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
    state.sort = state.sort.key === d.sort ? { key: d.sort, dir: -state.sort.dir } : { key: d.sort, dir: ['t', '_sector', '_idx', '_nextDiv'].includes(d.sort) ? 1 : -1 };
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
      let pAdded = 0;
      for (const pos of d2.p) { const i = state.portfolio.findIndex(x => x.id === pos.id); if (i >= 0) state.portfolio[i] = pos; else { state.portfolio.push(pos); pAdded++; } }
      persist();
      msg.className = 'up';
      msg.textContent = `${state.watch.length - before} yeni izleme hissesi, ${d2.s.length} tarama ve ${pAdded} portföy varlığı eklendi (${d2.p.length - pAdded} güncellendi).`;
      if (location.hash.startsWith('#/aktar/')) history.replaceState(null, '', '#/aktar');
    } catch (e) {
      msg.className = 'down';
      msg.textContent = e.message.startsWith('Kod') ? e.message : 'Kod okunamadı. Eksik ya da bozuk kopyalanmış olabilir.';
    }
    return;
  }
  if (d.mstoggle) {
    const was = msOpen === d.mstoggle;
    closeMs();
    if (!was) {
      msOpen = d.mstoggle;
      const m = b.closest('.ms'), panel = m.querySelector('.ms-panel');
      panel.style.left = ''; panel.hidden = false; b.setAttribute('aria-expanded', 'true');
      // Ekrana sığmıyorsa sola kaydır
      const r = panel.getBoundingClientRect(), over = r.right - (document.documentElement.clientWidth - 8);
      if (over > 0) panel.style.left = `${-Math.min(over, r.left - 8)}px`;
      m.querySelector('.ms-q')?.focus();
    }
    return;
  }
  if (d.msclear) { state[d.msclear] = []; persist(); b.closest('.ms').querySelectorAll('input[type=checkbox]').forEach(c => { c.checked = false; }); refreshResults(); return; }
  if (d.msclose) { closeMs(); return; }
  // Portföy
  if (d.pfaddsym) { pfOpen('temettu', d.pfaddsym); pfDelArmed = null; location.hash = '#/portfoy'; return; }
  if (d.pfadd) { pfOpen(d.pfadd); pfDelArmed = null; renderPortfolio(); window.scrollTo(0, 0); $('#pfSym')?.focus(); return; }
  if (d.pfcat) {
    pfReadForm();
    const wasAsset = pfForm.cat === 'emtia', nowAsset = d.pfcat === 'emtia';
    pfForm.cat = d.pfcat;
    if (!pfForm.id && wasAsset !== nowAsset) { pfForm.sym = nowAsset ? 'XAU' : ''; pfForm.cost = nowAsset ? currentPrice(pfForm) : ''; }
    renderPortfolio(); return;
  }
  if (d.pfcancel) { pfForm = null; renderPortfolio(); return; }
  if (d.pfedit) {
    const p = state.portfolio.find(x => x.id === d.pfedit);
    if (p) { txForm = null; pfForm = { id: p.id, cat: p.cat, sym: p.sym, note: p.note || '' }; }
    pfDelArmed = null; renderPortfolio(); window.scrollTo(0, 0); return;
  }
  if (d.pftx) { const [type, pid] = d.pftx.split(':'); txOpen(type, pid); pfDelArmed = null; renderPortfolio(); window.scrollTo(0, 0); $('#txQty')?.focus(); return; }
  if (d.txtype) { txReadForm(); if (txForm.type !== d.txtype) txForm.flow = d.txtype === 'sell' || cashBal() > 0 ? 'cash' : 'ext'; txForm.type = d.txtype; renderPortfolio(); return; }
  if (d.txall) { txReadForm(); const p = state.portfolio.find(x => x.id === txForm.pid); txForm.qty = trNum(pfCalc(p).qty); renderPortfolio(); return; }
  if (d.txcancel) { txForm = null; const c = CASH(); if (c && !c.txs.length) state.portfolio = state.portfolio.filter(x => x !== c); renderPortfolio(); return; }
  if (d.pfhist) { pfHist.has(d.pfhist) ? pfHist.delete(d.pfhist) : pfHist.add(d.pfhist); pfDelArmed = null; renderPortfolio(); return; }
  if (d.cashflow) { ensureCash(); txOpen(d.cashflow, CASH().id); pfDelArmed = null; renderPortfolio(); window.scrollTo(0, 0); $('#txQty')?.focus(); return; }
  if (d.pfdel) {
    if (pfDelArmed !== d.pfdel) { pfDelArmed = d.pfdel; renderPortfolio(); return; } // ilk dokunuş: onay iste
    const err = removePosition(d.pfdel); pfDelArmed = null;
    if (err) { renderPortfolio(); alertMsg(err); return; }
    persist(); renderPortfolio(); return;
  }
  if (d.txdel) {
    const [pid, tid] = d.txdel.split(':');
    if (pfDelArmed !== tid) { pfDelArmed = tid; renderPortfolio(); return; }
    const p = state.portfolio.find(x => x.id === pid), err = p ? removeTx(p, tid) : null; pfDelArmed = null;
    if (err) { renderPortfolio(); alertMsg(err); return; }
    persist(); renderPortfolio(); return;
  }
  if (b.id === 'saveBtn') { savingOpen = true; renderScreener(); $('#saveName')?.focus(); return; }
  if (d.cancelsave) { savingOpen = false; renderScreener(); return; }
  if (d.load != null) {
    const sv = state.saved[+d.load];
    if (sv) Object.assign(state, { preset: sv.preset, index: sv.index, markets: listOf(sv, 'market'), sectors: listOf(sv, 'sector'), view: VIEWS[sv.view] ? sv.view : state.view,
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
  if (e.target.id === 'indexSel') { state.index = e.target.value; persist(); renderScreener(); return; }
  const ms = e.target.closest('.ms');
  if (ms && e.target.type === 'checkbox') {
    const k = ms.dataset.ms, v = e.target.value;
    state[k] = e.target.checked ? [...new Set([...state[k], v])] : state[k].filter(x => x !== v);
    persist(); refreshResults(); return;
  }
  if (e.target.id === 'txFlow') { txReadForm(); const el = $('#txAmt'); if (el) el.innerHTML = txPreview(txForm); return; }
  if (e.target.id === 'pfSym' && pfForm?.cat === 'emtia') { pfReadForm(); pfForm.cost = pfForm.sym === 'TRY' ? '' : currentPrice(pfForm); renderPortfolio(); return; }
  if (e.target.id === 'hideTedbir') { state.hideTedbir = e.target.checked; persist(); renderScreener(); return; }
  const row = e.target.closest('.frow');
  if (!row) return;
  const f = state.filters[+row.dataset.i];
  f[e.target.dataset.f] = e.target.value;
  persist(); renderScreener();
});
// Değer yazarken anında süz (odak kaybolmasın diye yalnızca tablo ve sayaç yenilenir)
view.addEventListener('input', e => {
  if (e.target.closest?.('#txForm')) { txReadForm(); const el = $('#txAmt'); if (el) el.innerHTML = txPreview(txForm); }
  if (e.target.classList.contains('ms-q')) {
    const q = e.target.value.trim().toLocaleLowerCase('tr');
    e.target.closest('.ms').querySelectorAll('.ms-list label').forEach(l => { l.hidden = q && !l.textContent.toLocaleLowerCase('tr').includes(q); });
    return;
  }
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
  if (e.target.id === 'pfForm') {
    e.preventDefault(); pfReadForm();
    const f = pfForm, asset = f.cat === 'emtia', msg = $('#pfMsg');
    if (f.id) { // yalnızca kategori ve not
      const p = state.portfolio.find(x => x.id === f.id);
      if (p) { p.cat = f.cat; p.note = (f.note || '').trim() || null; }
      pfForm = null; persist(); renderPortfolio(); return;
    }
    const cash = asset && f.sym === 'TRY';
    const qty = num(f.qty), price = cash ? 1 : num(f.cost), fee = f.fee ? num(f.fee) : 0;
    if (!asset && !BY.has(f.sym)) { msg.textContent = `"${f.sym}" kodunda hisse bulunamadı.`; return; }
    if (!(qty > 0)) { msg.textContent = 'Miktar sıfırdan büyük bir sayı olmalı.'; return; }
    if (!(price > 0)) { msg.textContent = 'Fiyat sıfırdan büyük bir sayı olmalı.'; return; }
    if (!(fee >= 0)) { msg.textContent = 'Komisyon geçerli bir sayı olmalı.'; return; }
    const tx = { id: pfId(), type: 'buy', date: f.date || null, qty, price, fee: cash ? 0 : fee };
    let pos = cash ? CASH() : state.portfolio.find(x => x.cat === f.cat && x.sym === f.sym);
    const isNew = !pos;
    if (isNew) pos = { id: pfId(), cat: f.cat, sym: f.sym, note: null, txs: [] };
    const err = applyTx(pos, tx, cash ? 'ext' : f.flow);
    if (err) { msg.textContent = err; return; }
    if (isNew && !state.portfolio.includes(pos)) state.portfolio.push(pos);
    if (f.note?.trim()) pos.note = f.note.trim();
    pfForm = null; persist(); renderPortfolio(); return;
  }
  if (e.target.id === 'txForm') {
    e.preventDefault(); txReadForm();
    const f = txForm, p = state.portfolio.find(x => x.id === f.pid), msg = $('#txMsg');
    if (!p) { txForm = null; renderPortfolio(); return; }
    const fixed = isCash(p);
    const qty = num(f.qty), price = fixed ? 1 : num(f.price), fee = !fixed && f.fee ? num(f.fee) : 0;
    if (!f.date) { msg.textContent = 'Tarih girin.'; return; }
    if (!(qty > 0)) { msg.textContent = 'Miktar sıfırdan büyük bir sayı olmalı.'; return; }
    if (!(price > 0)) { msg.textContent = 'Fiyat sıfırdan büyük bir sayı olmalı.'; return; }
    if (!(fee >= 0)) { msg.textContent = 'Komisyon geçerli bir sayı olmalı.'; return; }
    const err = applyTx(p, { id: pfId(), type: f.type, date: f.date, qty, price, fee }, fixed ? 'ext' : f.flow);
    if (err) { msg.textContent = err; return; }
    txForm = null; persist(); renderPortfolio(); return;
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
  const section = m ? 'hisse' : h.startsWith('#/karsilastir') ? 'karsilastir' : h.startsWith('#/aktar') ? 'aktar' : h.startsWith('#/portfoy') ? 'portfoy' : 'tarama';
  document.querySelectorAll('[data-nav]').forEach(a => a.toggleAttribute('aria-current', a.dataset.nav === section));
  if (m) renderDetail(m[1].toUpperCase());
  else if (section === 'karsilastir') renderCompare();
  else if (section === 'aktar') renderTransfer(h.startsWith('#/aktar/') ? h.slice(8) : null);
  else if (section === 'portfoy') renderPortfolio();
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
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // Sayfa açıkken yeni service worker devralırsa (yeni sürüm yayınlandı) yenileme uyarısı göster
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) $('#updateBar').hidden = false; });
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'update') $('#updateBar').hidden = false;
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    // Yeni bir service worker devreye girdiğinde de uyar
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'activated' && hadController) $('#updateBar').hidden = false; }); // ilk kurulumda gösterme
    });
  }).catch(() => {});
}
$('#reloadBtn').addEventListener('click', () => location.reload());
