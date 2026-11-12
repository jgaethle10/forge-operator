import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('wa_2026_county',ROOT/'scripts/wa_2026_county.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def fixture():
    arr=[]
    for i in range(8619):
        c='G' if i<4298 else ('F' if i<8216 else 'P')
        county=77 if i<200 else (1 if i<400 else 33)
        arr.append(dict(BL01=53,BID01=f'WA{i:05d}',BID02='Test Bridge',
                        BL02=county,BC12=c,BL05=46.6,BL06=-120.7))
    return arr

class WACountyTests(unittest.TestCase):
    def test_county_code_mapping(self):
        self.assertEqual(len(m.COUNTIES),39)
        self.assertEqual(m.COUNTY_BY_FIPS['077'],'Yakima')
        self.assertEqual(m.COUNTY_BY_FIPS['033'],'King')
        self.assertEqual(m.county(77),'077')
        self.assertIsNone(m.county(99))
        self.assertIsNone(m.county('not reported'))
    def test_real_county_not_geographic_guess(self):
        src=fixture()
        src[0]['BL02']=77
        src[0]['BL05']=47.6
        src[0]['BL06']=-122.3
        rows=m.normalize(src)
        self.assertEqual(rows[0]['county_name'],'Yakima')
        self.assertEqual(rows[0]['county_code'],'077')
        self.assertEqual(rows[0]['county_source_field'],'BL02')
        self.assertEqual(rows[0]['location_quality'],'plottable')
    def test_county_sum_and_conditions(self):
        rows=m.normalize(fixture())
        audit=m.summary(rows,m.EXPECTED_SHA256)
        self.assertEqual(audit['bridge_records'],8619)
        self.assertEqual(audit['assigned'],8619)
        self.assertEqual(sum(r['total'] for r in audit['county_rows']),8619)
        self.assertEqual(next(r for r in audit['county_rows'] if r['county_name']=='Yakima')['total'],200)
    def test_missing_county_not_assigned_by_coordinates(self):
        items=fixture()
        items[0]['BL02']=None
        rows=m.normalize(items)
        audit=m.summary(rows,m.EXPECTED_SHA256)
        self.assertEqual(audit['unassigned'],1)
        self.assertEqual(rows[0]['county_name'],'Unassigned')
    def test_reject_wrong_state(self):
        items=fixture();items[0]['BL01']=41
        with self.assertRaisesRegex(ValueError,'Wrong state'):m.normalize(items)
    def test_reject_duplicate_id(self):
        items=fixture();items[0]['BID01']=items[1]['BID01']
        with self.assertRaisesRegex(ValueError,'Duplicate'):m.normalize(items)
    def test_reject_wrong_count(self):
        with self.assertRaisesRegex(ValueError,'count mismatch'):m.normalize(fixture()[:-1])
    def test_reject_condition_totals_drift(self):
        items=fixture();items[0]['BC12']='P'
        with self.assertRaisesRegex(ValueError,'condition totals'):m.normalize(items)

if __name__=='__main__':unittest.main()
