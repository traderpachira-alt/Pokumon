// DCF hesaplayıcısı (web/js/dcf.js) — scripts/dcf.py ile aynı model
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equityValue, impliedGrowth, igFmt } from '../web/js/dcf.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('sabit büyümede Gordon formülü', () => {
  const v = equityValue(100, 0.03, 0.03, 0.10, 0, 0);
  near(v.ev, 100 * 1.03 / 0.07);
  near(equityValue(100, 0.03, 0.03, 0.10, 200, 50).eq, v.ev - 250);
});

test('Python ile aynı değer (10 yıl, azalan büyüme)', () => {
  // python3 -c "import dcf; print(dcf.equity_value(80, .07, .03, .11, 100, 10))" ile üretilen değer
  near(equityValue(80, 0.07, 0.03, 0.11, 100, 10).eq, 1098.8469529135878, 1e-6);
});

test('ters DCF geri dönüş ve sınırlar', () => {
  const target = equityValue(80, 0.07, 0.03, 0.11, 100, 10).eq;
  near(impliedGrowth(target, 80, 0.03, 0.11, 100, 10).g, 0.07, 1e-5);
  assert.equal(impliedGrowth(1e12, 80, 0.03, 0.11, 100, 10).clip, 'high');
  assert.equal(impliedGrowth(-1e12, 80, 0.03, 0.11, 100, 10).clip, 'low');
  assert.equal(igFmt(0.6, 'high'), '≥ %60');
});
