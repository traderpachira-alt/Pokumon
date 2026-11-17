import { DATA } from './data.js';
import { destroyCharts } from './detail.js';
import { view } from './dom.js';
import { FIELDS, MKT_NAME, OPS, PRESETS, TEXTCOLS, TIER_RANK, VIEWS, tierRank, val } from './fields.js';
import { listOf, persist, state, ui } from './store.js';
import { tedbirIcon } from './tedbir.js';
import { cls, esc, ok } from './util.js';

/* ============================================================
   Tarama ekranı
   ============================================================ */
export function filtered() {
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
export function sorted(list) {
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
export function cellHtml(s, k) {
  if (k in TEXTCOLS) return `<td class="txt">${TEXTCOLS[k].cell(s)}</td>`;
  const fd = FIELDS[k], v = s[k];
  return `<td class="${fd.color ? cls(v) : ''}">${fd.f(v)}</td>`;
}
export function tableHtml(rows, cols, { sortable = true, highlight = null } = {}) {
  const th = k => {
    const def = FIELDS[k] || TEXTCOLS[k];
    const sort = state.sort.key === k ? (state.sort.dir > 0 ? 'ascending' : 'descending') : null;
    const inner = sortable ? `<button type="button" data-sort="${k}">${esc(def.label)}</button>` : esc(def.label);
    return `<th${sort && sortable ? ` aria-sort="${sort}"` : ''}${def.title ? ` title="${esc(def.title)}"` : ''}${sortable ? ` draggable="true" data-col="${k}"` : ''}>${inner}</th>`;
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
export const screenOf = () => ({ preset: state.preset, index: state.index, markets: [...state.markets], sectors: [...state.sectors], view: state.view,
  sort: { ...state.sort }, filters: state.filters.filter(f => f.value !== '').map(f => ({ ...f })) });
export const sameScreen = sv => {
  const c = screenOf();
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  return c.preset === sv.preset && c.index === sv.index && same(c.markets, listOf(sv, 'market')) && same(c.sectors, listOf(sv, 'sector')) && JSON.stringify(c.filters) === JSON.stringify(sv.filters);
};
export function describeScreen(sv) {
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
export const MARKET_OPTS = [['Yıldız', 'Yıldız Pazar'], ['Ana', 'Ana Pazar'], ['Alt', 'Alt Pazar'], ['YİP', 'Yakın İzleme Pazarı']];
export function msLabel(key, allLabel, unit) {
  const sel = state[key];
  if (!sel.length) return allLabel;
  if (sel.length === 1) return key === 'markets' ? (MARKET_OPTS.find(o => o[0] === sel[0])?.[1] || sel[0]) : sel[0];
  return `${sel.length} ${unit}`;
}
export function multiSelect(key, allLabel, unit, options, searchable) {
  const sel = new Set(state[key]), open = ui.msOpen === key;
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
export function refreshResults() {
  const rows = sorted(filtered());
  view.querySelector('.tablewrap').innerHTML = rows.length ? tableHtml(rows, colsFor(state.view)) : '<p class="empty">Bu koşullara uyan hisse yok.</p>';
  view.querySelector('.count b').textContent = rows.length;
  view.querySelectorAll('.ms').forEach(m => {
    const k = m.dataset.ms;
    if (k === 'cols') { m.querySelector('.ms-lbl').textContent = `☰ Sütunlar (${colsFor(state.view).length})`; m.classList.toggle('on', colsCustom(state.view)); return; }
    m.querySelector('.ms-lbl').textContent = msLabel(k, m.dataset.all, m.dataset.unit);
    m.classList.toggle('on', state[k].length > 0);
  });
}
// Açılır paneli ekrana sığdır (sağdan taşıyorsa sola kaydır)
export function fitPanel(panel) {
  if (!panel || panel.hidden) return;
  panel.style.left = '';
  const r = panel.getBoundingClientRect(), over = r.right - (document.documentElement.clientWidth - 8);
  if (over > 0) panel.style.left = `${-Math.min(over, r.left - 8)}px`;
}
export function closeMs() {
  if (!ui.msOpen) return;
  ui.msOpen = null;
  view.querySelectorAll('.ms-panel').forEach(p => { p.hidden = true; });
  view.querySelectorAll('[data-mstoggle]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
document.addEventListener('click', e => { if (ui.msOpen && !e.target.closest?.('.ms')) closeMs(); });
/* Sütun seçimi: her sekme için ayrı (state.cols[görünüm]); varsayılan VIEWS tanımı. Hisse kodu her zaman görünür. */
export const colLabel = k => (FIELDS[k] || TEXTCOLS[k])?.label || k;
export const colsFor = v => { const c = state.cols?.[v]; return Array.isArray(c) ? c.filter(k => FIELDS[k] || TEXTCOLS[k]) : VIEWS[v].cols; };
export const colsCustom = v => Array.isArray(state.cols?.[v]);
export function setCols(v, list) {
  const def = VIEWS[v].cols, ordered = [...new Set(list)];
  state.cols ||= {};
  if (ordered.length === def.length && ordered.every((k, i) => k === def[i])) delete state.cols[v]; else state.cols[v] = ordered;
}
export function moveCol(k, to) { // to: hedef indeks
  const cur = colsFor(state.view).filter(x => x !== k);
  cur.splice(Math.max(0, Math.min(cur.length, to)), 0, k);
  setCols(state.view, cur);
}
// Sütun paneli ve tablo değişince: tabloyu yenile, açık paneli yeniden çiz (sıralama/bölümler güncellensin)
export function refreshCols() {
  persist(); refreshResults();
  const m = view.querySelector('.ms[data-ms="cols"]');
  if (m) {
    const q = m.querySelector('.ms-q')?.value || '';
    m.outerHTML = colsPanel();
    fitPanel(view.querySelector('.colpanel'));
    if (q) { const nq = view.querySelector('.colpanel .ms-q'); nq.value = q; nq.dispatchEvent(new Event('input', { bubbles: true })); }
  }
}
export function colsPanel() {
  const v = state.view, shown = colsFor(v), cur = new Set(shown), open = ui.msOpen === 'cols', def = VIEWS[v].cols;
  const others = Object.entries(VIEWS).filter(([id]) => id !== v).map(([, vw]) => [vw.label, vw.cols]);
  const inViews = new Set(Object.values(VIEWS).flatMap(x => x.cols));
  const loose = Object.keys(FIELDS).filter(k => !inViews.has(k));
  const seen = new Set(shown);
  const addRow = k => `<label><input type="checkbox" value="${k}"> <span>${esc(colLabel(k))}</span></label>`;
  const group = (title, keys) => { keys = keys.filter(k => !seen.has(k) && (seen.add(k), true)); return keys.length ? `<div class="ms-grp">${title}</div>` + keys.map(addRow).join('') : ''; };
  return `<div class="ms${colsCustom(v) ? ' on' : ''}" data-ms="cols">
    <button type="button" class="btn ms-btn" data-mstoggle="cols" aria-haspopup="true" aria-expanded="${open}" title="Tabloda görünecek sütunları ve sıralarını seçin"><span class="ms-lbl">☰ Sütunlar (${cur.size})</span> ▾</button>
    <div class="ms-panel colpanel"${open ? '' : ' hidden'}>
      <input type="search" class="ms-q" placeholder="Sütun ara…" aria-label="Sütun ara" autocomplete="off">
      <div class="ms-list">
        <div class="ms-grp">Görünen sütunlar · soldan sağa</div>
        ${shown.map((k, i) => `<label class="colrow"><input type="checkbox" value="${k}" checked> <span>${esc(colLabel(k))}</span>
          <button type="button" class="ic" data-colmove="${k}|-1" aria-label="${esc(colLabel(k))} sola taşı"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="ic" data-colmove="${k}|1" aria-label="${esc(colLabel(k))} sağa taşı"${i === shown.length - 1 ? ' disabled' : ''}>↓</button></label>`).join('')}
        ${group(`${VIEWS[v].label} sekmesinden gizlenenler`, def)}
        ${others.map(([t, keys]) => group(`Ekle · ${t}`, keys)).join('')}
        ${group('Ekle · ek alanlar', loose)}
      </div>
      <p class="muted" style="font-size:11px;margin:0">Bilgisayarda tablo başlıklarını sürükleyerek de sıralayabilirsiniz.</p>
      <div class="ms-foot"><button type="button" class="btn" data-colsreset="1">Varsayılana dön</button><button type="button" class="btn primary" data-msclose="1">Tamam</button></div>
    </div>
  </div>`;
}
export function renderScreener() {
  destroyCharts();
  document.title = 'Tahta';
  const sectors = [...new Set(DATA.stocks.map(s => s.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const numericKeys = Object.keys(FIELDS).filter(k => !FIELDS[k].nofilter);
  const counts = Object.fromEntries(PRESETS.map(p => [p.id, DATA.stocks.filter(p.test).length]));
  const rows = sorted(filtered());
  const cols = colsFor(state.view);
  const preset = PRESETS.find(p => p.id === state.preset);

  view.innerHTML = `
  <section class="toolbar">
    <div class="presets" role="group" aria-label="Hazır taramalar">
      ${PRESETS.map(p => `<button type="button" data-preset="${p.id}" aria-pressed="${state.preset === p.id}" title="${esc(p.hint || '')}">${esc(p.label)}<span class="n">${counts[p.id]}</span></button>`).join('')}
    </div>
    <div class="saved" role="group" aria-label="Kayıtlı taramalar">
      ${state.saved.map((sv, i) => `<span class="svchip${sameScreen(sv) ? ' on' : ''}"><button type="button" data-load="${i}" title="${esc(describeScreen(sv))}">${esc(sv.name)}</button><button type="button" class="x" data-unsave="${i}" aria-label="${esc(sv.name)} taramasını sil">×</button></span>`).join('')}
      ${ui.savingOpen
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
      ${colsPanel()}
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
