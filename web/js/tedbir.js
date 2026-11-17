import { BY, DATA } from './data.js';
import { closeMs } from './screener.js';
import { esc, fmt } from './util.js';

/* Tedbir: üçgen içinde ünlem; üzerine gelince ya da dokununca açılır pencerede tedbirler */
export const WARN_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1.5 15 14H1z" fill="currentColor"/><path d="M8 6v3.6" stroke="var(--surface)" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="11.7" r=".95" fill="var(--surface)"/></svg>';
export const tedbirIcon = s => s.tedbir?.length
  ? `<button type="button" class="tedbir" data-tedbir="${s.t}" aria-label="${s.t}: ${s.tedbir.length} tedbir uygulanıyor" aria-haspopup="dialog">${WARN_SVG}</button>` : '';
export function tedbirHtml(t) {
  const s = BY.get(t);
  if (!s?.tedbir?.length) return '';
  const at = DATA.tedbirAt ? new Date(DATA.tedbirAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : null;
  return `<b>${t} · uygulanan tedbirler</b><ul>${s.tedbir.map(m => `<li><span>${esc(m.type)}</span><small>${m.from ? fmt.date(m.from) : '?'} – ${m.to ? fmt.date(m.to) : 'süresiz'}${m.note ? ' · ' + esc(m.note) : ''}</small></li>`).join('')}</ul>
    <p class="src">Kaynak: GCM Yatırım tedbir listesi${at ? ' · ' + at : ''}. İşlem öncesi aracı kurumunuzdan teyit edin.</p>`;
}
export const pop = document.createElement('div');
pop.className = 'pop';
 pop.setAttribute('role', 'dialog');
 pop.hidden = true;
document.body.appendChild(pop);
export let popFor = null, popAt = 0;
export function showPop(btn) {
  const html = tedbirHtml(btn.dataset.tedbir);
  if (!html) return;
  pop.innerHTML = html; pop.hidden = false; popFor = btn; popAt = performance.now();
  const r = btn.getBoundingClientRect(), w = pop.offsetWidth;
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  const below = r.bottom + 8 + pop.offsetHeight < innerHeight;
  pop.style.top = (below ? r.bottom + 8 : r.top - pop.offsetHeight - 8) + 'px';
}
export function hidePop() { pop.hidden = true; popFor = null; }
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
