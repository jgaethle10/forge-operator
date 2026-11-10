"""Toy-only tests for the standalone, reviewable GitHub reference module."""
import math
import random
import unittest
from trajectory_reference import ReferenceGuard, Sample


class ReferenceGuardTests(unittest.TestCase):
    def test_nominal(self):
        self.assertTrue(ReferenceGuard().assess(Sample(1, 1000, 0, 0, 0))["allow"])

    def test_forecast_breach(self):
        r = ReferenceGuard().assess(Sample(1, 1000, 5, 3, 1.5))
        self.assertIn("PREDICTED_CORRIDOR_BREACH", r["reasons"])

    def test_near_limit_but_steering_back(self):
        self.assertTrue(ReferenceGuard().assess(Sample(1, 1000, 18, 0, -.3))["allow"])

    def test_current_breach(self):
        self.assertFalse(ReferenceGuard().assess(Sample(1, 1000, 39.5, 0, 0))["allow"])

    def test_uncertainty(self):
        self.assertFalse(ReferenceGuard().assess(Sample(1, 1000, 0, 0, 0, 100))["allow"])

    def test_nonfinite(self):
        for x in (math.nan, math.inf, -math.inf):
            self.assertFalse(ReferenceGuard().assess(Sample(1, 1000, x, 0, 0))["allow"])

    def test_replay(self):
        g = ReferenceGuard()
        g.assess(Sample(1, 1000, 0, 0, 0))
        self.assertIn("REPLAY_OR_GAP", g.assess(Sample(1, 1000, 0, 0, 0))["reasons"])

    def test_position_jump(self):
        g = ReferenceGuard()
        g.assess(Sample(1, 1000, 0, 0, 0))
        self.assertIn("MODEL_RESIDUAL", g.assess(Sample(2, 2000, 8, 0, 0))["reasons"])

    def test_latching(self):
        g = ReferenceGuard()
        g.assess(Sample(1, 1000, 5, 3, 1.5))
        self.assertIn("INTERLOCK_LATCHED", g.assess(Sample(2, 2000, 0, 0, 0))["reasons"])

    def test_invalid_sample(self):
        self.assertFalse(ReferenceGuard().assess({"bad": "data"})["allow"])

    def test_cumulative_series(self):
        g = ReferenceGuard()
        seq = [Sample(1,1000,0,0,.3), Sample(2,2000,.15,.3,.3),
               Sample(3,3000,.6,.6,1.5), Sample(4,4000,1.95,2.1,1.9)]
        results = [g.assess(s) for s in seq]
        self.assertTrue(results[0]["allow"])
        self.assertFalse(results[-1]["allow"])

    def test_randomized_future_breach(self):
        rng = random.Random(20261109)
        for _ in range(500):
            s = Sample(1, 1000, rng.uniform(30,38), rng.uniform(4,7), rng.uniform(.5,1.5))
            self.assertFalse(ReferenceGuard().assess(s)["allow"])


if __name__ == "__main__":
    unittest.main()
