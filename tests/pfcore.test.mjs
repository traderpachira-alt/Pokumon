// Portföy hesaplarının kalıcı testleri. Çalıştırma: node --test tests/
// Tarayıcı gerektirmez; pfcore.js saf hesap modülüdür.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setData } from '../web/js/data.js';
import { state } from '../web/js/store.js';
import {
  pfCalc, applyTx, removeTx, removePosition, walletBal, cashBal, netInvested, migratePortfolio,
  heldBefore, pendingDivs, confirmDiv, undoDiv, divReceived, divReceivedExt, rateAt, toTl, num, numDec, trNum, pfId, pfRows,
} from '../web/js/pfcore.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b} bekleniyordu`);
let seq = 0;
const tx = (type, date, qty, price, fee = 0, extra = {}) => ({ id: 't' + (++seq), type, date, qty, price, fee, ...extra });
const pos = (cat, sym, txs = []) => { const p = { id: 'p' + (++seq), cat, sym, note: null, txs }; state.portfolio.push(p); return p; };

// Örnek veri: iki hisse, varlık fiyatları ve USDT/TL kur geçmişi
const SUMMARY = {
  stocks: [
    { t: 'AAAA', last: 120, chg1d: 0.02, divRecent: [['2025-05-10', 2], ['2025-11-20', 1.5]] },
    { t: 'BBBB', last: 50, chg1d: -0.01, divRecent: [] },
  ],
  assets: { USDT: { last: 42 }, USDC: { last: 42.1 }, BTC: { last: 4200000 }, XAU: { last: 5000 }, TRY: { last: 1 } },
};
const FXH = { USDT: { d: ['2025-01-02', '2025-03-03', '2025-06-02'], c: [35, 36.5, 39] }, USDC: { d: ['2025-01-02'], c: [35.1] } };

beforeEach(() => { state.portfolio = []; setData(structuredClone(SUMMARY), structuredClone(FXH)); });

test('ortalama maliyet ve gerçekleşen K/Z', () => {
  const p = pos('trend', 'AAAA', [tx('buy', '2025-01-10', 100, 10, 5), tx('buy', '2025-02-10', 100, 20, 5), tx('sell', '2025-03-10', 50, 30, 10)]);
  const c = pfCalc(p);
  near(c.qty, 150);
  near(c.avg, 3010 / 200);              // satış ortalamayı değiştirmez
  near(c.cost, 150 * 15.05);
  near(c.realized, 50 * 30 - 10 - 50 * 15.05);
  assert.equal(c.lastSell, '2025-03-10');
  assert.equal(c.oversold, null);
});

test('işlemler tarih sırasıyla hesaplanır, tarihsizler başta', () => {
  const p = pos('trend', 'AAAA', [tx('sell', '2025-03-01', 10, 20), tx('buy', null, 10, 10), tx('buy', '2025-02-01', 10, 30)]);
  const c = pfCalc(p);
  near(c.qty, 10);
  near(c.realized, 10 * 20 - 10 * 20); // satış anında ortalama (10+30)/2 = 20
});

test('tüm adet satılınca maliyet sıfırlanır', () => {
  const p = pos('trend', 'AAAA', [tx('buy', '2025-01-01', 3, 10), tx('sell', '2025-01-02', 3, 12)]);
  const c = pfCalc(p);
  assert.equal(c.qty, 0); assert.equal(c.cost, 0); near(c.realized, 6);
});

test('elde olandan fazla satış reddedilir ve hiçbir şey değişmez', () => {
  const p = pos('trend', 'AAAA', [tx('buy', '2025-01-10', 10, 10)]);
  const msg = applyTx(p, tx('sell', '2025-01-05', 5, 12), 'ext');   // alımdan önceki tarihte
  assert.match(msg, /daha fazlası satılamaz/);
  assert.equal(p.txs.length, 1);
  assert.match(applyTx(p, tx('sell', '2025-02-01', 11, 12), 'ext'), /daha fazlası satılamaz/);
  assert.equal(applyTx(p, tx('sell', '2025-02-01', 10, 12), 'ext'), null);
});

