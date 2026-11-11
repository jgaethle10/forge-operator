import unittest,sys,hashlib,tempfile,io,csv
from pathlib import Path
from datetime import date,timedelta
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'noaa'))
from multi_year_gate import batch_screen,official_url,run

def source(y,missing=None,bad=None,trace=None):
    s=io.StringIO();w=csv.writer(s,lineterminator='\n');w.writerow(['STATION','DATE','PRCP','PRCP_ATTRIBUTES'])
    d=date(y,1,1)
    while d.year==y:
        v='0.0' if d != missing else ''
        flags=',,W,2400'
        if d==bad:flags=',X,W,2400'
        if d==trace:flags='T,,W,2400'
        w.writerow(['USW00024243',d.isoformat(),v,flags if v!='' else ''])
        d+=timedelta(days=1)
    return s.getvalue()

class TestNoaaMultiyear(unittest.TestCase):
    def test_url_pinned(self):
        url=official_url(2022)
        self.assertTrue(url.startswith('https://www.ncei.noaa.gov/access/services/data/v1?'))
        for part in ('USW00024243','includeAttributes=true','units=metric','startDate=2022-01-01'):
            self.assertIn(part,url)
    def test_complete_three_year_gate(self):
        d={year:source(year,trace=date(year,1,1)) for year in range(2022,2025)}
        out=batch_screen(d)
        self.assertEqual(out['state'],'SCREEN_COMPLETE_ALL_YEARS')
        self.assertEqual([x['trace_days'] for x in out['years']],[1,1,1])
        self.assertTrue(out['can_run_observed_multiyear_scenario'])
        self.assertIsNone(out['water_yield_l'])
    def test_nonconsecutive_years_fail(self):
        with self.assertRaises(ValueError):batch_screen({2022:source(2022),2024:source(2024)})
    def test_missing_2025_prevents_all_clear(self):
        d={2024:source(2024),2025:source(2025,missing=date(2025,5,22))}
        out=batch_screen(d)
        self.assertEqual(out['state'],'HOLD_INCOMPLETE_MULTIYEAR')
        self.assertEqual(out['years'][-1]['missing_dates'],['2025-05-22'])
        self.assertFalse(out['can_run_observed_multiyear_scenario'])
    def test_quality_flag_hold(self):
        out=batch_screen({2024:source(2024,bad=date(2024,1,2))})
        self.assertEqual(out['years'][0]['bad_quality_dates'],['2024-01-02'])
    def test_hash_present(self):
        s=source(2024)
        out=batch_screen({2024:s})
        self.assertEqual(out['years'][0]['input_sha256'],hashlib.sha256(s.encode()).hexdigest())
    def test_offline_fetch_defaults_and_receipt(self):
        with tempfile.TemporaryDirectory() as t:
            f=Path(t)/'Yakima_2024_attributed_PRCP.csv';f.write_text(source(2024))
            out=run(Path(t),(2024,))
            self.assertIn('OFFLINE_CSV_ORIGIN_NOT_AUTHENTICATED',out['retrieval_receipts'][2024]['retrieval'])
    def test_offline_missing_input_hold(self):
        with tempfile.TemporaryDirectory() as t:
            with self.assertRaises(ValueError):run(Path(t),(2022,2023,2024))
    def test_invalid_year_hold(self):
        for x in (True,1800,2200):
            with self.assertRaises(ValueError):official_url(x)
    def test_empty_hold(self):
        with self.assertRaises(ValueError):batch_screen({})

if __name__=='__main__':unittest.main()

class TestObservedChaining(unittest.TestCase):
    def test_three_years_chained_real_dates_with_synthetic_values(self):
        from multi_year_gate import observed_scenario
        from seasonal_screen import Configuration
        result=observed_scenario({y:source(y) for y in (2022,2023,2024)},
          config=Configuration(capacity_l=100,demand_months=(5,6,7,8,9)))
        self.assertEqual([x['weather_year'] for x in result['cases']],[2022,2023,2024])
        self.assertEqual(result['cases'][0]['ending_tank_l'],result['cases'][1]['opening_tank_l'])
        self.assertEqual(result['cases'][1]['ending_tank_l'],result['cases'][2]['opening_tank_l'])
        self.assertIn('HYPOTHETICAL',result['evidence'])
    def test_missing_2025_stops_actual_chain(self):
        from multi_year_gate import observed_scenario
        with self.assertRaises(ValueError):observed_scenario({2024:source(2024),2025:source(2025,missing=date(2025,5,22))})
    def test_known_station_no_real_2022_data_supplied(self):
        from multi_year_gate import observed_scenario
        with self.assertRaises(ValueError):observed_scenario({2024:source(2024),2026:source(2026)})