import unittest
from datetime import date
from noaa_api_screen import parse_csv,tank_scenario,QualityHold

def sample(days=2,second='1.0',f=',,W,2400'):
    # Exactly one leap-year or non-leap-year daily sample to exercise coverage holds.
    return '"STATION","DATE","PRCP","PRCP_ATTRIBUTES"\n'+ '\n'.join([
        '"USW00024243","2025-01-01","5.0",",,W,2400"',
        f'"USW00024243","2025-01-02",{second and chr(34)+second+chr(34) or str()},"{f}"'
    ])+'\n'

class Screens(unittest.TestCase):
    def test_missing_dates_hold(self):
        a=parse_csv(sample(),year=2025)
        self.assertEqual(a.status,'HOLD_INCOMPLETE_OR_FLAGGED')
        self.assertTrue(len(a.missing_days)>300)
        with self.assertRaises(QualityHold):tank_scenario(a)
    def test_trace_is_not_missing(self):
        a=parse_csv(sample(second='0.0',f='T,,W,2400'),year=2025)
        self.assertEqual(a.observations[1].classification,'TRACE_LOWER_BOUND_ZERO')
        self.assertIn('2025-01-03',a.missing_days)
    def test_quality_flag_hold(self):
        a=parse_csv(sample(second='0.0',f=',X,W,2400'),year=2025)
        self.assertEqual(a.observations[1].classification,'FLAGGED')
    def test_bad_station_hold(self):
        with self.assertRaises(QualityHold):parse_csv(sample().replace('USW00024243','USW00000000'),year=2025)
    def test_2025_full_year_and_conservation(self):
        from datetime import timedelta
        d=date(2025,1,1);rows=['"STATION","DATE","PRCP","PRCP_ATTRIBUTES"']
        while d.year==2025:
            m='T' if d.day==2 else ''
            val='0.0' if d.day==2 else ('10.0' if d.day==1 else '0.0')
            rows.append(f'"USW00024243","{d.isoformat()}","{val}","{m},,W,2400"')
            d+=timedelta(days=1)
        a=parse_csv('\n'.join(rows)+'\n',year=2025)
        self.assertEqual(a.expected_days,365)
        self.assertEqual(a.trace_days,12)
        self.assertEqual(a.total_precip_mm_lower_bound,120)
        x=tank_scenario(a,tank_l=1000,daily_demand_l=100)
        self.assertAlmostEqual(x['tank_admitted_l'],x['delivered_l']+x['overflow_l']+x['ending_tank_l'])
    def test_no_double_count_trace_water(self):
        with self.assertRaises(QualityHold):parse_csv(sample(second='1.0',f='T,,W,2400'),year=2025)
    def test_blank_noaa_row_is_missing_not_zero(self):
        x=sample(second='',f='')
        a=parse_csv(x,year=2025)
        self.assertEqual(a.observations[1].classification,'MISSING')
        self.assertIn('2025-01-02',a.missing_days)
    def test_rejected_missing_raw_and_units(self):
        with self.assertRaises(QualityHold):parse_csv('',year=2025)
        with self.assertRaises(QualityHold):parse_csv(sample().replace('"PRCP"','"RAINFALL"'),year=2025)

if __name__=='__main__':unittest.main()
