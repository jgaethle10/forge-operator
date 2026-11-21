import math
import unittest
from climate_feasibility import (MONTHLY_PRECIP_IN, energy_scenario,
    moist_air_upper_bound, roof_supply_potential, saturation_vapor_density_g_m3)


class TestClimateFeasibility(unittest.TestCase):
    def test_noaa_normal_sum(self):
        self.assertAlmostEqual(sum(MONTHLY_PRECIP_IN), 8.01)

    def test_roof_units_and_annual(self):
        out = roof_supply_potential(100, .8, 1000)
        self.assertAlmostEqual(out.annual_roof_input_l, 8.01 * 25.4 * 100 * .8)
        self.assertAlmostEqual(out.annual_external_demand_l, 365000)
        self.assertAlmostEqual(out.monthly[6].roof_input_l, .20 * 25.4 * 100 * .8)
        self.assertLessEqual(out.annual_same_month_offset_upper_bound_l, out.annual_roof_input_l)
        self.assertLessEqual(out.annual_same_month_offset_upper_bound_l, out.annual_external_demand_l)

    def test_roof_capture_capped_by_demand(self):
        out = roof_supply_potential(100000, .8, 1)
        self.assertLessEqual(out.annual_same_month_offset_upper_bound_l, out.annual_external_demand_l)

    def test_zero_inputs(self):
        out = roof_supply_potential(0, 0, 0)
        self.assertEqual(out.annual_roof_input_l, 0)
        self.assertEqual(out.annual_ratio_optimistic, 0)

    def test_fail_closed_roof_inputs(self):
        for bad in (float('nan'), float('inf'), -1, True):
            with self.assertRaises(ValueError): roof_supply_potential(100, bad, 1000)
        with self.assertRaises(ValueError): roof_supply_potential(100, 1.01, 1000)
        with self.assertRaises(ValueError): roof_supply_potential(100, .8, 1000, (1, 2))

    def test_vapor_physics(self):
        self.assertAlmostEqual(saturation_vapor_density_g_m3(30), 30.3, delta=.3)
        self.assertAlmostEqual(saturation_vapor_density_g_m3(15), 12.8, delta=.3)
        humid = moist_air_upper_bound(30, 80, 15, 1000)
        dry = moist_air_upper_bound(30, 20, 15, 1000)
        self.assertGreater(humid.max_collected_l, 11)
        self.assertLess(humid.max_collected_l, 12)
        self.assertEqual(dry.max_collected_l, 0)
        self.assertGreater(humid.inlet_g_m3, humid.cold_coil_saturation_g_m3)

    def test_air_scaling(self):
        full = moist_air_upper_bound(30, 80, 15, 1000).max_collected_l
        half = moist_air_upper_bound(30, 80, 15, 1000, .5).max_collected_l
        self.assertAlmostEqual(half, full / 2)

    def test_air_safety_inputs(self):
        for f in [lambda: moist_air_upper_bound(20, 101, 10, 100),
                  lambda: moist_air_upper_bound(20, 50, 21, 100),
                  lambda: moist_air_upper_bound(20, 50, 10, -1),
                  lambda: moist_air_upper_bound(20, 50, 10, 100, 1.01),
                  lambda: moist_air_upper_bound(20, math.nan, 10, 100)]:
            with self.assertRaises(ValueError): f()

    def test_energy_not_full_cost(self):
        l = energy_scenario(1000, .5, .12)
        self.assertEqual(l.electricity_kwh, 500)
        self.assertAlmostEqual(l.electricity_usd, 60)
        self.assertAlmostEqual(l.electricity_usd_per_m3, 60)

    def test_illogical_energy_rejected(self):
        for x in (-1, math.nan, math.inf):
            with self.assertRaises(ValueError): energy_scenario(100, x, .12)


if __name__ == '__main__':
    unittest.main()
