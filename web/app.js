import { sma, rsi, macd, bollinger } from './ind.js';

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
  pe:        { label: 'F/K',              f: fmt.num, fx: 1 },
  pb:        { label: 'PD/DD',            f: fmt.num2, fx: 1 },
  evEbitda:  { label: 'FD/FAVÖK',         f: fmt.num, fx: 1 },
  netMargin: { label: 'Net marj',         f: fmt.pctPlain, pct: 1, color: 1 },
  opMargin:  { label: 'Faaliyet marjı',   f: fmt.pctPlain, pct: 1, color: 1 },
  roe:       { label: 'ÖK kârlılığı',     f: fmt.pctPlain, pct: 1, color: 1, title: 'Özkaynak kârlılığı (ROE)' },
  roa:       { label: 'Aktif kârlılığı',  f: fmt.pctPlain, pct: 1, color: 1 },
  de:        { label: 'Borç/ÖK',          f: fmt.x },
  currentRatio: { label: 'Cari oran',     f: fmt.num2 },
  revGrowth: { label: 'Satış büyümesi',   f: fmt.pct, pct: 1, color: 1, title: 'Yıllık, son çeyrek' },
  epsGrowth: { label: 'Kâr büyümesi',     f: fmt.pct, pct: 1, color: 1, title: 'Yıllık, son çeyrek' },
  divYield:  { label: 'Temettü verimi',   f: fmt.pctPlain, pct: 1 },
};
const VIEWS = {
  fiyat:  { label: 'Fiyat',  cols: ['_idx', 'last', 'chg1d', 'chg1w', 'chg1m', 'chg3m', 'chg1y', 'ytd', 'turnover', 'volRatio', 'mcap'] },
  teknik: { label: 'Teknik', cols: ['_idx', 'last', 'chg1d', 'rsi', 'macdPct', '_trend', '_cross', 'vsSma50', 'vsSma200', 'distHi52', 'volRatio', 'volat', 'beta', 'rs3m'] },
  temel:  { label: 'Temel',  cols: ['_idx', 'last', 'mcap', 'pe', 'pb', 'evEbitda', 'netMargin', 'roe', 'de', 'revGrowth', 'epsGrowth', 'divYield', '_sector'] },
};
/* Endeks katmanı: her hisse yer aldığı en dar endeksle etiketlenir (BIST 30 ⊂ 50 ⊂ 100 ⊂ TÜM). */
const TIER_RANK = { '30': 0, '50': 1, '100': 2, 'TÜM': 3 };
const tierRank = s => TIER_RANK[s.idx] ?? 4;
const tierChip = s => s.idx ? `<span class="ix ix${tierRank(s)}">${s.idx === 'TÜM' ? 'TÜM' : 'BIST ' + s.idx}</span>` : '—';
const TEXTCOLS = {
  _idx:    { label: 'Endeks', sortKey: tierRank, cell: tierChip, title: 'Hissenin yer aldığı en dar endeks' },
  _trend:  { label: 'Trend',  sortKey: s => ({ up: 2, flat: 1, down: 0 })[s.trend] ?? null,
             cell: s => s.trend ? `<span class="chip ${TREND[s.trend][1]}">${TREND[s.trend][0]}</span>` : '—' },
  _cross:  { label: 'Sinyal', sortKey: s => (s.cross === 'golden' ? 2 : 0) + (s.macdCross === 'up' ? 1 : s.macdCross === 'down' ? -1 : 0) + (s.cross === 'death' ? -2 : 0),
             cell: s => signalChips(s) || '<span class="muted">—</span>' },
  _sector: { label: 'Sektör', sortKey: s => s.sector || '', cell: s => esc(s.sector || '—') },
};
const reliable = (s, k) => !(FIELDS[k]?.fx && s.fxWarn);
const val = (s, k) => (k in TEXTCOLS ? TEXTCOLS[k].sortKey(s) : s[k]);

function signalChips(s) {
  const out = [];
  if (s.cross === 'golden') out.push('<span class="chip up">Golden cross</span>');
  if (s.cross === 'death') out.push('<span class="chip down">Death cross</span>');
  if (s.macdCross === 'up') out.push('<span class="chip up">MACD al</span>');
  if (s.macdCross === 'down') out.push('<span class="chip down">MACD sat</span>');
  return out.join(' ');
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
  { id: 'high52',   label: '52H zirvesinde',   test: s => s.distHi52 > -0.03, hint: '52 haftalık zirveye %3\'ten yakın', sort: ['distHi52', -1] },
  { id: 'volspike', label: 'Hacim patlaması',  test: s => s.volRatio >= 2, hint: 'Hacim, 20 günlük ortalamanın 2 katı', sort: ['volRatio', -1] },
  { id: 'value',    label: 'Ucuz',             test: s => !s.fxWarn && s.pe > 0 && s.pe < 8 && s.pb > 0 && s.pb < 1.5, hint: 'F/K < 8 ve PD/DD < 1,5', sort: ['pe', 1] },
  { id: 'quality',  label: 'Kârlı büyüme',     test: s => s.roe > 0.25 && s.netMargin > 0.1 && s.revGrowth > 0, hint: 'ÖK kârlılığı > %25, net marj > %10, satış büyüyor', sort: ['roe', -1] },
];
const OPS = { '>': (a, b) => a > b, '<': (a, b) => a < b };

