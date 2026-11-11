import math, unittest
from pathlib import Path
import sys

here=Path(__file__).resolve().parent
if (here/'seasonal_screen.py').is_file():
    # Local source-pack structure.
    sys.path.insert(0,str(here))
    sys.path.insert(0,str(here/'aqua_rc05'))
    from noaa_api_screen import parse_csv, QualityHold
else:
    # Committed GitHub repo structure: waterfarm_001/tests/ beside seasonal/ and noaa/.
    root=here.parent
    sys.path.insert(0,str(root/'seasonal'))
    sys.path.insert(0,str(root/'noaa'))
    from api_daily_summaries import parse_csv, QualityHold

from seasonal_screen import Configuration,simulate,break_even_value_usd_m3,year_profiles
from fixture_2024_observations import generate_csv
synthetic_normalized=generate_csv()

class TestSeasonalScreen(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.audit=parse_csv(synthetic_normalized,year=2024)
    def test_complete_original_reference(self):
        r=simulate(self.audit,Configuration())
        self.assertAlmostEqual(r.delivered_l,16584)
        self.assertAlmostEqual(r.input_l,17048)
        self.assertAlmostEqual(r.overflow_l,464)
    def test_seasonal_model_mass_balance(self):
        for case in year_profiles(self.audit).values():
            self.assertAlmostEqual(case['mass_balance_error_l'],0,places=5)
            self.assertAlmostEqual(case['input_l'],case['delivered_l']+case['overflow_l']+case['tank_losses_l']+case['ending_tank_l'],places=5)
    def test_monthly_aggregation(self):
        x=simulate(self.audit,Configuration(demand_months=(5,6,7,8,9)))
        self.assertAlmostEqual(sum(x.delivered_by_month_l),x.delivered_l)
        self.assertAlmostEqual(sum(x.demand_by_month_l),x.gross_demand_l)
        self.assertEqual(x.gross_demand_l,153000)
        self.assertEqual(x.delivered_by_month_l[0],0)
    def test_first_flush_monotonic(self):
        a=simulate(self.audit,Configuration(first_flush_mm_per_wet_day=0,capacity_l=100000))
        b=simulate(self.audit,Configuration(first_flush_mm_per_wet_day=1,capacity_l=100000))
        self.assertLess(b.input_l,a.input_l)
    def test_harvest_loses_when_collection_disallowed(self):
        a=simulate(self.audit,Configuration(demand_months=(5,6,7,8,9),capacity_l=5000))
        b=simulate(self.audit,Configuration(demand_months=(5,6,7,8,9),capacity_l=5000,uncollectable_months=(1,2,11,12)))
        self.assertLessEqual(b.delivered_l,a.delivered_l)
    def test_more_storage_cannot_reduce_delivery(self):
        sizes=[100,250,1000,5000,20000]
        d=[simulate(self.audit,Configuration(capacity_l=s,demand_months=(5,6,7,8,9))).delivered_l for s in sizes]
        self.assertEqual(d,sorted(d))
    def test_loss_cannot_increase_storage_delivery(self):
        a=simulate(self.audit,Configuration(capacity_l=5000,daily_tank_loss_fraction=0))
        b=simulate(self.audit,Configuration(capacity_l=5000,daily_tank_loss_fraction=.002))
        self.assertLessEqual(b.delivered_l,a.delivered_l)
    def test_missing_full_year_holds(self):
        incomplete=synthetic_normalized.replace('"2024-05-22","0.0"','"2024-05-22",')
        with self.assertRaises((QualityHold,ValueError)):
            simulate(parse_csv(incomplete,year=2024),Configuration())
    def test_invalid_values_rejected(self):
        for data in [dict(capture_fraction=1.2),dict(capacity_l=float('nan')),
                     dict(daily_tank_loss_fraction=-.1),dict(demand_months=(5,5)),
                     dict(uncollectable_months=(0,)),dict(roof_m2=True)]:
            with self.subTest(data=data),self.assertRaises(ValueError): Configuration(**data)
    def test_break_even_zero_rate(self):
        self.assertAlmostEqual(break_even_value_usd_m3(10000,1000,50,10),15)
    def test_break_even_discount(self):
        self.assertGreater(break_even_value_usd_m3(10000,1000,50,10,.08),15)
    def test_no_delivery_no_breakeven(self):
        self.assertIsNone(break_even_value_usd_m3(0,1000,50,10))
    def test_economics_invalid(self):
        for capex in (-1,float('inf'),float('nan'),True):
            with self.assertRaises(ValueError):break_even_value_usd_m3(10000,capex,10,10)
    def test_nonwinter_season_ended_stock(self):
        out=simulate(self.audit,Configuration(demand_months=(5,6,7,8,9),capacity_l=20000))
        self.assertGreaterEqual(out.ending_tank_l,0)

if __name__=='__main__':unittest.main()