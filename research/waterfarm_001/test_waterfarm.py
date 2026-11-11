import math
import unittest
from waterfarm import DailyObservation, Site, roof_rain_l, simulate_day


class TestWaterFarm(unittest.TestCase):
    def test_rain_math(self):
        site = Site(100, 1000, roof_capture_authorized=True)
        self.assertEqual(roof_rain_l(site, 10), 800)
        self.assertEqual(roof_rain_l(Site(100, 1000, first_flush_mm=1, roof_capture_authorized=True), 10), 720)

    def test_default_deny(self):
        result = simulate_day(Site(100, 1000), DailyObservation(10, 50, 20, 1))
        self.assertEqual(result.delivered_nonpotable_l, 0)
        self.assertEqual(result.harvested_rain_l, 0)
        self.assertEqual(result.quarantined_condensate_l, 20)
        self.assertEqual(result.external_makeup_l, 50)

    def test_rain_supply_overflow_and_balance(self):
        site = Site(100, 100, roof_capture_authorized=True, nonpotable_delivery_authorized=True)
        result = simulate_day(site, DailyObservation(10, 30))
        self.assertEqual(result.harvested_rain_l, 800)
        self.assertEqual(result.overflow_l, 700)
        self.assertEqual(result.delivered_nonpotable_l, 30)
        self.assertEqual(result.ending_tank_l, 70)
        self.assertAlmostEqual(result.mass_balance_error_l, 0)

    def test_condensate_segregation_and_energy(self):
        blocked = simulate_day(Site(0, 10, nonpotable_delivery_authorized=True), DailyObservation(0, 5, 3, 6))
        self.assertEqual(blocked.recovered_condensate_l, 0)
        self.assertEqual(blocked.quarantined_condensate_l, 3)
        site = Site(0, 10, condensate_reuse_authorized=True, nonpotable_delivery_authorized=True)
        released = simulate_day(site, DailyObservation(0, 5, 3, 6))
        self.assertEqual(released.delivered_nonpotable_l, 3)
        self.assertEqual(released.external_makeup_l, 2)
        self.assertEqual(released.condenser_kwh_per_l, 2)
        self.assertAlmostEqual(released.mass_balance_error_l, 0)

    def test_invalid_inputs_fail_closed(self):
        with self.assertRaises(ValueError): Site(100, 100, 1.2)
        with self.assertRaises(ValueError): DailyObservation(-1, 10)
        with self.assertRaises(ValueError): DailyObservation(math.nan, 10)
        with self.assertRaises(ValueError): simulate_day(Site(2, 20), DailyObservation(0, 0), 30)


if __name__ == "__main__":
    unittest.main()
