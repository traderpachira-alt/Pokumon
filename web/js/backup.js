import { PF_CATS, migratePortfolio, pfCalc } from './pfcore.js';
import { state } from './store.js';

/* ============================================================
   Yedek dosyası ve içe aktarma: veri doğrulama, birleştirme, değiştirme
   (sayfaya dokunmaz; testlerde de kullanılır)
   ============================================================ */
export const BACKUP_APP = 'tahta', BACKUP_VER = 1;

// Gelen veriyi doğrula ve temizle: {w, s, c, p}
export function normalize(d) {
  const arr = x => Array.isArray(x) ? x : [];
  const p = arr(d.p).filter(x => x && x.id && x.sym && PF_CATS[x.cat] && (Array.isArray(x.txs) || Number.isFinite(x.qty)))
    .map(x => Array.isArray(x.txs) ? { ...x, txs: x.txs.filter(t => t && t.id && (t.type === 'buy' || t.type === 'sell') && Number.isFinite(t.qty) && Number.isFinite(t.price)) } : x);
  return {
    w: arr(d.w).filter(x => typeof x === 'string'),
    s: arr(d.s).filter(x => x && x.name),
    c: arr(d.c).filter(x => typeof x === 'string'),
    p: migratePortfolio(p),
  };
}

export function backupJson(now = new Date()) {
  return JSON.stringify({
    app: BACKUP_APP, version: BACKUP_VER, created: now.toISOString(),
    watch: state.watch, saved: state.saved, compare: state.compare, portfolio: state.portfolio,
  }, null, 1);
}
export const backupName = (now = new Date()) => `tahta-yedek-${new Date(now - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 16).replace('T', '_').replace(':', '-')}.json`;

export function parseBackup(text) {
  let j;
  try { j = JSON.parse(text); } catch { throw new Error('Dosya okunamadı: geçerli bir JSON değil.'); }
  if (!j || j.app !== BACKUP_APP) throw new Error('Bu bir Tahta yedek dosyası değil.');
  if (j.version > BACKUP_VER) throw new Error('Yedek, uygulamanın daha yeni bir sürümüyle alınmış. Sayfayı yenileyip tekrar deneyin.');
  const d = normalize({ w: j.watch, s: j.saved, c: j.compare, p: j.portfolio });
  const bad = d.p.find(p => pfCalc(p).oversold);
  if (bad) throw new Error(`Yedekteki ${bad.sym} kaydı tutarsız (elde olandan fazla satış). Dosya bozulmuş olabilir.`);
  return { ...d, created: j.created || null };
}

// Birleştir: yeni hisseler eklenir, aynı adlı tarama ve aynı kimlikli portföy kaydı güncellenir
export function mergeData(d) {
  const before = state.watch.length;
  for (const t of d.w) if (!state.watch.includes(t)) state.watch.push(t);
  for (const sv of d.s) { const i = state.saved.findIndex(x => x.name === sv.name); if (i >= 0) state.saved[i] = sv; else state.saved.push(sv); }
  let pAdded = 0;
  for (const pos of d.p) { const i = state.portfolio.findIndex(x => x.id === pos.id); if (i >= 0) state.portfolio[i] = pos; else { state.portfolio.push(pos); pAdded++; } }
  return { watch: state.watch.length - before, saved: d.s.length, pAdded, pUpdated: d.p.length - pAdded };
}

// Tümünü değiştir: bu cihazdaki izleme listesi, taramalar, karşılaştırma ve portföy yedektekiyle değişir
export function replaceData(d) {
  state.watch = [...d.w]; state.saved = [...d.s]; state.portfolio = d.p;
  if (d.c.length) state.compare = [...d.c];
}
