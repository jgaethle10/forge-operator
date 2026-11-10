"""Offline unit tests: python3 -m unittest discover -s systemia/media-studio -p 'test_rental_quote.py'"""
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("rental_quote", pathlib.Path(__file__).with_name("rental_quote.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

BASE = dict(hours="2", gpu_hourly="0.75", storage="0.20", network="0.10", labor="2", licensing="0.50", fees="0.20", margin="0.25")

class QuoteTests(unittest.TestCase):
    def test_estimate_and_no_authority(self):
        result = module.quote(**BASE)
        self.assertEqual(result["estimated_compute"], "1.50")
        self.assertEqual(result["estimated_total_cost"], "4.50")
        self.assertEqual(result["suggested_customer_price"], "6.00")
        self.assertFalse(result["provisioning_authorized"])
        self.assertFalse(result["billing_authorized"])

    def test_reject_high_gpu_price(self):
        with self.assertRaises(ValueError):
            module.quote(**{**BASE, "gpu_hourly": "0.76"})

    def test_reject_excess_runtime(self):
        with self.assertRaises(ValueError):
            module.quote(**{**BASE, "hours": "2.01"})

    def test_reject_invalid_margin(self):
        with self.assertRaises(ValueError):
            module.quote(**{**BASE, "margin": "1"})

    def test_reject_negative_cost(self):
        with self.assertRaises(ValueError):
            module.quote(**{**BASE, "storage": "-1"})

    def test_reject_nan(self):
        with self.assertRaises(ValueError):
            module.quote(**{**BASE, "network": "NaN"})

if __name__ == "__main__":
    unittest.main()
