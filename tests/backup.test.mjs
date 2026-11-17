// Yedek dosyası ve içe aktarma testleri
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../web/js/store.js';
import { backupJson, backupName, parseBackup, mergeData, replaceData, normalize } from '../web/js/backup.js';

const pos = (id, sym, txs, cat = 'trend') => ({ id, cat, sym, note: null, txs });
const buy = (id, qty, price, date = '2025-01-01') => ({ id, type: 'buy', date, qty, price, fee: 0 });

beforeEach(() => {
  state.watch = ['AAAA']; state.saved = [{ name: 'S1', preset: 'all' }]; state.compare = ['XU100'];
  state.portfolio = [pos('p1', 'AAAA', [buy('t1', 10, 5)])];
});

test('yedek → geri yükleme aynı veriyi verir', () => {
  const text = backupJson(new Date('2025-06-01T10:00:00Z'));
  const j = JSON.parse(text);
  assert.equal(j.app, 'tahta'); assert.equal(j.version, 1); assert.equal(j.created, '2025-06-01T10:00:00.000Z');
  const d = parseBackup(text);
  assert.deepEqual(d.p, state.portfolio);
  assert.deepEqual(d.w, ['AAAA']); assert.deepEqual(d.c, ['XU100']);
  assert.equal(d.saved, undefined); assert.equal(d.s[0].name, 'S1');
});

test('dosya adı tarih ve saat içerir', () => {
  assert.match(backupName(new Date()), /^tahta-yedek-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/);
});

test('geçersiz dosyalar anlaşılır hatayla reddedilir', () => {
  assert.throws(() => parseBackup('merhaba'), /geçerli bir JSON değil/);
  assert.throws(() => parseBackup('{"a":1}'), /Tahta yedek dosyası değil/);
  assert.throws(() => parseBackup('{"app":"tahta","version":99}'), /daha yeni bir sürüm/);
  const broken = { app: 'tahta', version: 1, portfolio: [pos('p', 'BBBB', [buy('a', 1, 1), { id: 'b', type: 'sell', date: '2025-02-01', qty: 5, price: 1 }])] };
  assert.throws(() => parseBackup(JSON.stringify(broken)), /BBBB kaydı tutarsız/);
});

test('bozuk kayıtlar ayıklanır, eski biçim çevrilir', () => {
  const d = normalize({ w: ['A', 3, null], s: [{ name: 'x' }, {}], c: ['XU100', {}], p: [
    pos('ok', 'AAAA', [buy('a', 1, 1), { id: 'z', type: 'buy', qty: 'çok', price: 1 }, null]),
    { id: 'old', cat: 'temettu', sym: 'BBBB', qty: 4, cost: 2, date: '2024-01-01' },
    { id: 'bad', cat: 'yok', sym: 'CCCC', txs: [] },
    { cat: 'trend', sym: 'DDDD', txs: [] },
  ] });
  assert.deepEqual(d.w, ['A']); assert.equal(d.s.length, 1); assert.deepEqual(d.c, ['XU100']);
  assert.deepEqual(d.p.map(p => p.id), ['ok', 'old']);
  assert.equal(d.p[0].txs.length, 1);
  assert.equal(d.p[1].txs[0].qty, 4); assert.equal(d.p[1].txs[0].price, 2);
});

test('birleştir: mevcutlar korunur, aynı kimlikliler güncellenir', () => {
  const d = normalize({ w: ['AAAA', 'BBBB'], s: [{ name: 'S1', preset: 'x' }, { name: 'S2' }], c: [],
    p: [pos('p1', 'AAAA', [buy('t1', 20, 5)]), pos('p2', 'BBBB', [buy('t2', 1, 1)])] });
  const r = mergeData(d);
  assert.deepEqual(r, { watch: 1, saved: 2, pAdded: 1, pUpdated: 1 });
  assert.deepEqual(state.watch, ['AAAA', 'BBBB']);
  assert.equal(state.saved.find(x => x.name === 'S1').preset, 'x');
  assert.equal(state.portfolio.length, 2);
  assert.equal(state.portfolio[0].txs[0].qty, 20);
});

test('tümünü değiştir: cihazdaki veri yedektekiyle aynı olur', () => {
  const d = normalize({ w: ['ZZZZ'], s: [], c: [], p: [pos('p9', 'ZZZZ', [buy('t9', 1, 1)])] });
  replaceData(d);
  assert.deepEqual(state.watch, ['ZZZZ']); assert.deepEqual(state.saved, []);
  assert.deepEqual(state.portfolio.map(p => p.id), ['p9']);
  assert.deepEqual(state.compare, ['XU100']);       // yedekte karşılaştırma yoksa mevcut kalır
});
