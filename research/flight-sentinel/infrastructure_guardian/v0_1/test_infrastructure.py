"""Conservative failure-case tests, not aviation performance validation."""
import math
import unittest
from model import Guardian, Policy, Snapshot, service_state, run_trace
from scenarios import snapshots, campaign


def sample(tick=0, rate=35., **kwargs):
    rates={'node-a':rate,'node-b':35.,'node-c':35.}
    return Snapshot(tick,rates,dict(rates),dict(rates),**kwargs)


class GuardianTests(unittest.TestCase):
    def test_clean_input(self):
        self.assertEqual(Guardian().inspect(sample()).action,'OBSERVE')

    def test_persistence_avoids_single_spike(self):
        g=Guardian()
        self.assertEqual(g.inspect(sample(0,500)).action,'DEGRADE_AND_REVIEW')
        self.assertEqual(g.inspect(sample(1)).action,'OBSERVE')
        self.assertEqual(g.inspect(sample(2,500)).action,'DEGRADE_AND_REVIEW')

    def test_two_samples_propose(self):
        g=Guardian()
        g.inspect(sample(0,500))
        a=g.inspect(sample(1,500))
        self.assertEqual((a.action,a.isolation_candidate),('PROPOSE_ISOLATION','node-a'))

    def test_invalid_numeric(self):
        for x in (float('nan'),math.inf,-1.,True):
            self.assertEqual(Guardian().inspect(sample(rate=x)).action,'CONSERVATIVE_HOLD')

    def test_sensor_disagreement(self):
        r={'node-a':500.,'node-b':35.,'node-c':35.}
        c=dict(r);c['node-a']=35.
        s=Snapshot(0,r,r,c)
        self.assertEqual(Guardian().inspect(s).action,'CONSERVATIVE_HOLD')

    def test_missing_tick(self):
        g=Guardian();g.inspect(sample(0))
        self.assertIn('MISSING_OR_REPLAYED_SAMPLE',g.inspect(sample(2)).reasons)

    def test_stale_observation(self):
        self.assertEqual(Guardian().inspect(sample(0,telemetry_fresh=False)).action,'CONSERVATIVE_HOLD')

    def test_common_backup_failure(self):
        self.assertEqual(Guardian().inspect(sample(0,backup_independent=False)).action,'CONSERVATIVE_HOLD')

    def test_maintenance_not_auto_isolate(self):
        g=Guardian()
        g.inspect(sample(0,500,maintenance_window=True))
        self.assertEqual(g.inspect(sample(1,500,maintenance_window=True)).action,'MANUAL_CHANGE_REVIEW')

    def test_stale_sample_resets_persistence(self):
        g=Guardian()
        g.inspect(sample(0,500))
        g.inspect(sample(1,500,telemetry_fresh=False))
        self.assertEqual(g.inspect(sample(2,500)).action,'DEGRADE_AND_REVIEW')

    def test_monitor_cannot_consume_hidden_truth(self):
        s=Snapshot(0,{'incorrect':-1},
                   {'node-a':35.,'node-b':35.,'node-c':35.},
                   {'node-a':35.,'node-b':35.,'node-c':35.})
        self.assertEqual(Guardian().inspect(s).action,'OBSERVE')
        with self.assertRaises(ValueError): service_state(s,set(),Policy())

    def test_no_external_effect(self):
        seq=snapshots('flood')
        before=seq[3].actual_rates['node-a']
        run_trace(seq, True, True)
        self.assertEqual(seq[3].actual_rates['node-a'],before)


class CampaignTests(unittest.TestCase):
    def test_baseline_flood_overload(self):
        self.assertEqual(run_trace(snapshots('flood'))['primary_overload_ticks'],5)

    def test_flood_contains_with_permission(self):
        r=run_trace(snapshots('flood'),True,True)
        self.assertEqual(r['primary_overload_ticks'],2)
        self.assertEqual(r['final_isolated'],['node-a'])

    def test_no_permission_no_isolation(self):
        r=run_trace(snapshots('flood'),True,False)
        self.assertEqual(r['primary_overload_ticks'],5)
        self.assertEqual(r['final_isolated'],[])

    def test_split_evidence_holds_instead_of_isolating(self):
        r=run_trace(snapshots('split_evidence'),True,True)
        self.assertEqual(r['final_isolated'],[])
        self.assertGreater(r['conservative_hold_ticks'],0)

    def test_coherent_spoof_is_blind_spot(self):
        r=run_trace(snapshots('coherent_spoof'),True,True)
        self.assertEqual(r['primary_overload_ticks'],5)
        self.assertEqual(r['final_isolated'],[])
        self.assertEqual(r['conservative_hold_ticks'],0)

    def test_common_backup_fail_cannot_be_assumed_safe(self):
        s=snapshots('common_backup_fault')[3]
        state=service_state(s,set(),Policy())
        self.assertFalse(state['reliable_path'])

    def test_distributed_burst_not_localized(self):
        r=run_trace(snapshots('distributed_burst'),True,True)
        self.assertEqual(r['final_isolated'],[])
        self.assertEqual(r['primary_overload_ticks'],5)

    def test_one_tick_does_not_quarantine(self):
        r=run_trace(snapshots('one_tick_spike'),True,True)
        self.assertEqual(r['final_isolated'],[])

    def test_campaign_ten_scenarios(self):
        self.assertEqual(len(campaign()),10)


if __name__=='__main__': unittest.main()
