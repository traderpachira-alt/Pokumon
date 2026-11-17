import { BY, DATA, FX } from './data.js';
import { state } from './store.js';
import { F0, F2, fmt, nf, ok } from './util.js';

/* ============================================================
   Portföy (yalnızca bu cihazda saklanır; Aktar ile taşınır)
   Her pozisyon bir işlem listesidir: alım/satım (tarih, adet, fiyat, komisyon).
   Adet, ortalama maliyet ve gerçekleşen K/Z bu listeden ortalama maliyet yöntemiyle hesaplanır.
   ============================================================ */
export const PF_CATS = {
  temettu: { label: 'Temettü', hint: 'Temettüsü için tutulan hisseler', color: '--c-sma50' },
  trend:   { label: 'Trend / Momentum', hint: 'Trend sürdükçe tutulup momentum bitince satılacak hisseler', color: '--c-vwma' },
  emtia:   { label: 'Emtia / İtibari', hint: 'Altın, gümüş, TL, dolar, euro', color: '--c-ichi' },
  kripto:  { label: 'Kripto', hint: 'BTC, ETH, SOL, BNB, USDT, USDC', color: '--c-kripto' },
};
export const ASSETS = {
  XAU: { name: 'Altın', unit: 'gram', qtyLabel: 'Gram' },
  XAG: { name: 'Gümüş', unit: 'gram', qtyLabel: 'Gram' },
  TRY: { name: 'Türk lirası', unit: '₺', qtyLabel: 'Tutar (₺)' },
  USD: { name: 'Dolar', unit: '$', qtyLabel: 'Tutar ($)' },
  EUR: { name: 'Euro', unit: '€', qtyLabel: 'Tutar (€)' },
  BTC:  { name: 'Bitcoin (BTC)', unit: 'BTC', qtyLabel: 'Miktar (BTC)', crypto: true },
  ETH:  { name: 'Ethereum (ETH)', unit: 'ETH', qtyLabel: 'Miktar (ETH)', crypto: true },
  SOL:  { name: 'Solana (SOL)', unit: 'SOL', qtyLabel: 'Miktar (SOL)', crypto: true },
  BNB:  { name: 'BNB', unit: 'BNB', qtyLabel: 'Miktar (BNB)', crypto: true },
  USDT: { name: 'Tether (USDT)', unit: 'USDT', qtyLabel: 'Miktar (USDT)', crypto: true },
  USDC: { name: 'USD Coin (USDC)', unit: 'USDC', qtyLabel: 'Miktar (USDC)', crypto: true },
};
 // işlem geçmişi açık pozisyonlar
