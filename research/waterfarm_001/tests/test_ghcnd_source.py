import sys
import tempfile
import unittest
from pathlib import Path
from datetime import date
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'noaa'))
from ghcnd_source import STATION, DataHold, parse_station, publish_review


def prcp(year, month, values=None, flagged=None):
    """Create one fully synthetic 269-column PRCP record for fixture tests."""
    values = values or {}
    flagged = flagged or {}
    fields = []
    for day in range(1, 32):
        amount = values.get(day, 0)
        m, q, s = flagged.get(day, ('', '', 'A'))
        fields.append(f'{amount:5d}{m or " "}{q or " "}{s or " "}')
    result = f'{STATION}{year:04d}{month:02d}PRCP'+''.join(fields)
    assert len(result) == 269
    return result


def fixture(year=2025, modifications=None, omit_months=()):
    modifications = modifications or {}
    return ('\n'.join(prcp(year, m, **modifications.get(m, {})) for m in range(1, 13)
                      if m not in omit_months)+'\n').encode('ascii')


class GHCNDailySourceTests(unittest.TestCase):
    def test_full_year_real_zero_vs_nonzero(self):
        x = parse_station(fixture(modifications={1:{'values':{1:123}}}), year=2025)
        self.assertEqual(x.days_expected, 365)
        self.assertEqual(x.days_held, 0)
        self.assertAlmostEqual(x.precipitation_mm_if_all_clear, 12.3)
        self.assertEqual(x.days[0].prcp_mm, 12.3)
        self.assertEqual(x.days[1].prcp_mm, 0)
        self.assertEqual(x.days[1].status, 'CLEAR')

    def test_leap_year_days(self):
        x = parse_station(fixture(2024), year=2024)
        self.assertEqual(x.days_expected, 366)
        self.assertEqual(x.days_held, 0)
        self.assertIn('2024-02-29', [d.day for d in x.days])

    def test_absent_month_is_hold(self):
        x = parse_station(fixture(omit_months=(2,)), year=2025)
        self.assertEqual(x.days_held, 28)
        self.assertEqual(x.status, 'HOLD_DAILY_PRECIPITATION_INCOMPLETE')
        self.assertIsNone(x.precipitation_mm_if_all_clear)

    def test_missing_observation_is_not_dry_day(self):
        x = parse_station(fixture(modifications={4:{'values':{3:-9999}}}),year=2025)
        self.assertEqual(x.days_held, 1)
        self.assertIn('MISSING', x.days[92].status)

    def test_measurement_flags_trace_presumed_zero_and_ambiguous(self):
        for flag in ('T', 'P', 'H', 'I', 'Z'):
            with self.subTest(flag=flag):
                x = parse_station(fixture(modifications={1:{'flagged':{1:(flag,'','A')}}}),year=2025)
                self.assertEqual(x.days_held, 1)
                self.assertIn('MEASUREMENT_FLAG_REVIEW', x.days[0].status)

    def test_quality_flag_is_hold(self):
        for flag in ('D', 'T', 'L', 'O'):
            with self.subTest(flag=flag):
                x = parse_station(fixture(modifications={1:{'flagged':{1:(' ',flag,'A')}}}),year=2025)
                self.assertIn('FAILED_QC', x.days[0].status)

    def test_daily_summed_measurement_is_accepted_with_caution(self):
        for flag in 'ABCDEFG':
            x = parse_station(fixture(modifications={1:{'flagged':{1:(flag,'','A')}}}),year=2025)
            self.assertEqual(x.days_held, 0)

    def test_blank_sflag_without_measurement_source_hold(self):
        x = parse_station(fixture(modifications={1:{'flagged':{1:('','','')}}}),year=2025)
        self.assertIn('NO_SOURCE', x.days[0].status)

    def test_multiday_not_interpreted_as_daily(self):
        payload = (prcp(2025,1) + '\n' + prcp(2025,2).replace('PRCP', 'MDPR', 1) + '\n' +
                   '\n'.join(prcp(2025,m) for m in range(3,13))+'\n').encode('ascii')
        x = parse_station(payload,year=2025)
        self.assertEqual(x.days_held,28)

    def test_duplicate_month_fails_closed(self):
        with self.assertRaises(DataHold):
            parse_station(fixture()+prcp(2025,1).encode('ascii')+b'\n',year=2025)

    def test_wrong_station_rejected(self):
        with self.assertRaises(DataHold):parse_station(fixture().replace(STATION.encode(),b'USW00099999'),year=2025)

    def test_bad_width_rejected(self):
        with self.assertRaises(DataHold):parse_station(fixture()+b'TRUNCATED\n',year=2025)

    def test_invalid_and_negative_rejected(self):
        for val in (-100, -9998):
            x = parse_station(fixture(modifications={1:{'values':{1:val}}}),year=2025)
            self.assertIn('NEGATIVE_VALUE',x.days[0].status)

    def test_qc_output_emits_only_after_full_coverage(self):
        with tempfile.TemporaryDirectory() as folder:
            r, clean=publish_review(parse_station(fixture(),year=2025),Path(folder))
            self.assertTrue(r.exists());self.assertTrue(clean.exists())
            self.assertEqual(len(clean.read_text().splitlines()),366)
            r, clean=publish_review(parse_station(fixture(omit_months=(7,)),year=2025),Path(folder))
            self.assertIsNone(clean)
            self.assertEqual(len(list(Path(folder).glob('*_unverified_daily_prcp.csv'))), 1) # prior verified artifact remains, uniquely tied to original source hash; never overwritten

    def test_sha_receipt_not_authenticity_claim(self):
        x = parse_station(fixture(),year=2025)
        self.assertEqual(len(x.raw_sha256),64)
        self.assertIn('UNVERIFIED',x.status)

    def test_nonbytes_fails(self):
        with self.assertRaises(DataHold):parse_station('',year=2025)


if __name__=='__main__':unittest.main()