test('TL bakiyesinden alım: bakiye düşer, yetmezse reddedilir', () => {
  const cash = pos('emtia', 'TRY');
  assert.equal(applyTx(cash, tx('buy', '2025-01-01', 1000, 1), 'cash'), null); // para yatırma
  assert.equal(cash.txs.length, 1);
  near(cashBal(), 1000);
  const p = pos('temettu', 'AAAA');
  assert.equal(applyTx(p, tx('buy', '2025-01-05', 50, 19.9, 5), 'cash'), null);
  near(cashBal(), 1000 - (50 * 19.9 + 5));
  const ctx = cash.txs.find(t => t.src === p.id);
  assert.equal(ctx.type, 'sell'); assert.equal(ctx.link, p.txs[0].id); assert.equal(p.txs[0].link, ctx.id);
  // Bakiye yetersiz; tarih yatırmadan önce olsa da yetersiz
  assert.match(applyTx(p, tx('buy', '2025-01-06', 100, 20), 'cash'), /TL bakiye yetersiz/);
  assert.match(applyTx(p, tx('buy', '2024-12-31', 1, 20), 'cash'), /TL bakiye yetersiz/);
  assert.equal(p.txs.length, 1);
});

test('TL cüzdanı yokken TL ile alım reddedilir', () => {
  const p = pos('temettu', 'AAAA');
  assert.match(applyTx(p, tx('buy', '2025-01-05', 1, 10), 'cash'), /bakiye yetersiz/);
  assert.equal(state.portfolio.length, 1);
});

test('satış geliri TL bakiyesine aktarılır (komisyon düşülerek)', () => {
  const p = pos('trend', 'AAAA', [tx('buy', '2025-01-01', 10, 10, 0, { flow: 'ext' })]);
  assert.equal(applyTx(p, tx('sell', '2025-02-01', 10, 15, 3), 'cash'), null);
  near(cashBal(), 147);
  assert.match(applyTx(p, tx('sell', '2025-02-02', 0, 15, 3), 'cash') || '', /daha fazlası|Komisyon/);
});

test('işlem silinince cüzdandaki karşılığı da silinir; bakiye eksiye düşecekse engellenir', () => {
  const cash = pos('emtia', 'TRY');
  applyTx(cash, tx('buy', '2025-01-01', 500, 1), 'cash');
  const a = pos('trend', 'AAAA', [tx('buy', '2025-01-01', 10, 10)]);
  const sell = tx('sell', '2025-02-01', 10, 30);
  applyTx(a, sell, 'cash');                            // +300 → 800
  const b = pos('trend', 'BBBB');
  applyTx(b, tx('buy', '2025-02-05', 14, 50), 'cash');  // −700 → 100
  near(cashBal(), 100);
  assert.match(removeTx(a, sell.id), /TL bakiye.*eksiye düşer/);   // 300 olmadan 700'lük alım yapılamazdı
  assert.equal(a.txs.length, 2);
  const auto = cash.txs.find(t => t.src === a.id);
  assert.match(removeTx(cash, auto.id), /otomatik oluştu/);
  assert.equal(removeTx(b, b.txs[0].id), null);
  near(cashBal(), 800);
  assert.equal(removeTx(a, sell.id), null);
  near(cashBal(), 500);
  assert.equal(cash.txs.length, 1);
});

test('pozisyon silme kuralları', () => {
  const cash = pos('emtia', 'TRY');
  const a = pos('trend', 'AAAA', [tx('buy', '2025-01-01', 10, 10)]);
  applyTx(a, tx('sell', '2025-02-01', 10, 30), 'cash');
  assert.match(removePosition(cash.id), /başka varlıkların/);
  const b = pos('trend', 'BBBB');
  applyTx(b, tx('buy', '2025-02-05', 5, 50), 'cash');
  assert.match(removePosition(a.id), /eksiye düşer/);
  assert.equal(removePosition(b.id), null);
  assert.equal(removePosition(a.id), null);
  assert.equal(cash.txs.length, 0);
  assert.equal(removePosition(cash.id), null);
  assert.equal(state.portfolio.length, 0);
});

test('net yatırılan: iç transferler sayılmaz', () => {
  const cash = pos('emtia', 'TRY');
  applyTx(cash, tx('buy', '2025-01-01', 1000, 1), 'cash');            // +1000 yatırma
  const a = pos('trend', 'AAAA');
  applyTx(a, tx('buy', '2025-01-02', 10, 50), 'cash');                // iç
  applyTx(a, tx('buy', '2025-01-03', 10, 40, 2), 'ext');              // +402 dışarıdan
  applyTx(a, tx('sell', '2025-02-01', 5, 60), 'cash');                // iç
  applyTx(a, tx('sell', '2025-02-02', 5, 70, 1), 'ext');              // −349 dışarı
  applyTx(cash, tx('sell', '2025-03-01', 100, 1), 'cash');            // −100 çekme
  near(netInvested(), 1000 + 402 - 349 - 100);
});

