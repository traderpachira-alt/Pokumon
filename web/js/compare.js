import { BY, loadHist } from './data.js';
import { RANGES, charts, css, destroyCharts } from './detail.js';
import { $, view } from './dom.js';
import { state } from './store.js';
import { F1, cls, fmt } from './util.js';

/* ============================================================
   Karşılaştırma: seçilen dönemin başı = 100
   ============================================================ */
export const CMP_COLORS = ['--c-sma50', '--c-vwma', '--c-ichi', '--c-sma200', '--c-sma20'];
export const CMP_MAX = 5;
export const cmpList = () => {
  const stocks = state.compare.filter(t => t !== 'XU100' && BY.has(t)).slice(0, CMP_MAX);
  return state.compare.includes('XU100') ? [...stocks, 'XU100'] : stocks;
};
export const cmpColor = (t, i) => t === 'XU100' ? '--muted' : CMP_COLORS[i % CMP_COLORS.length];
export async function renderCompare() {
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
export function drawCompare(list, hists) {
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
