import sys,unittest,copy,hashlib,io,csv
from pathlib import Path
from datetime import date,timedelta
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'pilot'))
sys.path.insert(0,str(root/'python'))
from pilot_gate import preflight,SCHEMA,EvidenceHold
from field_audit import COLUMNS


def example():
    f=io.StringIO();w=csv.DictWriter(f,fieldnames=COLUMNS,lineterminator='\n');w.writeheader()
    for i in range(14):
        w.writerow(dict(date=(date(2026,10,1)+timedelta(days=i)).isoformat(),
            source_meter_id='SRC0001',source_open_l=i*1000,source_close_l=(i+1)*1000,
            irrigation_meter_id='IRR0001',irrigation_open_l=i*950,irrigation_close_l=(i+1)*950,
            source_uncertainty_l=10,irrigation_uncertainty_l=10,pump_kwh=3,
            calibration_ref='CALLOG_UNVERIFIED',observation_kind='ACTUAL_RECORDED_METER'))
    csvdata=f.getvalue()
    h=lambda n:format(n,'064x')
    m=dict(schema=SCHEMA,site_alias='SITE_PILOT_001',purpose='passive_water_energy_baseline_only',
        permission=dict(operator_consent_attested=True,consent_document_sha256=h(1),expires_on='2026-12-31'),
        records=dict(meter_csv_sha256=hashlib.sha256(csvdata.encode()).hexdigest(),start='2026-10-01',end='2026-10-14'),
        boundary=dict(diagram_sha256=h(2),independent_review_receipt_sha256=h(3),all_known_uses_declared=True),
        instruments=dict(source=dict(meter_id='SRC0001',calibration_document_sha256=h(4),calibration_valid_through='2026-12-31'),
            irrigation=dict(meter_id='IRR0001',calibration_document_sha256=h(5),calibration_valid_through='2026-12-31'),
            pump_energy=dict(meter_id='PMP0001',calibration_document_sha256=h(6),calibration_valid_through='2026-12-31')))
    return m,csvdata


class PilotGate(unittest.TestCase):
    def setUp(self):self.m,self.csv=example()
    def call(self):return preflight(self.m,self.csv,as_of=date(2026,11,4))
    def test_pass_is_documentary_only(self):
        result=self.call()
        self.assertEqual(result['state'],'DOCUMENTARY_PRECHECK_COMPLETE_UNAUTHENTICATED')
        self.assertFalse(result['water_savings_verified'])
        self.assertFalse(result['operator_permission_authenticated'])
        self.assertFalse(result['authorized_for_physical_work'])
        self.assertNotIn('source_inlet_l',result)
    def test_missing_or_revoked_consent_hold(self):
        for v in [False,None,'true']:
            m,c=example();m['permission']['operator_consent_attested']=v
            with self.subTest(v=v),self.assertRaises(EvidenceHold):preflight(m,c,as_of=date(2026,11,4))
    def test_expired_consent_hold(self):
        self.m['permission']['expires_on']='2026-11-03'
        with self.assertRaises(EvidenceHold):self.call()
    def test_invalid_data_integrity_hold(self):
        self.csv=self.csv.replace('1000','1001',1)
        with self.assertRaisesRegex(EvidenceHold,'hash mismatch'):self.call()
    def test_unrecognized_site_alias_hold(self):
        self.m['site_alias']='farmer@example.com'
        with self.assertRaises(EvidenceHold):self.call()
    def test_scope_cannot_extend_to_irrigation_actuation(self):
        self.m['purpose']='control_irrigation_pumps'
        with self.assertRaises(EvidenceHold):self.call()
    def test_meter_id_mismatch_hold(self):
        self.m['instruments']['source']['meter_id']='OTHERMETER'
        with self.assertRaises(EvidenceHold):self.call()
    def test_calibration_expired_during_data_window_hold(self):
        self.m['instruments']['irrigation']['calibration_valid_through']='2026-10-05'
        with self.assertRaises(EvidenceHold):self.call()
    def test_missing_calibration_hash_hold(self):
        self.m['instruments']['pump_energy']['calibration_document_sha256']=''
        with self.assertRaises(EvidenceHold):self.call()
    def test_unsupported_boundary_hold(self):
        del self.m['boundary']['independent_review_receipt_sha256']
        with self.assertRaises(EvidenceHold):self.call()
    def test_known_uses_disclosure_hold(self):
        self.m['boundary']['all_known_uses_declared']=False
        with self.assertRaises(EvidenceHold):self.call()
    def test_mismatched_date_range_hold(self):
        self.m['records']['end']='2026-10-15'
        with self.assertRaises(EvidenceHold):self.call()
    def test_future_observations_hold(self):
        with self.assertRaises(EvidenceHold):preflight(self.m,self.csv,as_of=date(2026,10,1))
    def test_fictional_observation_kind_hold(self):
        self.csv=self.csv.replace('ACTUAL_RECORDED_METER','SYNTHETIC_DEMONSTRATION')
        self.m['records']['meter_csv_sha256']=hashlib.sha256(self.csv.encode()).hexdigest()
        with self.assertRaises(EvidenceHold):self.call()
    def test_tampered_meter_totalizer_hold_even_with_matched_hash(self):
        self.csv=self.csv.replace('1000,', '900,',1)
        self.m['records']['meter_csv_sha256']=hashlib.sha256(self.csv.encode()).hexdigest()
        with self.assertRaises(EvidenceHold):self.call()
    def test_does_not_return_sensitive_meter_data(self):
        output=self.call()
        self.assertNotIn('daily_records',output)
        self.assertNotIn('meter_values',output)
        self.assertEqual(len(output['meter_csv_sha256']),64)

if __name__=='__main__':unittest.main()