test('işlem günü kuru: geçmişte ikili arama, sonrasında güncel kur', () => {
  assert.equal(rateAt('USDT', '2025-01-02'), 35);
  assert.equal(rateAt('USDT', '2025-02-15'), 35);
  assert.equal(rateAt('USDT', '2025-03-03'), 36.5);
  assert.equal(rateAt('USDT', '2025-04-01'), 36.5);
  assert.equal(rateAt('USDT', '2025-06-02'), 42);   // son gün ve sonrası: güncel
  assert.equal(rateAt('USDT', '2024-12-01'), 42);   // geçmişin öncesi: güncel
  assert.equal(rateAt('USDT', null), 42);
  setData(structuredClone(SUMMARY), null);
  assert.equal(rateAt('USDT', '2025-01-02'), 42);   // kur dosyası yoksa güncel
});

test('USDT ile coin alımı: TL karşılığı işlem günü kuruyla, USDT bakiyesi düşer', () => {
  const usdt = pos('kripto', 'USDT');
  applyTx(usdt, tx('buy', '2025-01-02', 1000, 35), 'ext');
  assert.equal(usdt.txs[0].flow, 'ext');
  const btc = pos('kripto', 'BTC');
  const t = tx('buy', '2025-03-10', 0.01, 0, 0);
  assert.equal(toTl(t, 'USDT', 80000, 1), null);
  near(t.price, 80000 * 36.5); near(t.fee, 36.5);
  assert.deepEqual(t.q, { cur: 'USDT', price: 80000, fee: 1, rate: 36.5 });
  assert.equal(applyTx(btc, t, 'USDT'), null);
  near(walletBal('USDT'), 1000 - 801);
  const ctx = usdt.txs.find(x => x.src === btc.id);
  assert.equal(ctx.price, 36.5);                              // USDT o günkü TL kurundan "satıldı"
  near(pfCalc(usdt).realized, 801 * (36.5 - 35));            // kur farkı K/Z USDT'de
  assert.match(applyTx(btc, (() => { const x = tx('buy', '2025-03-11', 1, 0); toTl(x, 'USDT', 80000); return x; })(), 'USDT'), /USDT bakiye yetersiz/);
});

test('TL ile USDT alımı TL bakiyesinden düşer', () => {
  const cash = pos('emtia', 'TRY');
  applyTx(cash, tx('buy', '2025-01-01', 10000, 1), 'cash');
  const usdt = pos('kripto', 'USDT');
  assert.equal(applyTx(usdt, tx('buy', '2025-01-02', 100, 35), 'cash'), null);
  near(cashBal(), 6500);
  near(walletBal('USDT'), 100);
});

test('kur bulunamazsa coin işlemi reddedilir', () => {
  setData({ ...structuredClone(SUMMARY), assets: {} }, null);
  assert.match(toTl(tx('buy', '2025-01-01', 1, 0), 'USDC', 1), /USDC\/TL kuru bulunamadı/);
});

test('temettü hak sahipliği: işlem tarihi < hak kullanım tarihi', () => {
  const p = pos('temettu', 'AAAA', [tx('buy', '2025-05-09', 100, 10), tx('buy', '2025-05-10', 50, 10), tx('sell', '2025-11-19', 30, 12)]);
  assert.equal(heldBefore(p, '2025-05-10'), 100);   // hak kullanım günü alınan 50 hak etmez
  assert.equal(heldBefore(p, '2025-11-20'), 120);
  const pend = pendingDivs();
  assert.equal(pend.length, 2);
  assert.equal(pend[0].date, '2025-05-10'); near(pend[0].gross, 200); near(pend[0].net, 170);
  near(pend[1].gross, 180);
});

