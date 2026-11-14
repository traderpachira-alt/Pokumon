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
