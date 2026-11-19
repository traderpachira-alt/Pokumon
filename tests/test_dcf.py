"""DCF testleri. Çalıştırma: python -m unittest discover -s tests"""
import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import dcf  # noqa: E402
from test_scores import fin_xi  # noqa: E402


def market(rate=40.0):
    idx = pd.bdate_range("2023-01-02", "2026-11-18")
    return {"rf": 0.045, "fx": pd.Series(rate, index=idx)}


class ModelTest(unittest.TestCase):
    def test_constant_growth_equals_gordon(self):
        # Büyüme baştan sona uç büyümeye eşitse firma değeri = FCF·(1+g)/(WACC−g)
        v = dcf.equity_value(100.0, 0.03, 0.03, 0.10, nd=0, minority=0)
        self.assertAlmostEqual(v["ev"], 100 * 1.03 / 0.07, places=6)
        v2 = dcf.equity_value(100.0, 0.03, 0.03, 0.10, nd=200, minority=50)
        self.assertAlmostEqual(v2["eq"], v["ev"] - 250, places=6)

    def test_implied_growth_roundtrip(self):
        target = dcf.equity_value(80.0, 0.07, 0.03, 0.11, 100, 10)["eq"]
        self.assertAlmostEqual(dcf.implied_growth(target, 80.0, 0.03, 0.11, 100, 10), 0.07, places=5)
        self.assertIsNone(dcf.implied_growth(1e12, 80.0, 0.03, 0.11, 100, 10))   # hiçbir büyüme yetmez

    def test_wacc(self):
        w = dcf.wacc_of(0.045, 1.0, mcap=800, debt=200)
        self.assertAlmostEqual(w["coe"], 0.045 + 1.0 * dcf.ERP + dcf.CRP)
        self.assertAlmostEqual(w["wacc"], 0.8 * w["coe"] + 0.2 * (0.045 + dcf.CRP + dcf.DEBT_SPREAD) * (1 - dcf.TAX))
        self.assertAlmostEqual(dcf.wacc_of(0.045, 1.5, 1, 0)["beta"], 0.67 * 1.5 + 0.33)


class InputsTest(unittest.TestCase):
    s = {"last": 50.0, "mcap": 50.0 * 20, "beta": 1.0, "sector": "Gıda"}

    def fin(self):
        f = fin_xi()
        for p in f["periods"].values():
            p["minority"] = 10.0
        return f

    def test_values_and_fx(self):
        d = dcf.inputs("XYZ", self.s, self.fin(), market(40.0))
        self.assertTrue(d["ok"], d.get("why"))
        self.assertEqual(d["period"], "2026/9")
        self.assertAlmostEqual(d["minority"], 10 / 40)
        self.assertGreater(d["margin"], 0)
        self.assertLessEqual(d["g1"], dcf.G1_MAX)
        self.assertLess(d["fairLo"], d["fair"])
        self.assertLess(d["fair"], d["fairHi"])
        # Ters DCF: ima edilen büyümeyle model bugünkü piyasa değerini verir
        if d["impliedClip"] is None:
            eq = dcf.equity_value(d["margin"] * d["rev0"], d["impliedG"], d["gt"], d["wacc"], d["nd"], d["minority"])["eq"]
            self.assertAlmostEqual(eq, d["mcapUsd"], delta=d["mcapUsd"] * 1e-4)

    def test_exclusions(self):
        self.assertFalse(dcf.inputs("XYZ", dict(self.s, sector="Holdingler"), self.fin(), market())["ok"])
        self.assertFalse(dcf.inputs("ABCGY", self.s, self.fin(), market())["ok"])
        bank = {"group": "UFRS", "periods": {"2026/9": {"net": 1}}}
        self.assertFalse(dcf.inputs("XYZ", self.s, bank, market())["ok"])
        self.assertIn("azınlık", dcf.inputs("XYZ", self.s, fin_xi(), market())["why"])   # eski şema
        self.assertFalse(dcf.inputs("XYZ", self.s, self.fin(), None)["ok"])

    def test_negative_fcf(self):
        f = self.fin()
        for p in f["periods"].values():
            p["capex"] = -5 * abs(p["cfo"])
        d = dcf.inputs("XYZ", self.s, f, market())
        self.assertFalse(d["ok"])
        self.assertIn("negatif", d["why"])


if __name__ == "__main__":
    unittest.main()