test('temettü onayı TL bakiyesine yazılır; geri alınabilir, bakiye kullanıldıysa engellenir', () => {
  const p = pos('temettu', 'AAAA', [tx('buy', '2025-01-01', 100, 10)]);
  confirmDiv(p, '2025-05-10', 170, 'cash');
  near(cashBal(), 170); near(divReceived(), 170); near(divReceivedExt(), 0);
  assert.equal(pendingDivs().length, 1);
  confirmDiv(p, '2025-11-20', 127.5, 'ext');
  near(divReceived(), 297.5); near(divReceivedExt(), 127.5);
  near(netInvested(), 1000);                         // temettü yatırım sayılmaz
  const b = pos('trend', 'BBBB');
  applyTx(b, tx('buy', '2025-06-01', 3, 50), 'cash'); // 150 harcandı
  assert.match(undoDiv(p, '2025-05-10'), /eksiye düşer/);
  const divTx = state.portfolio.find(x => x.sym === 'TRY').txs.find(t => t.kind === 'div');
  assert.match(removeTx(state.portfolio.find(x => x.sym === 'TRY'), divTx.id), /eksiye düşer/);
  removeTx(b, b.txs[0].id);
  assert.equal(removeTx(state.portfolio.find(x => x.sym === 'TRY'), divTx.id), null); // TL'den silmek temettüyü geri alır
  assert.equal(p.divs['2025-05-10'], undefined);
  near(cashBal(), 0);
  assert.equal(pendingDivs().length, 1);
});

test('gelecekteki ve varlık pozisyonlarındaki temettüler bekleyen sayılmaz', () => {
  const d = structuredClone(SUMMARY); d.stocks[0].divRecent = [['2999-01-01', 1]]; setData(d, FXH);
  pos('temettu', 'AAAA', [tx('buy', '2025-01-01', 10, 10)]);
  pos('emtia', 'XAU', [tx('buy', '2025-01-01', 10, 10)]);
  assert.equal(pendingDivs().length, 0);
});

test('eski biçimdeki pozisyonlar işlem listesine çevrilir', () => {
  const out = migratePortfolio([
    { id: 'x', cat: 'temettu', sym: 'AAAA', qty: 10, cost: 12.5, date: '2024-01-02' },
    { cat: 'yok', sym: 'BBBB', qty: 1, cost: 1 },
    null,
    { id: 'y', cat: 'trend', sym: 'BBBB', txs: [tx('buy', null, 1, 1)] },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].txs.length, 1);
  assert.deepEqual({ ...out[0].txs[0], id: 0 }, { id: 0, type: 'buy', date: '2024-01-02', qty: 10, price: 12.5, fee: 0 });
  assert.equal(out[1].id, 'y');
  assert.deepEqual(migratePortfolio(undefined), []);
});

test('portföy satırları: değer, K/Z ve günlük değişim', () => {
  pos('trend', 'AAAA', [tx('buy', '2025-01-01', 10, 100)]);
  pos('emtia', 'XAU', [tx('buy', '2025-01-01', 2, 4000)]);
  pos('trend', 'ZZZZ', [tx('buy', '2025-01-01', 1, 1)]);   // verisi olmayan hisse
  const [a, x, z] = pfRows();
  near(a.value, 1200); near(a.pl, 200); near(a.plPct, 0.2); near(a.day, 1200 - 1200 / 1.02);
  near(x.value, 10000); near(x.pl, 2000);
  assert.equal(z.value, null); assert.equal(z.pl, null);
});

test('sayı girişi: Türkçe biçim ve kripto ondalığı', () => {
  assert.equal(num('1.234,56'), 1234.56);
  assert.equal(num('1234,56'), 1234.56);
  assert.equal(num('1.000'), 1000);
  assert.equal(num('1.000.000'), 1000000);
  assert.equal(num('4.95'), 4.95);
  assert.equal(num(' 12 500 '), 12500);
  assert.ok(Number.isNaN(num('abc')));
  assert.ok(Number.isNaN(num('')));
  assert.equal(numDec('0.012'), 0.012);
  assert.equal(numDec('1.000'), 1);
  assert.equal(numDec('0,0125'), 0.0125);
  assert.equal(numDec('1.234,5'), 1234.5);
  assert.equal(trNum(0.00012345), '0,00012345');
  assert.equal(trNum(1234.5), '1234,5');
});

test('kimlikler benzersiz', () => {
  const ids = new Set(Array.from({ length: 1000 }, pfId));
  assert.equal(ids.size, 1000);
});
