"""Unit and counterexample regressions for a fictional topology guardian."""
import random
import unittest
from dependency_lab import Service, Topology, review_candidate, compare_with_hidden_truth
from cases_v02 import topology, fixtures, campaign


class TopologyTests(unittest.TestCase):
    def setUp(self):
        self.t=topology()
        self.ok={n:True for n in self.t.dependencies}

    def test_valid_topology(self):
        self.t.validate()
    def test_declared_service_routes(self):
        self.assertTrue(all(self.t.service_status(self.ok).values()))
    def test_backup_preserves_critical_service(self):
        result=self.t.service_status(self.ok,{'relay-a'})
        self.assertTrue(result['voice']);self.assertTrue(result['tracking'])
    def test_single_route_loss(self):
        self.assertFalse(self.t.service_status(self.ok,{'relay-c'})['dispatch'])
    def test_two_relay_loss(self):
        result=self.t.service_status(self.ok,{'relay-a','relay-b'})
        self.assertFalse(result['voice'])
    def test_shared_power_is_a_real_correlated_fault(self):
        t=topology(hidden_shared_power=True)
        state=self.ok.copy();state['shared-power']=False
        result=t.service_status(state)
        self.assertFalse(result['status-page']);self.assertFalse(result['dispatch'])
        self.assertTrue(result['voice'])
    def test_unknown_dependency_rejected(self):
        broken=Topology({'x':('missing',)},(Service('s',(('x',),)),))
        with self.assertRaises(ValueError):broken.validate()
    def test_dependency_cycle_rejected(self):
        broken=Topology({'x':('y',),'y':('x',)},(Service('s',(('x',),)),))
        with self.assertRaises(ValueError):broken.validate()
    def test_duplicate_service_rejected(self):
        broken=Topology({'x':()},(Service('s',(('x',),)),Service('s',(('x',),))))
        with self.assertRaises(ValueError):broken.validate()
    def test_unknown_health_rejected(self):
        with self.assertRaises(ValueError):self.t.service_status({'fake':True})
    def test_boolean_health_enforced(self):
        state=self.ok.copy();state['relay-a']=1
        with self.assertRaises(ValueError):self.t.service_status(state)
    def test_unknown_isolation_rejected(self):
        with self.assertRaises(ValueError):self.t.service_status(self.ok,{'unlisted-relay'})
    def test_root_closure(self):
        self.assertEqual(self.t.roots_for('relay-a'),{'relay-a','power-a'})
    def test_report_is_deterministic(self):
        self.assertEqual(campaign(),campaign())


class AdvisorTests(unittest.TestCase):
    def setUp(self):
        self.t=topology()
        self.ok={n:True for n in self.t.dependencies}

    def assess(self,candidate='relay-a',**kwargs):
        return review_candidate(self.t,self.ok,candidate,**kwargs)

    def test_explicit_sandbox_review(self):
        self.assertEqual(self.assess(explicit_human_review=True).action,'PROPOSE_SANDBOX_ONLY')
    def test_not_automatically_authorized(self):
        self.assertEqual(self.assess().action,'HOLD_FOR_REVIEW')
    def test_stale_evidence_holds(self):
        self.assertIn('STALE_OR_UNTRUSTED_EVIDENCE',self.assess(fresh=False).reasons)
    def test_invalid_flags_rejected(self):
        with self.assertRaises(ValueError):self.assess(fresh='yes')
    def test_missing_candidate(self):
        self.assertEqual(self.assess(None).action,'NO_ISOLATION')
    def test_unknown_candidate(self):
        self.assertEqual(self.assess('unknown').action,'HOLD_FOR_REVIEW')
    def test_visible_single_route_harm_blocked(self):
        d=self.assess('relay-c',explicit_human_review=True)
        self.assertEqual(d.action,'REJECT_UNSAFE_ISOLATION')
        self.assertEqual(d.predicted_lost,('dispatch',))
    def test_visible_backup_outage_harm_blocked(self):
        state=self.ok.copy();state['relay-b']=False
        d=review_candidate(self.t,state,'relay-a',explicit_human_review=True)
        self.assertEqual(d.action,'REJECT_UNSAFE_ISOLATION')
    def test_common_declared_dependency(self):
        t=topology(declared_shared_core=True)
        d=review_candidate(t,self.ok,'relay-a',explicit_human_review=True)
        self.assertEqual(d.action,'HOLD_FOR_REVIEW')
        self.assertIn('DECLARED_COMMON_DEPENDENCY',d.reasons)
    def test_no_mutation_of_input_health(self):
        state=self.ok.copy()
        self.assess(explicit_human_review=True)
        self.assertEqual(self.ok,state)
    def test_unknown_hidden_dependency_cannot_be_inferred(self):
        d1=review_candidate(self.t,self.ok,'relay-a',explicit_human_review=True)
        t2=topology(hidden_shared_power=True)
        hidden=self.ok.copy();hidden['shared-power']=False
        r=compare_with_hidden_truth(self.t,t2,self.ok,hidden,'relay-a',explicit_human_review=True)
        self.assertEqual(d1.action,r['advisory'])
        self.assertEqual(r['unexpected_losses'],['tracking','voice'])
    def test_no_sandbox_application_without_review(self):
        r=compare_with_hidden_truth(self.t,self.t,self.ok,self.ok,'relay-a',explicit_human_review=False)
        self.assertFalse(r['hypothetical_intervention_applied'])
    def test_hypothetical_harm_flagged(self):
        row=next(c for c in campaign()['cases'] if c['case']=='unmodeled_backup_power_failure')
        self.assertTrue(row['critical_harmed'])
    def test_containment_harm_only_virtual(self):
        row=next(c for c in campaign()['cases'] if c['case']=='normal_sandbox_isolation')
        self.assertEqual(row['actual_before'],row['actual_after'])
    def test_nine_handbuilt_cases(self):
        self.assertEqual(len(fixtures()),9)
    def test_faults_are_preserved_as_counterexamples(self):
        cases=campaign()['cases']
        harmful=[x for x in cases if x['critical_harmed']]
        self.assertEqual({x['case'] for x in harmful},
                         {'unmodeled_backup_power_failure','all_telemetry_consistently_wrong'})
    def test_randomized_monotone_isolation(self):
        rng=random.Random(20261115)
        t=self.t
        for _ in range(1000):
            health={k:rng.choice([True,False]) for k in t.dependencies}
            before=t.service_status(health)
            nodes=set(rng.sample(list(sorted(t.dependencies)),rng.randrange(0,len(t.dependencies)+1)))
            after=t.service_status(health,nodes)
            self.assertFalse(any(after[s] and not before[s] for s in before))


if __name__=='__main__':unittest.main()
