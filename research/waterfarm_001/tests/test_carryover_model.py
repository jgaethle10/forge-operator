import unittest, sys
from pathlib import Path
from dataclasses import replace
here=Path(__file__).resolve().parent
if (here/'seasonal_screen.py').exists():
    # Downloadable research source package
    sys.path.insert(0,str(here))
    from noaa_api_screen import parse_csv
else:
    # GitHub: waterfarm_001/tests/ next to seasonal/ and noaa/
    root=here.parent
    sys.path.insert(0,str(root/'seasonal'))
    sys.path.insert(0,str(root/'noaa'))
    from api_daily_summaries import parse_csv
from seasonal_screen import Configuration,simulate
from fixture_2024_observations import generate_csv
from carryover_model import run_cycle,simulate_observed_years,repeat_one_year,repeated_year_equilibrium

class TestCarryover(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.audit=parse_csv(generate_csv(), year=2024)
    def test_legacy_empty_start_parity(self):
        for tank in (250,1000,5000,20000):
            config=Configuration(capacity_l=tank,demand_months=(5,6,7,8,9))
            a=simulate(self.audit,config)
            b=run_cycle(self.audit,config)
            for k in ('delivered_l','overflow_l','ending_tank_l','gross_demand_l','tank_losses_l'):
                self.assertAlmostEqual(getattr(a,k),getattr(b,k))
    def test_initial_water_is_not_created(self):
        config=Configuration(capacity_l=5000,demand_months=(5,6,7,8,9))
        a=run_cycle(self.audit,config,initial:=1000)
        self.assertEqual(a.opening_tank_l, initial)
        self.assertAlmostEqual(initial+a.admitted_l,a.delivered_l+a.ending_tank_l+a.overflow_l+a.tank_losses_l)
    def test_replay_transfers_ending_to_opening(self):
        config=Configuration(capacity_l=20000,demand_months=(5,6,7,8,9))
        runs=repeat_one_year(self.audit,config,cycles=4)
        self.assertEqual(runs[0].opening_tank_l,0)
        self.assertAlmostEqual(runs[0].ending_tank_l,runs[1].opening_tank_l)
        self.assertEqual({r.source_year for r in runs},{2024})
        self.assertEqual({r.mode for r in runs},{'SYNTHETIC_REPLAY_OF_ONE_STATION_YEAR'})
        self.assertGreaterEqual(runs[1].delivered_l,runs[0].delivered_l)
    def test_cyclic_fixed_point_reproducible(self):
        config=Configuration(capacity_l=20000,demand_months=(5,6,7,8,9))
        res=repeated_year_equilibrium(self.audit,config)
        self.assertIn('NOT_OBSERVED_MULTIYEAR',res['evidence_state'])
        data=res['annual_cycle']
        self.assertAlmostEqual(data['opening_tank_l'],data['ending_tank_l'],places=5)
        self.assertAlmostEqual(data['opening_tank_l']+data['admitted_l'],data['delivered_l']+data['overflow_l']+data['tank_losses_l']+data['ending_tank_l'],places=5)
    def test_repeat_sensitivity_not_equivalent_to_actual_2025(self):
        res=repeat_one_year(self.audit,Configuration(capacity_l=1000),cycles=2)
        self.assertEqual(len(res),2)
        self.assertEqual([r.source_year for r in res],[2024,2024])
        self.assertNotEqual(res[0].mode,'OBSERVED_STATION_YEAR_SCENARIO')
    def test_observed_incomplete_blocks_entire_series(self):
        broken=generate_csv().replace('"2024-05-22","0.0"','"2024-05-22",')
        invalid=parse_csv(broken,year=2024)
        self.assertTrue(invalid.status.startswith('HOLD'))
        with self.assertRaises(ValueError): simulate_observed_years([self.audit,invalid],Configuration())
    def test_missing_year_rejected(self):
        # Data labelled 2026 cannot follow 2024, independent of source quality.
        shifted=replace(self.audit, year=2026)
        with self.assertRaises(ValueError): simulate_observed_years([self.audit,shifted],Configuration())
    def test_empty_series_holds(self):
        with self.assertRaises(ValueError):simulate_observed_years([],Configuration())
    def test_two_consecutive_complete_fixture_years_chain_inventory(self):
        # TEST-ONLY: fabricate a complete 2025 climate by copying 2024 data,
        # dropping leap day. This is NOT observed 2025 NOAA weather.
        source=generate_csv().splitlines()
        next_year=[source[0]]
        for row in source[1:]:
            if '"2024-02-29"' in row:
                continue
            next_year.append(row.replace('"2024-', '"2025-'))
        fake_2025=parse_csv('\n'.join(next_year)+'\n',year=2025)
        config=Configuration(capacity_l=20000,demand_months=(5,6,7,8,9))
        result=simulate_observed_years([self.audit,fake_2025],config)
        self.assertEqual(len(result),2)
        self.assertEqual(result[0].source_year,2024)
        self.assertEqual(result[1].source_year,2025)
        self.assertAlmostEqual(result[0].ending_tank_l,result[1].opening_tank_l)
        self.assertAlmostEqual(sum(x.admitted_l for x in result),
            sum(x.delivered_l+x.overflow_l+x.tank_losses_l for x in result)+result[-1].ending_tank_l)
    def test_one_year_series_matches_cycle(self):
        config=Configuration(capacity_l=5000,demand_months=(5,6,7,8,9))
        a=simulate_observed_years([self.audit],config)
        b=run_cycle(self.audit,config)
        self.assertAlmostEqual(a[0].delivered_l,b.delivered_l)
    def test_false_source_status_holds(self):
        with self.assertRaises(ValueError):run_cycle(replace(self.audit,status='HOLD'),Configuration())
    def test_precip_tamper_holds(self):
        days=list(self.audit.observations)
        days[0]=replace(days[0],precipitation_mm_lower_bound=float('nan'))
        with self.assertRaises(ValueError):run_cycle(replace(self.audit,observations=tuple(days)),Configuration())
    def test_date_gap_rejected_even_if_status_incorrectly_green(self):
        days=list(self.audit.observations)
        days[12]=replace(days[12], date=days[11].date)
        with self.assertRaises(ValueError):run_cycle(replace(self.audit,observations=tuple(days)),Configuration())
    def test_reject_overfull_starts(self):
        for x in [-1,1001,float('inf'),float('nan'),True]:
            with self.subTest(x=x),self.assertRaises(ValueError):run_cycle(self.audit,Configuration(capacity_l=1000),x)
    def test_invalid_number_of_repeats(self):
        for n in [0,-1,True,51]:
            with self.subTest(n=n),self.assertRaises(ValueError):repeat_one_year(self.audit,Configuration(),cycles=n)
    def test_nonconvergence_explicit(self):
        # Confirm a user cannot disguise lack of convergence as an annual metric.
        with self.assertRaises(ValueError):repeated_year_equilibrium(self.audit,Configuration(capacity_l=100000,demand_months=()),maximum_repeats=2)
    def test_2000_l_tank_loss_ledger(self):
        c=Configuration(capacity_l=2000,daily_tank_loss_fraction=.002,demand_months=(5,6,7,8,9))
        r=run_cycle(self.audit,c,1000)
        self.assertAlmostEqual(r.opening_tank_l+r.admitted_l,r.delivered_l+r.overflow_l+r.tank_losses_l+r.ending_tank_l,places=4)
    def test_bad_source_metadata_holds(self):
        for audit in (replace(self.audit,station="OTHER"),replace(self.audit,source_sha256="x"*64)):
            with self.assertRaises(ValueError):run_cycle(audit,Configuration())
    def test_trace_count_unchanged(self):
        self.assertEqual(run_cycle(self.audit,Configuration()).trace_days,31)
    def test_config_type_and_invalid_mode(self):
        with self.assertRaises(TypeError):run_cycle(self.audit,None)
        with self.assertRaises(ValueError):run_cycle(self.audit,Configuration(),mode='2025_OBSERVED')

if __name__=='__main__':unittest.main()