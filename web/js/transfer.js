import { destroyCharts } from './detail.js';
import { view } from './dom.js';
import { PF_CATS, pfId } from './pfcore.js';
import { state } from './store.js';
import { syncPanelHtml } from './sync.js';
import { esc } from './util.js';

/* ============================================================
   Aktarma: izleme listesi ve kayıtlı taramaları kodla taşı
   ============================================================ */
export const b64e = str => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
export const exportCode = () => 'T1.' + b64e(JSON.stringify({ w: state.watch, s: state.saved, c: state.compare, p: state.portfolio }));
export function parseCode(code) {
  const m = String(code).trim().match(/(?:#\/aktar\/)?(T1\.[A-Za-z0-9_-]+)\s*$/);
  if (!m) throw new Error('Kod tanınmadı. "T1." ile başlayan kodun tamamını yapıştırın.');
  const d = JSON.parse(b64d(m[1].slice(3)));
  return { w: Array.isArray(d.w) ? d.w.filter(x => typeof x === 'string') : [], s: Array.isArray(d.s) ? d.s.filter(x => x && x.name) : [], c: Array.isArray(d.c) ? d.c : [],
    p: Array.isArray(d.p) ? d.p.filter(x => x && x.id && x.sym && PF_CATS[x.cat] && (Array.isArray(x.txs) || Number.isFinite(x.qty)))
      .map(x => Array.isArray(x.txs) ? x : { id: x.id, cat: x.cat, sym: x.sym, note: x.note || null, txs: [{ id: pfId(), type: 'buy', date: x.date || null, qty: x.qty, price: x.cost, fee: 0 }] }) : [] };
}
export function renderTransfer(incoming) {
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
  </div>
  ${syncPanelHtml()}`;
}
