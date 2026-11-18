"""Teknik göstergeler (arayüzdeki web/ind.js ile aynı sonuçlar). Veri derlemesi ve sinyal modülü ortak kullanır."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd


def ema(x: np.ndarray, n: int) -> np.ndarray:
    return pd.Series(x).ewm(span=n, adjust=False).mean().to_numpy()


def sma(x: np.ndarray, n: int) -> np.ndarray:
    return pd.Series(x).rolling(n).mean().to_numpy()


def wilder_rsi(c: np.ndarray, n: int = 14) -> np.ndarray:
    out = np.full(len(c), np.nan)
    if len(c) <= n:
        return out
    d = np.diff(c)
    g = np.clip(d[:n], 0, None).mean()
    l = np.clip(-d[:n], 0, None).mean()
    out[n] = 100.0 if l == 0 else 100 - 100 / (1 + g / l)
    for i in range(n + 1, len(c)):
        x = d[i - 1]
        g = (g * (n - 1) + max(x, 0.0)) / n
        l = (l * (n - 1) + max(-x, 0.0)) / n
        out[i] = 100.0 if l == 0 else 100 - 100 / (1 + g / l)
    return out


def rma(x: np.ndarray, n: int) -> np.ndarray:
    """Wilder ortalaması: ilk n değerin ortalamasıyla başlar (x[0]'dan itibaren dolu olmalı)."""
    out = np.full(len(x), np.nan)
    if len(x) < n:
        return out
    out[n - 1] = x[:n].mean()
    for i in range(n, len(x)):
        out[i] = (out[i - 1] * (n - 1) + x[i]) / n
    return out


def true_range(h, lo, c):
    tr = h - lo
    tr[1:] = np.maximum.reduce([h[1:] - lo[1:], np.abs(h[1:] - c[:-1]), np.abs(lo[1:] - c[:-1])])
    return tr


def rolling_mid(h, lo, n):
    return (pd.Series(h).rolling(n).max() + pd.Series(lo).rolling(n).min()).to_numpy() / 2


def stoch_rsi(c, rsi_n=14, st_n=14, k=3, d=3):
    r = pd.Series(wilder_rsi(c, rsi_n))
    lo, hi = r.rolling(st_n).min(), r.rolling(st_n).max()
    rng = hi - lo
    st = ((r - lo) / rng.where(rng > 0) * 100).where(rng > 0, 50.0).where(r.notna() & lo.notna())
    kk = st.rolling(k).mean()
    return kk.to_numpy(), kk.rolling(d).mean().to_numpy()


def fisher(h, lo, n=9):
    """Ehlers Fisher dönüşümü (TradingView ile aynı)."""
    hl2 = (h + lo) / 2
    hi_, lo_ = pd.Series(hl2).rolling(n).max().to_numpy(), pd.Series(hl2).rolling(n).min().to_numpy()
    fish = np.full(len(hl2), np.nan)
    v_prev = f_prev = 0.0
    for i in range(n - 1, len(hl2)):
        v = 0.66 * ((hl2[i] - lo_[i]) / max(hi_[i] - lo_[i], 0.001) - 0.5) + 0.67 * v_prev
        v = min(max(v, -0.999), 0.999)
        f = 0.5 * math.log((1 + v) / max(1 - v, 0.001)) + 0.5 * f_prev
        fish[i], v_prev, f_prev = f, v, f
    trigger = np.r_[np.nan, fish[:-1]]
    return fish, trigger


def supertrend(h, lo, c, n=10, mult=3.0):
    """Supertrend (TradingView ile aynı). Döner: (çizgi, trend: 1 / -1)."""
    atr = rma(true_range(h, lo, c), n)
    src = (h + lo) / 2
    line = np.full(len(c), np.nan)
    trend = np.full(len(c), np.nan)
    up_p = dn_p = None
    t = 1
    for i in range(n - 1, len(c)):
        up, dn = src[i] - mult * atr[i], src[i] + mult * atr[i]
        if up_p is not None:
            if c[i - 1] > up_p:
                up = max(up, up_p)
            if c[i - 1] < dn_p:
                dn = min(dn, dn_p)
            if t == -1 and c[i] > dn_p:
                t = 1
            elif t == 1 and c[i] < up_p:
                t = -1
        line[i], trend[i] = (up if t == 1 else dn), t
        up_p, dn_p = up, dn
    return line, trend


def ichimoku(h, lo, conv=9, base=26, span_b=52, disp=26):
    """Bulut bugünkü tarihe hizalı: span A/B, 26 bar önce hesaplanan değerlerdir."""
    tenkan, kijun = rolling_mid(h, lo, conv), rolling_mid(h, lo, base)
    a = (tenkan + kijun) / 2
    b = rolling_mid(h, lo, span_b)
    shift = lambda x: np.r_[np.full(disp, np.nan), x[:-disp]] if len(x) > disp else np.full(len(x), np.nan)  # noqa: E731
    return tenkan, kijun, shift(a), shift(b)


def vwma(c, v, n=20):
    cv = pd.Series(c * v).rolling(n).sum()
    vs = pd.Series(v).rolling(n).sum()
    return (cv / vs.where(vs > 0)).to_numpy()
