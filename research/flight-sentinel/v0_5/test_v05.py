"""Reviewable regression subset for the v0.5 OFFLINE research layer."""
import math
import unittest
from robust_guard import RobustGuardian,TestRigAnchor,OfflineFallbackArbiter
from campaign_v05 import run,cases_v05,make_anchor
from benchmark_v04 import proposal_for

def scenario(ground=None,**kw):
    return dict(ground=ground or [500,500,0,20],turn=kw.pop('turn',0),**kw)

class GuardTests(unittest.TestCase):
    def test_center(self):
        c=scenario()
        self.assertTrue(RobustGuardian().check(proposal_for(c),1000,make_anchor(c)).allowed)
    def test_pair_spoof_detected(self):
        c=scenario([845,500,0,20],reported=[500,500])
        d=RobustGuardian().check(proposal_for(c),1000,make_anchor(c))
        self.assertIn('INDEPENDENT_REFERENCE_CONFLICT',d.reasons)
    def test_triple_spoof_is_still_missed(self):
        c=scenario([845,500,0,20],reported=[500,500],forged_anchor=[500,500])
        self.assertTrue(RobustGuardian().check(proposal_for(c),1000,make_anchor(c)).allowed)
    def test_wind_within_bound(self):
        c=scenario([730,500,0,20],wind=[6,0])
        self.assertIn('ROBUST_REACHABLE_SET_BREACH',
            RobustGuardian().check(proposal_for(c),1000,make_anchor(c)).reasons)
    def test_wind_exceeds_assumption(self):
        c=scenario([650,500,0,20],wind=[12,0])
        self.assertTrue(RobustGuardian().check(proposal_for(c),1000,make_anchor(c)).allowed)
    def test_missing_anchor(self):
        c=scenario()
        self.assertIn('ANCHOR_UNAVAILABLE',
            RobustGuardian().check(proposal_for(c),1000,None).reasons)
    def test_bad_anchor(self):
        c=scenario()
        self.assertIn('ANCHOR_INVALID',RobustGuardian().check(
            proposal_for(c),1000,TestRigAnchor(math.nan,500,1000)).reasons)
    def test_stale_anchor(self):
        c=scenario()
        self.assertIn('ANCHOR_STALE',RobustGuardian().check(
            proposal_for(c),1000,TestRigAnchor(500,500,995)).reasons)
    def test_invalid_clock(self):
        c=scenario()
        for now in (None,'1000',math.nan,True):
            self.assertIn('INVALID_CLOCK',RobustGuardian().check(
                proposal_for(c),now,make_anchor(c)).reasons)
    def test_latched_after_reject(self):
        c=scenario([845,500,0,20])
        g=RobustGuardian()
        g.check(proposal_for(c),1000,make_anchor(c))
        self.assertIn('INTERLOCK_LATCHED_V05',
                      g.check(proposal_for(scenario(),seq=2,at=1001),
                              1001,TestRigAnchor(500,500,1001)).reasons)
    def test_fake_root_is_not_provenance(self):
        c=scenario(shared_root=True)
        self.assertIn('DUPLICATE_CLAIMED_PROVENANCE',
            RobustGuardian().check(proposal_for(c),1000,make_anchor(c)).reasons)
    def test_invalid_bounds(self):
        for value in (True,math.nan,math.inf,-1,30):
            with self.assertRaises(ValueError):RobustGuardian(wind_bound_m_s=value)

class ArbiterTests(unittest.TestCase):
    def test_request_and_explicit_ack(self):
        c=scenario([845,500,0,20])
        d=RobustGuardian().check(proposal_for(c),1000,make_anchor(c))
        a=OfflineFallbackArbiter()
        self.assertEqual(a.observe(d),'FALLBACK_REQUESTED')
        self.assertEqual(a.acknowledge(True,True),'FALLBACK_SIM')
    def test_no_ack_without_request(self):
        with self.assertRaises(ValueError):
            OfflineFallbackArbiter().acknowledge(True,True)
    def test_unhealthy_fallback_holds(self):
        c=scenario([845,500,0,20])
        d=RobustGuardian().check(proposal_for(c),1000,make_anchor(c))
        a=OfflineFallbackArbiter();a.observe(d)
        self.assertEqual(a.acknowledge(True,False),'HOLD_FOR_REVIEW')

class CampaignTests(unittest.TestCase):
    def test_exact_comparison(self):
        r=run()
        self.assertEqual(r['case_count'],20)
        self.assertEqual(r['v04_counts_on_same_cases'],
                         {'TP':4,'TN':6,'FP':5,'FN':5})
        self.assertEqual(r['v05_counts'],
                         {'TP':7,'TN':3,'FP':8,'FN':2})
    def test_unique_scenarios(self):
        names=[r['name'] for r in cases_v05()]
        self.assertEqual(len(names),len(set(names)))
    def test_false_alarms_worse(self):
        r=run()
        self.assertGreater(r['v05_counts']['FP'],r['v04_counts_on_same_cases']['FP'])
    def test_remaining_misses_visible(self):
        r=run()
        missed={c['name'] for c in r['cases'] if c['v05_outcome']=='FN'}
        self.assertEqual(missed,{'all_three_sources_coherently_spoofed','wind_exceeds_declared_bound'})

if __name__=='__main__':
    unittest.main()
