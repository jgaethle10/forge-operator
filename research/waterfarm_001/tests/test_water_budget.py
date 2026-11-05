import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'noaa'))
from ghcnd_source import parse_station,DataHold
from water_budget import scenario,compare_tanks
from test_ghcnd_source import fixture


class WaterBudgetTests(unittest.TestCase):
    def setUp(self):
        self.valid=parse_station(fixture(modifications={1:{'values':{1:100,2:40}},2:{'values':{2:100}}}),year=2025)

    def test_physical_balance(self):
        s=scenario(self.valid,roof_area_m2=100,tank_l=1000,daily_nonpotable_demand_l=200)
        self.assertAlmostEqual(s.mass_error_l,0)
        self.assertAlmostEqual(s.incoming_rain_l,2400)
        self.assertGreaterEqual(s.overflow_l,0)
        self.assertAlmostEqual(s.admitted_l,s.delivered_to_demand_l+s.overflow_l+s.ending_storage_l)

    def test_missing_data_never_produces_tank_number(self):
        broken=parse_station(fixture(omit_months=(8,)),year=2025)
        with self.assertRaises(DataHold):
            scenario(broken,roof_area_m2=100,tank_l=500,daily_nonpotable_demand_l=10)

    def test_supply_cannot_exceed_demand(self):
        x=scenario(self.valid,roof_area_m2=100,tank_l=1000,daily_nonpotable_demand_l=0)
        self.assertEqual(x.delivered_to_demand_l,0)
        self.assertEqual(x.external_makeup_l,0)

    def test_more_tank_never_reduces_delivered(self):
        result=compare_tanks(self.valid,(0,250,1000,5000),roof_area_m2=100,daily_nonpotable_demand_l=200)
        vols=[r['delivered_to_demand_l'] for r in result['results']]
        self.assertEqual(vols,sorted(vols))

    def test_zero_roof_yields_zero(self):
        x=scenario(self.valid,roof_area_m2=0,tank_l=500,daily_nonpotable_demand_l=10)
        self.assertEqual(x.admitted_l,0)
        self.assertEqual(x.delivered_to_demand_l,0)

    def test_flush_reduces_capture(self):
        a=scenario(self.valid,roof_area_m2=100,tank_l=2000,daily_nonpotable_demand_l=100)
        b=scenario(self.valid,roof_area_m2=100,tank_l=2000,daily_nonpotable_demand_l=100,first_flush_mm_per_wet_day=1)
        self.assertLess(b.admitted_l,a.admitted_l)

    def test_bad_fraction_or_tank_hold(self):
        for args in ({'capture_fraction':1.2},{'tank_l':-1},{'roof_area_m2':float('nan')},{'daily_nonpotable_demand_l':float('inf')}):
            d=dict(roof_area_m2=100,tank_l=500,daily_nonpotable_demand_l=10);d.update(args)
            with self.assertRaises(ValueError):scenario(self.valid,**d)

    def test_duplicate_tank_sizes_hold(self):
        with self.assertRaises(ValueError):compare_tanks(self.valid,(100,100),roof_area_m2=100,daily_nonpotable_demand_l=100)

    def test_authenticity_not_misrepresented(self):
        x=compare_tanks(self.valid,(100,),roof_area_m2=100,daily_nonpotable_demand_l=20)
        self.assertIn('UNVERIFIED',x['source_authenticity'])
        self.assertIn('HYPOTHETICAL',x['overall_state'])

if __name__=='__main__':unittest.main()
