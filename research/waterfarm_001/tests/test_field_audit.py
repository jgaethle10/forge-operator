import unittest,sys,io,csv,math
from pathlib import Path
from datetime import date,timedelta
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'field'))
from field_audit import COLUMNS,parse_meter_csv,audit_meter_baseline,BoundaryAttestation,EvidenceHold

def samples(days=14,*,source_l=1000,irrig_l=900,energy=6):
    output=io.StringIO();writer=csv.DictWriter(output,fieldnames=COLUMNS,lineterminator='\n')
    writer.writeheader()
    for i in range(days):
        writer.writerow(dict(date=(date(2025,1,1)+timedelta(days=i)).isoformat(),
            source_meter_id='meter-A',source_open_l=i*source_l,source_close_l=(i+1)*source_l,
            irrigation_meter_id='meter-B',irrigation_open_l=i*irrig_l,irrigation_close_l=(i+1)*irrig_l,
            source_uncertainty_l=10,irrigation_uncertainty_l=10,pump_kwh=energy,
            calibration_ref='signed-qc-log-pending-validation',observation_kind='ACTUAL_RECORDED_METER'))
    return output.getvalue()

def edit(s,i=1,col='source_close_l',value=''):
    r=list(csv.DictReader(io.StringIO(s)));r[i][col]=value
    out=io.StringIO();w=csv.DictWriter(out,fieldnames=COLUMNS,lineterminator='\n');w.writeheader();w.writerows(r)
    return out.getvalue()

class TestFieldBaseline(unittest.TestCase):
    def setUp(self):self.src=samples()
    def test_baseline_does_not_infer_leak_or_saving(self):
        result=audit_meter_baseline(self.src)
        self.assertEqual(result['source_inlet_l'],14000)
        self.assertEqual(result['irrigation_meter_l'],12600)
        self.assertEqual(result['pump_energy_kwh'],84)
        self.assertEqual(result['energy_kwh_per_source_m3'],6)
        self.assertIsNone(result['apparent_imbalance_l'])
        self.assertFalse(result['ready_for_savings_or_leak_claim'])
        self.assertIn('UNVERIFIED',result['imbalance_status'])
    def test_boundary_only_produces_unexplained(self):
        a=BoundaryAttestation(True,True,True,True)
        res=audit_meter_baseline(self.src,boundary=a)
        self.assertEqual(res['apparent_imbalance_l'],1400)
        self.assertEqual(res['unexplained_above_error_envelope_l'],1120)
        self.assertFalse(res['ready_for_savings_or_leak_claim'])
        self.assertIn('INVESTIGATE',res['imbalance_status']) if 'INVESTIGATE' in res['imbalance_status'] else self.assertIn('REVIEW',res['imbalance_status'])
    def test_partial_boundary_no_imbalance(self):
        res=audit_meter_baseline(self.src,boundary=BoundaryAttestation(diagram_reviewed=True))
        self.assertIsNone(res['apparent_imbalance_l'])
    def test_wrong_kind_hold(self):
        with self.assertRaises(EvidenceHold):audit_meter_baseline(edit(self.src,col='observation_kind',value='MODEL'))
    def test_gap_hold(self):
        with self.assertRaises(EvidenceHold):audit_meter_baseline(edit(self.src,col='date',value='2025-02-02'))
    def test_duplicate_hold(self):
        with self.assertRaises(EvidenceHold):audit_meter_baseline(edit(self.src,col='date',value='2025-01-01'))
    def test_missing_value_not_zero(self):
        with self.assertRaises(EvidenceHold):audit_meter_baseline(edit(self.src,col='pump_kwh',value=''))
    def test_infinite_hold(self):
        with self.assertRaises(EvidenceHold):audit_meter_baseline(edit(self.src,col='source_close_l',value='inf'))
    def test_negative_hold(self):
        with self.assertRaises(EvidenceHold):audit_meter_baseline(edit(self.src,col='irrigation_uncertainty_l',value='-1'))
    def test_reset_hold(self):
        with self.assertRaises(EvidenceHold):audit_meter_baseline(edit(self.src,col='source_close_l',value='0'))
    def test_continuity_hold(self):
        with self.assertRaises(EvidenceHold):audit_meter_baseline(edit(self.src,col='source_open_l',value='500'))
    def test_meter_swap_hold(self):
        with self.assertRaises(EvidenceHold):audit_meter_baseline(edit(self.src,col='source_meter_id',value='meter-C'))
    def test_calibration_ref_required(self):
        with self.assertRaises(EvidenceHold):audit_meter_baseline(edit(self.src,col='calibration_ref',value=''))
    def test_13_days_hold(self):
        with self.assertRaises(EvidenceHold):audit_meter_baseline(samples(13))
    def test_zero_volume_energy_intensity_unknown(self):
        result=audit_meter_baseline(samples(source_l=0,irrig_l=0))
        self.assertIsNone(result['energy_kwh_per_source_m3'])
    def test_covered_value_negative_large_hold(self):
        res=audit_meter_baseline(samples(source_l=100,irrig_l=300),boundary=BoundaryAttestation(True,True,True,True))
        self.assertIn('HOLD',res['imbalance_status'])
    def test_documented_bad_input(self):
        with self.assertRaises(EvidenceHold):parse_meter_csv('')
        with self.assertRaises(EvidenceHold):parse_meter_csv('source,volume\na,2')

if __name__=='__main__':unittest.main()