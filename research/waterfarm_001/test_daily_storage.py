import math
import unittest
from datetime import date
from climate_feasibility import MONTHLY_PRECIP_IN
from daily_storage import Day, Model, simulate, monthly_normal_synthetic, gross_savings_capital_limit


class TestDailyStorage(unittest.TestCase):
    def setUp(self):
        self.model = Model(100, 1000, .8, eligible_roof_and_site_approved=True,
                           nonpotable_delivery_approved=True)

    def test_collection_is_conserved(self):
        days = [Day(date(2025, 1, 1), 10, 100), Day(date(2025, 1, 2), 0, 100)]
        s = simulate(days, self.model)
        self.assertEqual(s.admitted_roof_l, 800)
        self.assertEqual(s.delivered_l, 200)
        self.assertEqual(s.ending_tank_l, 600)
        self.assertAlmostEqual(s.mass_balance_error_l, 0)

    def test_one_day_full_overflow(self):
        s = simulate([Day(date(2025, 1, 1), 10, 60)],
                     Model(100, 100, .8, eligible_roof_and_site_approved=True,
                           nonpotable_delivery_approved=True))
        self.assertEqual(s.overflow_l, 700)
        self.assertEqual(s.delivered_l, 60)
        self.assertEqual(s.ending_tank_l, 40)

    def test_permission_defaults_deny(self):
        s = simulate([Day(date(2025, 1, 1), 10, 500)], Model(100, 1000, .8))
        self.assertEqual(s.admitted_roof_l, 0)
        self.assertEqual(s.delivered_l, 0)
        self.assertEqual(s.external_makeup_l, 500)

    def test_first_flush_model(self):
        m = Model(100, 1000, .8, first_flush_mm_per_wet_day=1,
                  eligible_roof_and_site_approved=True, nonpotable_delivery_approved=True)
        s = simulate([Day(date(2025, 1, 1), 10, 200)], m)
        self.assertAlmostEqual(s.admitted_roof_l, 720)

    def test_gap_or_duplicate_rejected(self):
        for second_date in (date(2025, 1, 1), date(2025, 1, 3), date(2024, 12, 31)):
            with self.assertRaises(ValueError):
                simulate([Day(date(2025, 1, 1), 1, 1), Day(second_date, 1, 1)], self.model)

    def test_empty_and_invalid_rejected(self):
        with self.assertRaises(ValueError): simulate([], self.model)
        with self.assertRaises(ValueError): Day(date(2025, 1, 1), math.nan, 1)
        with self.assertRaises(ValueError): Model(100, 1000, .8, eligible_roof_and_site_approved=1)
        with self.assertRaises(ValueError): Model(100, 1000, 1.01)

    def test_synthetic_totals_equivalent(self):
        a = monthly_normal_synthetic(MONTHLY_PRECIP_IN, 2025, 1000, 'uniform')
        b = monthly_normal_synthetic(MONTHLY_PRECIP_IN, 2025, 1000, 'final_day')
        self.assertEqual(len(a), 365)
        self.assertEqual(len(b), 365)
        self.assertAlmostEqual(sum(d.precipitation_mm for d in a), sum(d.precipitation_mm for d in b))
        self.assertAlmostEqual(simulate(a, self.model).potential_roof_l,simulate(b, self.model).potential_roof_l)

    def test_more_storage_never_reduces_delivery_in_unrestricted_case(self):
        days = monthly_normal_synthetic(MONTHLY_PRECIP_IN, 2025, 1000, 'final_day')
        results = [simulate(days, Model(100, tank, .8, eligible_roof_and_site_approved=True,
                                     nonpotable_delivery_approved=True)).delivered_l
                   for tank in [0, 100, 1000, 5000, 100000]]
        self.assertEqual(results, sorted(results))

    def test_savings_cap_is_not_actual_profit(self):
        self.assertEqual(gross_savings_capital_limit(10000, 2, 5), 100)
        with self.assertRaises(ValueError): gross_savings_capital_limit(10, math.nan, 5)

    def test_no_benefit_without_demand(self):
        days = monthly_normal_synthetic(MONTHLY_PRECIP_IN, 2025, 0, 'uniform')
        self.assertEqual(simulate(days, self.model).delivered_l, 0)


if __name__ == '__main__':
    unittest.main()
