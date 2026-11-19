"""Sinyal modülü testleri. Çalıştırma: python -m unittest discover -s tests"""
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import signals as S  # noqa: E402


def walk(n=600, seed=1, drift=0.0008):
    rng = np.random.default_rng(seed)
    c = 100 * np.exp(np.cumsum(rng.normal(drift, 0.02, n)))
    o = np.r_[c[0], c[:-1]] * (1 + rng.normal(0, 0.004, n))
    h = np.maximum(o, c) * (1 + np.abs(rng.normal(0, 0.01, n)))
    lo = np.minimum(o, c) * (1 - np.abs(rng.normal(0, 0.01, n)))
    v = rng.lognormal(16, 0.4, n)
    idx = pd.bdate_range("2022-01-03", periods=n)
    return pd.DataFrame({"Open": o, "High": h, "Low": lo, "Close": c, "Volume": v}, index=idx)


def bars(rows):
    """[(o, h, l, c)] → frame benzeri sözlük (simulate yalnızca o/h/l/c kullanır)."""
    a = np.array(rows, dtype=float)
    return {"o": a[:, 0], "h": a[:, 1], "l": a[:, 2], "c": a[:, 3], "idx": pd.bdate_range("2026-01-01", periods=len(a))}


class SimulateTest(unittest.TestCase):
    sig = {"entry": 100.0, "stop": 95.0, "tp": 110.0}

    def r(self, rows):
        return S.simulate(bars([(100, 100, 100, 100)] + rows), 0, self.sig)

    def test_target(self):
        x = self.r([(100, 104, 99, 103), (103, 111, 102, 109)])
        self.assertEqual(x["status"], "tp")
        self.assertAlmostEqual(x["r"], 2 - S.COST * 100 / 5, places=6)
        self.assertEqual(x["exit_t"], 2)

    def test_stop_and_same_bar_is_stop(self):
        self.assertEqual(self.r([(100, 101, 94, 96)])["status"], "stop")
        x = self.r([(100, 111, 94, 100)])  # aynı mumda ikisi de: temkinli → stop
        self.assertEqual(x["status"], "stop")
        self.assertAlmostEqual(x["r"], -1 - S.COST * 100 / 5, places=6)

    def test_gap_down_exits_at_open(self):
        x = self.r([(100, 101, 99, 100), (90, 92, 89, 91)])
        self.assertEqual(x["status"], "stop")
        self.assertAlmostEqual(x["exit"], 90)
        self.assertLess(x["r"], -1.9)

    def test_skip_when_open_bad(self):
        self.assertEqual(self.r([(94, 96, 93, 95)])["status"], "skip")       # açılış stopun altında
        self.assertEqual(self.r([(103, 104, 102, 103)])["status"], "skip")   # 0,5R'den fazla yukarıda: kaçtı
        self.assertNotEqual(self.r([(102, 103, 101, 102)])["status"], "skip")

    def test_r_uses_planned_risk(self):
        # Açılış stopa çok yakın (95,10) gelip hedefe giderse kazanç planlanan riske göre ölçülür; şişmez
        x = self.r([(95.1, 111, 95.05, 110)])
        self.assertEqual(x["status"], "tp")
        self.assertAlmostEqual(x["r"], (110 - 95.1) / 5 - S.COST * 95.1 / 5, places=6)
        self.assertLess(x["r"], 3.5)
        self.assertAlmostEqual(x["pct"], 110 / 95.1 - 1 - S.COST, places=6)

    def test_pending_open_time(self):
        self.assertEqual(S.simulate(bars([(100, 100, 100, 100)]), 0, self.sig)["status"], "pending")
        self.assertEqual(self.r([(100, 102, 99, 101)] * 5)["status"], "open")
        x = self.r([(100, 102, 99, 101)] * (S.HOLD_MAX + 3))
        self.assertEqual(x["status"], "time")
        self.assertEqual(x["exit_t"], S.HOLD_MAX)