/* ============================================================
   Durum (tarayıcıda saklanır)
   ============================================================ */
const KEY = 'tahta:v1';
const state = Object.assign({
  view: 'fiyat', sort: { key: 'turnover', dir: -1 }, preset: 'all', sector: '', index: '', filters: [], watch: [],
  chart: { range: '6A', sma20: false, sma50: true, sma200: true, bb: false, rsi: true, macd: true },
}, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })());
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
    for (const k of ['pe', 'pb', 'evEbitda', 'netMargin', 'roe', 'de', 'revGrowth', 'divYield', 'mcap'])
      out[sec][k] = median(list.filter(s => reliable(s, k) && !((k === 'pe' || k === 'evEbitda') && s[k] <= 0)).map(s => s[k]));
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
    state.filters.every(f => {
      const v = s[f.key], fd = FIELDS[f.key];
      if (f.value === '' || f.value == null) return true;
      if (!ok(v) || !reliable(s, f.key)) return false;
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
  const warn = fd.fx && s.fxWarn && ok(v) ? '<span class="fx" title="Şirket farklı para biriminde raporluyor; Yahoo oranı hatalı olabilir">⚠</span>' : '';
  return `<td class="${fd.color ? cls(v) : ''}">${fd.f(v)}${warn}</td>`;
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
      <td class="tk"><button type="button" class="star" data-star="${s.t}" aria-pressed="${starred}" aria-label="${s.t} izleme listesi">★</button><span class="code" title="${esc(s.name || '')}">${s.t}</span></td>
      ${cols.map(k => cellHtml(s, k)).join('')}</tr>`;
  }).join('');
  return `<table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table>`;
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
    <div class="controls">
      <div class="seg" role="group" aria-label="Sütun grubu">
        ${Object.entries(VIEWS).map(([id, v]) => `<button type="button" data-view="${id}" aria-pressed="${state.view === id}">${v.label}</button>`).join('')}
      </div>
      <label class="sr" for="indexSel">Endeks</label>
      <select id="indexSel" class="btn">${[['', 'Tüm hisseler'], ['30', 'BIST 30'], ['50', 'BIST 50'], ['100', 'BIST 100']].map(([v, l]) => `<option value="${v}"${v === state.index ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <label class="sr" for="sector">Sektör</label>
      <select id="sector" class="btn"><option value="">Tüm sektörler</option>${sectors.map(s => `<option${s === state.sector ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
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
const TOGGLES = [
  ['sma20', 'SMA20', '--c-sma20'], ['sma50', 'SMA50', '--c-sma50'], ['sma200', 'SMA200', '--c-sma200'], ['bb', 'Bollinger', '--c-bb'],
  ['rsi', 'RSI', null], ['macd', 'MACD', null],
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
  ];
  const fundRows = [
    ['Piyasa değeri', 'mcap', x => fmt.big(x) + ' ₺'], ['F/K', 'pe'], ['PD/DD', 'pb'], ['FD/FAVÖK', 'evEbitda'],
    ['Net marj', 'netMargin'], ['ÖK kârlılığı', 'roe'], ['Borç / ÖK', 'de'], ['Satış büyümesi', 'revGrowth'], ['Temettü verimi', 'divYield'],
  ];

  view.innerHTML = `
  <section class="dhead">
    <a class="back" href="#/">← Tarama</a>
    <div>
      <h1>${isIdx ? '' : `<button type="button" class="star" data-star="${t}" aria-pressed="${starred}" aria-label="İzleme listesi">★</button>`}${esc(t)}</h1>
      <p class="sub">${isIdx ? '' : tierChip(s) + ' '}${esc(s.name || '')}${s.sector ? ' · ' + esc(s.sector) : ''}${s.industry ? ' · ' + esc(s.industry) : ''}</p>
    </div>
    <div class="px"><span class="price">${fmt.price(s.last)}${isIdx ? '' : ' ₺'}</span><span class="chg ${cls(s.chg1d)}">${fmt.pct(s.chg1d)}</span><span class="date">${fmt.date(s.date)} kapanış</span></div>
  </section>

  <div class="chartbar">
    <div class="seg" role="group" aria-label="Zaman aralığı">${Object.keys(RANGES).map(r => `<button type="button" data-range="${r}" aria-pressed="${state.chart.range === r}">${r}</button>`).join('')}</div>
    <div class="toggles" role="group" aria-label="Göstergeler">${TOGGLES.map(([k, l, c]) => `<button type="button" class="tg" data-tg="${k}" aria-pressed="${!!state.chart[k]}">${c ? `<i style="--c:var(${c})"></i>` : ''}${l}</button>`).join('')}</div>
  </div>
  <div class="charts">
    <div class="legend" id="legend"></div>
    <div class="c-main" id="cMain"></div>
    <div class="c-sub" id="cRsi"${state.chart.rsi ? '' : ' hidden'}><span class="lbl">RSI 14</span></div>
    <div class="c-sub" id="cMacd"${state.chart.macd ? '' : ' hidden'}><span class="lbl">MACD 12, 26, 9</span></div>
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
          const fd = FIELDS[k], fn = f || fd.f, bad = fd.fx && s.fxWarn;
          return `<dt>${l}</dt><dd class="${fd.color ? cls(s[k]) : ''}">${fn(s[k])}${bad && ok(s[k]) ? '<span class="fx">⚠</span>' : ''}</dd><dd class="note num">${fn(med[k])}</dd>`;
        }).join('')}
      </dl>
      ${s.fxWarn ? `<p class="note-fx">⚠ ${esc(t)} finansallarını ${esc(s.finCur)} ile raporluyor. Yahoo bu şirkette F/K, PD/DD ve FD/FAVÖK'ü para birimlerini karıştırarak hesaplıyor olabilir; bu oranlara güvenmeyin.</p>` : ''}
      <p class="muted" style="font-size:12px;margin:8px 0 0">Sektör: ${esc(s.sector || '—')} (${med.n || 0} hisse). Yahoo'nun BIST temel verileri eksik ya da gecikmeli olabilir.</p>`}
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
  const subs = [C.rsi && 'rsi', C.macd && 'macd'].filter(Boolean);
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

  // Alt paneller
  let rsiArr = null, mac = null;
  if (C.rsi) {
    const c = LWC.createChart($('#cRsi'), base(subs.at(-1) === 'rsi'));
    charts.push(c);
    rsiArr = rsi(h.c);
    const sr = c.addLineSeries({ color: css('--accent'), lineWidth: 1.5, priceLineVisible: false });
    sr.setData(line(rsiArr));
    for (const p of [70, 30]) sr.createPriceLine({ price: p, color: css('--muted'), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
    sr.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
  }
  if (C.macd) {
    const c = LWC.createChart($('#cMacd'), base(subs.at(-1) === 'macd'));
    charts.push(c);
    mac = macd(h.c);
    const hs = c.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    hs.setData(T.map((time, i) => ({ time, value: mac.hist[i], color: (mac.hist[i] >= 0 ? up : down) + '99' })));
    c.addLineSeries({ color: css('--c-sma50'), lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false }).setData(line(mac.line));
    c.addLineSeries({ color: css('--c-sma20'), lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false }).setData(line(mac.signal));
  }

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
    for (const [k, l, c] of TOGGLES.slice(0, 3)) if (ma[k]?.[i] != null) parts.push(`<span style="color:var(${c})">${l} <b style="color:inherit">${fmt.price(ma[k][i])}</b></span>`);
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
    $('#cRsi').hidden = !state.chart.rsi; $('#cMacd').hidden = !state.chart.macd;
    const t = location.hash.slice(4);
    if (HIST.has(t)) drawCharts(HIST.get(t));
    return;
  }
  if (d.t) location.hash = `#/h/${d.t}`;
});

view.addEventListener('change', e => {
  if (e.target.id === 'sector') { state.sector = e.target.value; persist(); renderScreener(); return; }
  if (e.target.id === 'indexSel') { state.index = e.target.value; persist(); renderScreener(); return; }
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
  const m = location.hash.match(/^#\/h\/([A-Z0-9]+)$/i);
  if (m) {
    if (!view.querySelector('.dhead')) lastScroll = view.querySelector('.tablewrap')?.scrollTop || 0;
    renderDetail(m[1].toUpperCase());
    window.scrollTo(0, 0);
  } else {
    renderScreener();
    const tw = view.querySelector('.tablewrap');
    if (tw) tw.scrollTop = lastScroll;
  }
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

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
