// Teknik göstergeler. scripts/fetch_data.py ile aynı formüller (tarama ve grafik aynı sonucu verir).

export function sma(v, n) {
  const out = new Array(v.length).fill(null);
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i];
    if (i >= n) s -= v[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

// pandas ewm(span=n, adjust=False) ile aynı: ilk değerle başlar.
export function ema(v, n) {
  const out = new Array(v.length).fill(null);
  const k = 2 / (n + 1);
  let e = null;
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (x == null) continue;
    e = e == null ? x : x * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

// Wilder RSI: ilk n değişimin ortalamasıyla başlar, sonra (n-1)/n yumuşatma.
export function rsi(c, n = 14) {
  const out = new Array(c.length).fill(null);
  if (c.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const d = c[i] - c[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

export function macd(c, fast = 12, slow = 26, sig = 9) {
  const a = ema(c, fast), b = ema(c, slow);
  const line = a.map((x, i) => x - b[i]);
  const signal = ema(line, sig);
  return { line, signal, hist: line.map((x, i) => x - signal[i]) };
}

export function bollinger(c, n = 20, k = 2) {
  const mid = sma(c, n);
  const upper = new Array(c.length).fill(null), lower = new Array(c.length).fill(null);
  for (let i = n - 1; i < c.length; i++) {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (c[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / n);
    upper[i] = mid[i] + k * sd;
    lower[i] = mid[i] - k * sd;
  }
  return { mid, upper, lower };
}

// ---- Boş değer (null) içeren seriler için yardımcılar ----
const nulls = n => new Array(n).fill(null);

// Penceredeki her değer doluysa ortalama, değilse null (pandas rolling().mean() gibi).
export function smaN(v, n) {
  const out = nulls(v.length);
  for (let i = n - 1; i < v.length; i++) {
    let s = 0, okk = true;
    for (let j = i - n + 1; j <= i; j++) { if (v[j] == null) { okk = false; break; } s += v[j]; }
    if (okk) out[i] = s / n;
  }
  return out;
}
function rollMax(v, n) { const o = nulls(v.length); for (let i = n - 1; i < v.length; i++) { let m = -Infinity; for (let j = i - n + 1; j <= i; j++) { if (v[j] == null) { m = null; break; } m = Math.max(m, v[j]); } o[i] = m; } return o; }
function rollMin(v, n) { const o = nulls(v.length); for (let i = n - 1; i < v.length; i++) { let m = Infinity; for (let j = i - n + 1; j <= i; j++) { if (v[j] == null) { m = null; break; } m = Math.min(m, v[j]); } o[i] = m; } return o; }

// Wilder ortalaması: ilk n değerin ortalamasıyla başlar.
export function rma(x, n) {
  const out = nulls(x.length);
  if (x.length < n) return out;
  let s = 0; for (let i = 0; i < n; i++) s += x[i];
  out[n - 1] = s / n;
  for (let i = n; i < x.length; i++) out[i] = (out[i - 1] * (n - 1) + x[i]) / n;
  return out;
}
export function trueRange(h, l, c) {
  return h.map((_, i) => i === 0 ? h[0] - l[0] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
}
export const atr = (h, l, c, n = 14) => rma(trueRange(h, l, c), n);

export function stochRsi(c, rsiN = 14, stN = 14, k = 3, d = 3) {
  const r = rsi(c, rsiN), lo = rollMin(r, stN), hi = rollMax(r, stN);
  const st = r.map((x, i) => x == null || lo[i] == null ? null : hi[i] - lo[i] > 0 ? (x - lo[i]) / (hi[i] - lo[i]) * 100 : 50);
  const K = smaN(st, k);
  return { k: K, d: smaN(K, d) };
}

export function fisher(h, l, n = 9) {
  const hl2 = h.map((x, i) => (x + l[i]) / 2), hi = rollMax(hl2, n), lo = rollMin(hl2, n);
  const fish = nulls(h.length);
  let vp = 0, fp = 0;
  for (let i = n - 1; i < h.length; i++) {
    let v = 0.66 * ((hl2[i] - lo[i]) / Math.max(hi[i] - lo[i], 0.001) - 0.5) + 0.67 * vp;
    v = Math.min(Math.max(v, -0.999), 0.999);
    const f = 0.5 * Math.log((1 + v) / Math.max(1 - v, 0.001)) + 0.5 * fp;
    fish[i] = f; vp = v; fp = f;
  }
  return { fish, trigger: [null, ...fish.slice(0, -1)] };
}

export function supertrend(h, l, c, n = 10, mult = 3) {
  const a = atr(h, l, c, n);
  const line = nulls(c.length), trend = nulls(c.length);
  let upP = null, dnP = null, t = 1;
  for (let i = n - 1; i < c.length; i++) {
    const src = (h[i] + l[i]) / 2;
    let up = src - mult * a[i], dn = src + mult * a[i];
    if (upP != null) {
      if (c[i - 1] > upP) up = Math.max(up, upP);
      if (c[i - 1] < dnP) dn = Math.min(dn, dnP);
      if (t === -1 && c[i] > dnP) t = 1;
      else if (t === 1 && c[i] < upP) t = -1;
    }
    line[i] = t === 1 ? up : dn; trend[i] = t;
    upP = up; dnP = dn;
  }
  return { line, trend };
}

// Bulut bugünkü tarihe hizalı (span A/B 26 bar önce hesaplanan değerler).
export function ichimoku(h, l, conv = 9, base = 26, spanB = 52, disp = 26) {
  const mid = n => { const hi = rollMax(h, n), lo = rollMin(l, n); return hi.map((x, i) => x == null ? null : (x + lo[i]) / 2); };
  const tenkan = mid(conv), kijun = mid(base), b = mid(spanB);
  const a = tenkan.map((x, i) => x == null || kijun[i] == null ? null : (x + kijun[i]) / 2);
  const shift = x => [...nulls(Math.min(disp, x.length)), ...x.slice(0, Math.max(0, x.length - disp))];
  return { tenkan, kijun, spanA: shift(a), spanB: shift(b) };
}

export function vwma(c, v, n = 20) {
  const out = nulls(c.length);
  for (let i = n - 1; i < c.length; i++) {
    let cv = 0, vs = 0;
    for (let j = i - n + 1; j <= i; j++) { cv += c[j] * v[j]; vs += v[j]; }
    out[i] = vs > 0 ? cv / vs : null;
  }
  return out;
}