class AccountTest(unittest.TestCase):
    def test_sizing_and_limits(self):
        d = pd.bdate_range("2024-01-01", periods=30)
        win = {"d0": d[0], "d1": d[5], "pct": 0.10, "rp": 0.05}    # %5 stop, %10 kazanç → 1R=%1 ile pozisyon %20, +%2
        lose = {"d0": d[6], "d1": d[8], "pct": -0.05, "rp": 0.05}  # −1R → −%1
        a = S.account([win, lose], capital=100_000, risk=0.01, max_pos=10)
        self.assertEqual(a["taken"], 2)
        self.assertAlmostEqual(a["final"], 100_000 * 1.02 * 0.99, delta=2)
        # Aynı gün çok sinyal: en fazla max_pos pozisyon; nakit yetmezse küçülür (kaldıraç yok)
        many = [{"d0": d[0], "d1": d[3], "pct": 0.0, "rp": 0.01} for _ in range(5)]  # her biri %100 pozisyon isterdi
        self.assertEqual(S.account(many, max_pos=3)["taken"], 1)
        self.assertIsNone(S.account([]))

    def test_no_lookahead_in_selection(self):
        # Aynı gün iki sinyal, tek pozisyon hakkı: seçim çıkış tarihine (geleceğe) göre değil, hisse koduna göre yapılır
        d = pd.bdate_range("2024-01-01", periods=30)
        long_win = {"d0": d[0], "d1": d[20], "pct": 0.20, "rp": 1.0, "sym": "AAA"}
        quick_loss = {"d0": d[0], "d1": d[1], "pct": -0.05, "rp": 1.0, "sym": "ZZZ"}
        a = S.account([quick_loss, long_win], capital=100_000, risk=0.5, max_pos=1)
        self.assertEqual(a["taken"], 1)
        self.assertAlmostEqual(a["final"], 100_000 + 50_000 * 0.20, delta=2)


class SetupTest(unittest.TestCase):
    def test_no_lookahead(self):
        """Bir günün sinyali, sonraki günlerin verisi eklenince değişmemeli."""
        df = walk(700, seed=3)
        full = S.frame(df)
        found = 0
        for t in range(300, 690, 7):
            a = S.setups_at(full, t)
            b = S.setups_at(S.frame(df.iloc[:t + 1]), t)
            self.assertEqual([(x["k"], round(x["stop"], 6), round(x["tp"], 6)) for x in a],
                             [(x["k"], round(x["stop"], 6), round(x["tp"], 6)) for x in b], f"t={t}")
            found += len(a)
        # rastgele yürüyüşte de bazı sinyaller çıkmalı (test boş geçmesin)
        total = sum(len(S.setups_at(full, t)) for t in range(220, 700))
        self.assertGreater(total, 0)

    def test_breakout(self):
        df = walk(400, seed=1, drift=0.002)  # bu seri trend koşullarını sağlar
        n = len(df)
        # Son gün: 55 günlük zirvenin üstünde, hacimli, günün tepesine yakın kapanış
        hh = df["High"].iloc[-56:-1].max()
        df.iloc[-1, df.columns.get_loc("Close")] = hh * 1.03
        df.iloc[-1, df.columns.get_loc("High")] = hh * 1.035
        df.iloc[-1, df.columns.get_loc("Open")] = hh * 0.99
        df.iloc[-1, df.columns.get_loc("Low")] = hh * 0.985
        df.iloc[-1, df.columns.get_loc("Volume")] = df["Volume"].iloc[-21:-1].mean() * 3
        F = S.frame(df)
        self.assertTrue(F["c"][-1] > F["sma50"][-1] > F["sma200"][-1] and F["rsi"][-1] < 75)
        ks = {x["k"]: x for x in S.setups_at(F, n - 1)}
        self.assertIn("kirilim", ks)
        x = ks["kirilim"]
        self.assertAlmostEqual(x["stop"], hh - F["atr"][-1])
        self.assertGreaterEqual((x["tp"] - x["entry"]) / (x["entry"] - x["stop"]), 2 - 1e-9)

    def test_illiquid_ignored(self):
        df = walk(400, seed=5, drift=0.002)
        df["Volume"] = 10.0  # günlük birkaç bin TL: işlem hacmi sınırının altında
        F = S.frame(df)
        self.assertEqual(sum(len(S.setups_at(F, t)) for t in range(220, 400)), 0)

    def test_run_stats(self):
        R = S.run({"A": walk(700, seed=7, drift=0.001), "B": walk(700, seed=8, drift=0.001)})
        self.assertEqual(set(R["stats"]), set(S.SETUPS))
        for k, st in R["stats"].items():
            if st["n"]:
                self.assertAlmostEqual(st["tp"] + st["stop"] + st["time"], 1.0, places=2)


if __name__ == "__main__":
    unittest.main()