export const pfId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const ASSET_CATS = { emtia: ['XAU', 'XAG', 'TRY', 'USD', 'EUR'], kripto: ['BTC', 'ETH', 'SOL', 'BNB', 'USDT', 'USDC'] };
export const isAssetCat = c => c in ASSET_CATS;
export const isAsset = p => isAssetCat(p.cat);
export const isCrypto = p => !!ASSETS[p?.sym]?.crypto;
export const todayIso = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
export const unitOf = p => isAsset(p) ? (ASSETS[p.sym]?.unit || '') : 'hisse';
export const assetName = p => isAsset(p) ? (ASSETS[p.sym]?.name || p.sym) : p.sym;
// Eski biçimdeki pozisyonları ({qty, cost, date}) tek alım işlemine çevir
export const migratePortfolio = list => (list || []).filter(p => p && p.sym && PF_CATS[p.cat]).map(p => Array.isArray(p.txs) ? p : {
  id: p.id || pfId(), cat: p.cat, sym: p.sym, note: p.note || null,
  txs: [{ id: pfId(), type: 'buy', date: p.date || null, qty: p.qty, price: p.cost, fee: 0 }],
});
state.portfolio = migratePortfolio(state.portfolio);
export function pfCalc(p, extra) {
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
export function pfQuote(p) {
  if (isAsset(p)) { const a = DATA.assets?.[p.sym]; return a ? { last: a.last, chg1d: a.chg1d } : null; }
  const s = BY.get(p.sym); return s ? { last: s.last, chg1d: s.chg1d, s } : null;
}
export function pfRows() {
  return state.portfolio.map(p => {
    const c = pfCalc(p), q = pfQuote(p), value = q && c.qty ? q.last * c.qty : (c.qty ? null : 0);
    const pl = value != null ? value - c.cost : null;
    const day = q && ok(q.chg1d) && c.qty ? value - value / (1 + q.chg1d) : 0;
    return { p, c, q, s: q?.s, value, pl, plPct: pl != null && c.cost ? pl / c.cost : null, day, open: c.qty > 0 };
  });
}
// Trend pozisyonunda çıkış uyarıları: güçlüler "Çıkış sinyali", zayıflar "Dikkat"
export function exitSignals(s) {
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
export const F8 = nf(0, 8);
export const qtyFmt = (q, p) => p && isCrypto(p) ? F8.format(q) : Number.isInteger(q) ? F0.format(q) : F2.format(q);
export const signed = x => !ok(x) ? '—' : (x > 0 ? '+' : '') + fmt.big(x);
/* --- Cüzdanlar ve bağlı işlemler ---
   Cüzdan: TL (Emtia/İtibari'deki "Türk lirası"), USDT ve USDC (Kripto). Bir alım cüzdandan ödenirse ya da bir satışın
   geliri cüzdana aktarılırsa, cüzdan pozisyonunda karşılık işlemi oluşur; iki işlem bağlıdır (link/src) ve birlikte silinir.
   flow: 'cash' (TL), 'USDT', 'USDC' ya da 'ext' (portföy dışından/dışına).
   BTC/ETH/SOL/BNB işlemleri USDT/USDC cinsinden girilir (tx.q = {cur, price, fee, rate}); TL karşılığı işlem günü kuruyla
   hesaplanır ve harcanan USDT o günkü TL kurundan "satılmış" sayılır (USD/TL kaynaklı K/Z USDT'de gerçekleşir). */
export const WALLETS = {
  cash: { cat: 'emtia', sym: 'TRY', label: 'TL', unit: '₺' },
  USDT: { cat: 'kripto', sym: 'USDT', label: 'USDT', unit: 'USDT' },
  USDC: { cat: 'kripto', sym: 'USDC', label: 'USDC', unit: 'USDC' },
};
export const walletPos = w => state.portfolio.find(p => p.cat === WALLETS[w].cat && p.sym === WALLETS[w].sym);
export function ensureWallet(w) {
  let c = walletPos(w);
  if (!c) { c = { id: pfId(), cat: WALLETS[w].cat, sym: WALLETS[w].sym, note: null, txs: [] }; state.portfolio.push(c); }
  return c;
}
export const walletBal = w => { const c = walletPos(w); return c ? pfCalc(c).qty : 0; };
export const walletOf = p => Object.keys(WALLETS).find(w => WALLETS[w].cat === p?.cat && WALLETS[w].sym === p?.sym) || null;
export const isCash = p => p?.cat === 'emtia' && p?.sym === 'TRY';
export const CASH = () => walletPos('cash');
export const ensureCash = () => ensureWallet('cash');
export const cashBal = () => walletBal('cash');
export const isStable = p => p?.cat === 'kripto' && (p.sym === 'USDT' || p.sym === 'USDC');
export const isCoin = p => isCrypto(p) && !isStable(p);
 // BTC, ETH, SOL, BNB: USDT/USDC ile işlem görür
export const txAmount = t => t.type === 'buy' ? t.qty * t.price + (t.fee || 0) : t.qty * t.price - (t.fee || 0);
export const tl = x => fmt.big(x) + ' ₺';
export const wFmt = (w, x) => w === 'cash' ? tl(x) : `${fmt.price(x)} ${WALLETS[w].unit}`;
// İşlem günündeki TL kuru (1 USDT/USDC kaç TL); yoksa güncel kur
export function rateAt(sym, date) {
  const h = FX?.[sym];
  if (h && date && date < h.d.at(-1)) {
    let lo = 0, hi = h.d.length - 1, i = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (h.d[m] <= date) { i = m; lo = m + 1; } else hi = m - 1; }
    if (i >= 0) return h.c[i];
  }
  return DATA.assets?.[sym]?.last || null;
}
// İşlemi uygular; sorun varsa açıklama metni döner (hiçbir şey değişmez), yoksa null.
export function applyTx(p, tx, flow) {
  const own = pfCalc(p, tx);
  if (own.oversold) return `${own.oversold.date ? fmt.date(own.oversold.date) : 'Bu'} tarihinde elinizde ${qtyFmt(own.oversold.have, p)} ${unitOf(p)} var; daha fazlası satılamaz.`;
  // Dışarıdan ya da cüzdanın kendine (ör. TL yatırma): karşılık işlemi yok
  if (!WALLETS[flow] || walletOf(p) === flow) { if (!isCash(p)) tx.flow = 'ext'; p.txs.push(tx); return null; }
  // Karşılık işlem: cüzdan biriminde tutar; TL cüzdanında fiyat 1, USDT/USDC'de işlem günü TL kuru
  const amount = flow === 'cash' ? txAmount(tx) : tx.type === 'buy' ? tx.qty * tx.q.price + (tx.q.fee || 0) : tx.qty * tx.q.price - (tx.q.fee || 0);
  const price = flow === 'cash' ? 1 : tx.q.rate;
  const ctx = { id: pfId(), type: tx.type === 'buy' ? 'sell' : 'buy', date: tx.date, qty: amount, price, fee: 0, link: tx.id, src: p.id };
  if (tx.type === 'buy') {
    const wp = walletPos(flow), wc = wp ? pfCalc(wp, ctx) : { oversold: { have: 0, date: tx.date } };
    if (wc.oversold) return `${WALLETS[flow].label} bakiye yetersiz: ${wc.oversold.date ? fmt.date(wc.oversold.date) + ' tarihinde ' : ''}${wFmt(flow, wc.oversold.have)} var, ${wFmt(flow, amount)} gerekiyor.`
      + (flow === 'cash' ? ' "Dışarıdan" seçin ya da önce para yatırın.' : ` Önce ${WALLETS[flow].label} alın.`);
  } else if (amount <= 0) return 'Komisyon satış tutarından büyük olamaz.';
  tx.flow = flow; tx.link = ctx.id;
  p.txs.push(tx); ensureWallet(flow).txs.push(ctx);
  return null;
}
export const posOfTx = id => state.portfolio.find(x => x.txs.some(t => t.id === id));
export const oversoldMsg = (pos, c) => walletOf(pos)
  ? `Bu işlem silinirse ${WALLETS[walletOf(pos)].label} bakiye ${c.oversold.date ? fmt.date(c.oversold.date) + ' tarihinde ' : ''}eksiye düşer (sonraki alımlar bu parayla yapılmış). Önce o alımları silin.`
  : `Bu işlem silinirse ${c.oversold.date ? fmt.date(c.oversold.date) + ' tarihli ' : ''}satış elde olandan fazla olur. Önce o satışı silin.`;
// İşlemi (ve cüzdandaki karşılığını) siler; sorun varsa açıklama döner.
export function removeTx(p, tid) {
  const t = p.txs.find(x => x.id === tid);
  if (!t) return null;
  if (t.kind === 'div') { const sp = state.portfolio.find(x => x.id === t.src); return sp ? undoDiv(sp, t.divDate) : null; }
  if (t.src) { const sp = state.portfolio.find(x => x.id === t.src); return `Bu kayıt ${sp ? assetName(sp) : 'başka bir'} işleminden otomatik oluştu; o işlemi silin.`; }
  const plan = [[p, p.txs.filter(x => x.id !== tid)]];
  const wp = t.link ? posOfTx(t.link) : null;
  if (wp && wp !== p) plan.push([wp, wp.txs.filter(x => x.id !== t.link)]);
  for (const [pos, txs] of plan) { const c = pfCalc({ ...pos, txs }); if (c.oversold) return oversoldMsg(pos, c); }
  for (const [pos, txs] of plan) pos.txs = txs;
  return null;
}
export function removePosition(pid) {
  const p = state.portfolio.find(x => x.id === pid);
  if (!p) return null;
  if (walletOf(p) && p.txs.some(t => t.src)) return `${WALLETS[walletOf(p)].label} bakiyesinde başka varlıkların alım/satımından gelen kayıtlar var. Önce o işlemleri silin.`;
  const plan = state.portfolio.filter(x => x !== p && x.txs.some(t => t.src === p.id)).map(x => [x, x.txs.filter(t => t.src !== p.id)]);
  for (const [pos, txs] of plan) {
    const c = pfCalc({ ...pos, txs });
    if (c.oversold) return `${assetName(p)} silinirse ${WALLETS[walletOf(pos)]?.label || assetName(pos)} bakiye eksiye düşer (satış gelirleri başka alımlarda kullanılmış). Önce o alımları silin.`;
  }
  for (const [pos, txs] of plan) pos.txs = txs;
  state.portfolio = state.portfolio.filter(x => x.id !== pid);
  return null;
}
/* --- Temettü tespiti ---
   Yahoo'daki temettü kaydı hak kullanım günü gerçekleştikten sonra oluşur: şirketin dağıtımı yaptığı kesindir.
   Hak sahipliği: hak kullanım gününden ÖNCEKİ işlem günü sonunda elde olan adet (işlem tarihi < hak kullanım tarihi).
   Hesaba geçen net tutar (stopaj) ve ödemenin alındığı kullanıcıya onaylatılır. p.divs[tarih] = {status, net, flow, txId} */
export const DIV_TAX = 0.15;
 // varsayılan stopaj (GYO vb. için %0 olabilir; kullanıcı düzeltir)
export const createdOn = id => { const n = parseInt(String(id).slice(0, -5), 36); return Number.isFinite(n) && n > 1.5e12 ? new Date(n).toISOString().slice(0, 10) : null; };
export function heldBefore(p, date) {
  const txs = p.txs.filter(t => (t.date || createdOn(t.id) || '9999') < date);
  return pfCalc({ ...p, txs }).qty;
}
export function pendingDivs() {
  const out = [], today = todayIso();
  for (const p of state.portfolio) {
    if (isAsset(p)) continue;
    const s = BY.get(p.sym);
    for (const [date, per] of s?.divRecent || []) {
      if (date > today || p.divs?.[date]) continue;
      const qty = heldBefore(p, date);
      if (qty > 0) out.push({ p, date, per, qty, gross: qty * per, net: qty * per * (1 - DIV_TAX) });
    }
  }
  return out.sort((a, b) => a.date < b.date ? -1 : 1);
}
export const divReceived = () => state.portfolio.reduce((a, p) => a + Object.values(p.divs || {}).filter(d => d.status === 'received').reduce((x, d) => x + d.net, 0), 0);
export const divReceivedExt = () => state.portfolio.reduce((a, p) => a + Object.values(p.divs || {}).filter(d => d.status === 'received' && d.flow === 'ext').reduce((x, d) => x + d.net, 0), 0);
export function confirmDiv(p, date, net, flow) {
  const rec = { status: 'received', net, flow };
  if (flow === 'cash') {
    const tx = { id: pfId(), type: 'buy', date, qty: net, price: 1, fee: 0, src: p.id, kind: 'div', divDate: date };
    ensureCash().txs.push(tx); rec.txId = tx.id;
  }
  (p.divs ||= {})[date] = rec;
}
// Onaylanmış/yoksayılmış temettüyü geri al (yeniden "bekleyen" olur)
export function undoDiv(p, date) {
  const rec = p.divs?.[date];
  if (!rec) return null;
  const cash = CASH();
  if (rec.txId && cash) {
    const txs = cash.txs.filter(t => t.id !== rec.txId), c = pfCalc({ ...cash, txs });
    if (c.oversold) return 'Bu temettü geri alınırsa TL bakiye eksiye düşer (para sonraki alımlarda kullanılmış). Önce o alımları silin.';
    cash.txs = txs;
  }
  delete p.divs[date];
  return null;
}
// Portföye dışarıdan giren (+) ve çıkan (−) para: net yatırılan
export function netInvested() {
  let net = 0;
  for (const p of state.portfolio) for (const t of p.txs) {
    if (t.src) continue; // bağlı karşılık işlemi (iç transfer / temettü)
    if (isCash(p)) { net += t.type === 'buy' ? t.qty : -t.qty; continue; }
    if (t.flow && t.flow !== 'ext') continue; // cüzdandan ödendi / cüzdana aktarıldı
    net += t.type === 'buy' ? txAmount(t) : -txAmount(t);
  }
  return net;
}
// Coin işlemi: $ (USDT/USDC) cinsinden fiyat/komisyonu işlem günü kuruyla TL'ye çevir
export function toTl(tx, flow, qprice, qfee) {
  const cur = flow === 'USDC' ? 'USDC' : 'USDT', rate = rateAt(cur, tx.date);
  if (!rate) return `${cur}/TL kuru bulunamadı; biraz sonra tekrar deneyin.`;
  tx.q = { cur, price: qprice, fee: qfee || 0, rate };
  tx.price = qprice * rate; tx.fee = (qfee || 0) * rate;
  return null;
}
// Türkçe sayı girişi: "1.234,56" / "1234,56" / "1.000" (binlik) / "4.95" (virgül yoksa ve noktadan sonra 3 hane değilse ondalık)
export const num = v => {
  let t = String(v ?? '').trim().replace(/\s/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const x = parseFloat(t);
  return Number.isFinite(x) ? x : NaN;
};
// Kripto miktarı: virgül varsa Türkçe ("0,0125", "1.234,5"), yoksa nokta HER ZAMAN ondalık ("0.012" = 0,012)
export const numDec = v => { let t = String(v ?? '').trim().replace(/\s/g, ''); if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); const x = parseFloat(t); return Number.isFinite(x) ? x : NaN; };
export const trNum = x => String(+x.toFixed(x !== 0 && Math.abs(x) < 1 ? 8 : 4)).replace('.', ',');
