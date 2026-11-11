import math
import sys
import unittest
from pathlib import Path
from datetime import date, timedelta
sys.path.insert(0, str(Path(__file__).parents[1]/'science'))
from evidence_gate import (PairedDay, Protocol, evaluate_paired,
                           crop_water_screen, break_even_water_value_usd_per_m3)

class EvidenceGateTests(unittest.TestCase):
    def setUp(self):
        self.p = Protocol('prereg-001',True,True,True, .5)
    def rows(self, base=100, treatment=90, recaptured=12, reused=10, days=14):
        return [PairedDay(date(2026,10,1)+timedelta(days=i),base,treatment,
                          recaptured,reused,5,6,True,True) for i in range(days)]
    def test_physical_reuse_caps_candidate(self):
        r=evaluate_paired(self.rows(base=100,treatment=50,reused=10),self.p)
        self.assertEqual(r.conservative_candidate_offset_l,140)
        self.assertEqual(r.state,'RESEARCH_SIGNAL_NEEDS_EXTERNAL_CAUSAL_REVIEW')
    def test_cannot_credit_untreated_or_unreused_capture(self):
        r=evaluate_paired(self.rows(recaptured=60,reused=0),self.p)
        self.assertEqual(r.conservative_candidate_offset_l,0)
        self.assertIn('no condensate actually reused',r.reasons)
    def test_unapproved_reuse_rejected(self):
        p=Protocol('test',True,True,False,.5)
        with self.assertRaisesRegex(ValueError,'unauthorized'):evaluate_paired(self.rows(),p)
    def test_unapproved_but_isolated_no_credit(self):
        p=Protocol('test',True,True,False,.5)
        r=evaluate_paired(self.rows(reused=0),p)
        self.assertEqual(r.conservative_candidate_offset_l,0)
    def test_no_prereg_holds(self):
        p=Protocol('test',False,True,True,.5)
        r=evaluate_paired(self.rows(),p)
        self.assertEqual(r.conservative_candidate_offset_l,0)
    def test_no_independent_review_holds(self):
        p=Protocol('test',True,False,True,.5)
        r=evaluate_paired(self.rows(),p)
        self.assertEqual(r.conservative_candidate_offset_l,0)
    def test_short_series_holds(self):
        r=evaluate_paired(self.rows(days=7),self.p)
        self.assertEqual(r.conservative_candidate_offset_l,0)
    def test_missing_day_and_repeat_holds(self):
        rows=self.rows()
        for broken in (rows[:4]+rows[5:], rows[:2]+[rows[1]]+rows[2:]):
            with self.assertRaisesRegex(ValueError,'gaps'):evaluate_paired(broken,self.p)
    def test_bad_quality_holds(self):
        rows=self.rows()
        rows[2]=PairedDay(date(2026,10,3),100,90,12,10,5,6,False,True)
        with self.assertRaisesRegex(ValueError,'QA'):evaluate_paired(rows,self.p)
    def test_difference_not_significant_holds(self):
        rows=self.rows(base=100,treatment=100)
        r=evaluate_paired(rows,self.p)
        self.assertEqual(r.conservative_candidate_offset_l,0)
    def test_meter_error_can_block(self):
        p=Protocol('prereg',True,True,True,6)
        r=evaluate_paired(self.rows(),p)
        self.assertEqual(r.conservative_candidate_offset_l,0)
        self.assertIn('meter uncertainty overwhelms apparent difference',r.reasons)
    def test_collected_volume_not_external_savings(self):
        r=evaluate_paired(self.rows(base=100,treatment=100,recaptured=90,reused=90),self.p)
        self.assertEqual(r.conservative_candidate_offset_l,0)
    def test_crop_etr(self):
        r=crop_water_screen(10,.8,2,100, .8)
        self.assertAlmostEqual(r.crop_etc_mm,8)
        self.assertAlmostEqual(r.estimated_gross_application_l,750)
    def test_crop_rain_capped(self):
        r=crop_water_screen(5,.8,6,100,.9)
        self.assertEqual(r.estimated_gross_application_l,0)
    def test_bad_efficiency(self):
        for eff in [0,-1,1.2,math.nan]:
            with self.assertRaises(ValueError):crop_water_screen(10,.8,0,100,eff)
    def test_break_even(self):
        self.assertAlmostEqual(break_even_water_value_usd_per_m3(1000,10,.12,2,1),4.2)
        self.assertIsNone(break_even_water_value_usd_per_m3(0,0,.12,0,0))
    def test_nonfinite_meters(self):
        with self.assertRaises(ValueError):self.rows(reused=float('nan'))
        with self.assertRaises(ValueError):Protocol('id',True,True,True,float('inf'))
    def test_negative_power_delta_kept_as_measurement(self):
        r=evaluate_paired(self.rows(),self.p)
        self.assertEqual(r.incremental_system_kwh,14)

if __name__=='__main__': unittest.main()
