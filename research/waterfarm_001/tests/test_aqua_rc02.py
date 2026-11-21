import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'science'))
sys.path.insert(0,str(Path(__file__).parents[1]/'film'))
from greenhouse_trial import TrialDay,Prices,evaluate
from build_film import validate,safe_source

class FilmFailClosed(unittest.TestCase):
    def setUp(self):
        self.root=Path(__file__).parents[1]/'film'
        self.manifest=json.loads((self.root/'manifest.json').read_text())
    def test_unapproved_original_manifest_fails(self):
        with self.assertRaisesRegex(ValueError,'file_sha256'):
            validate(self.manifest,self.root)
    def test_fake_approvals_fail_without_media(self):
        clip=self.manifest['clips'][0]
        clip['license_verified']=clip['camera_footage_verified']=True
        clip['file_sha256']='a'*64
        from build_film import check_source
        with self.assertRaisesRegex(ValueError,'no recorded camera footage'):
            check_source(self.root,clip)
    def test_traversal_rejected(self):
        for x in ['/etc/passwd','assets/../../etc/passwd','../assets/video.mp4']:
            with self.assertRaises(ValueError):safe_source(self.root,x)
    def test_format_unapproved(self):
        self.manifest['width']=1921
        with self.assertRaises(ValueError):validate(self.manifest,self.root)
    def test_nonfive_or_duplicate_rejected(self):
        self.manifest['clips'].pop()
        with self.assertRaises(ValueError):validate(self.manifest,self.root)

class ScienceSafety(unittest.TestCase):
    def setUp(self):
        self.pr=Prices(3,.12,.4,200,1500)
    def test_recovery_does_not_mean_water_saved(self):
        d=TrialDay(100,100,50,0,20,25,True,False,True)
        result=evaluate([d],self.pr,300)
        self.assertEqual(result.verified_reduction_in_external_water_l,0)
        self.assertEqual(result.state,'HOLD_NO_APPROVED_REUSE')
    def test_reuse_without_approval_rejected(self):
        d=TrialDay(100,60,60,40,20,25,True,False,True)
        with self.assertRaisesRegex(ValueError,'not approved'):evaluate([d],self.pr,300)
    def test_measured_delta_not_capture_volume(self):
        d=TrialDay(100,90,50,50,20,25,True,True,True)
        r=evaluate([d],self.pr,300)
        self.assertEqual(r.verified_reduction_in_external_water_l,0)
        self.assertEqual(r.annualized_water_reduction_m3,0)
        self.assertEqual(r.annualized_incremental_electricity_kwh,1500)
        self.assertLess(r.modeled_annual_net_benefit_usd,0)
        self.assertIsNone(r.hypothetical_simple_payback_years)
        self.assertIn('HOLD_LEGACY', r.state)
    def test_missing_quality_rejected(self):
        d=TrialDay(100,90,10,0,20,21,True,False,False)
        with self.assertRaisesRegex(ValueError,'HOLD'):evaluate([d],self.pr,300)
    def test_invalid_sensor_measurement_rejected(self):
        with self.assertRaises(ValueError):TrialDay(100,-1,0,0,20,20,True,True,True)
        with self.assertRaises(ValueError):TrialDay(100,100,5,7,20,20,True,True,True)
        with self.assertRaises(ValueError):Prices(0,0,-1,0,0)
    def test_no_samples_rejected(self):
        with self.assertRaises(ValueError):evaluate([],self.pr,365)
    def test_unmatched_rejected(self):
        d=TrialDay(100,90,10,10,20,21,False,True,True)
        with self.assertRaisesRegex(ValueError,'HOLD'):evaluate([d],self.pr,365)

if __name__=='__main__':unittest.main()
