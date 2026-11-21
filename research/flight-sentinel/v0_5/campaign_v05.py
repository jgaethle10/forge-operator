"""Comparison against independent toy-world truth. No aircraft interfaces."""
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"v0_4"))
from benchmark_v04 import cases, proposal_for, independent_truth_hazard
from virtual_airframe import FlightGate, State
from robust_guard import RobustGuardian, TestRigAnchor, OfflineFallbackArbiter

def cases_v05():
    return [dict(x) for x in cases()]+[
        dict(name='all_three_sources_coherently_spoofed',ground=[845,500,0,20],
             reported=[500,500],forged_anchor=[500,500],blind_spot=True),
        dict(name='wind_exceeds_declared_bound',ground=[650,500,0,20],
             wind=[12,0],blind_spot=True),
        dict(name='anchor_unavailable',ground=[500,500,0,20],anchor_missing=True),
        dict(name='anchor_self_test_failure',ground=[500,500,0,20],anchor_bad=True),
        dict(name='near_edge_safe_false_alarm',ground=[731,500,0,20],turn=0),
        dict(name='full_position_disagreement_safe',ground=[500,500,0,20],
             b_offset=[25,0]),
    ]

def make_anchor(c,time=1000):
    if c.get('anchor_missing'):
        return None
    x,y=c.get('forged_anchor',c['ground'][:2])
    return TestRigAnchor(x,y,time,self_test_ok=not c.get('anchor_bad',False))

def classify(hazard,allowed):
    return ('TP' if hazard and not allowed else 'FN' if hazard else
            'FP' if not allowed else 'TN')

def run():
    results=[]
    for c in cases_v05():
        c.setdefault('turn',0)
        hazard,cross=independent_truth_hazard(State(*c['ground']),
                     c['turn'],c.get('wind',(0,0)))
        proposal=proposal_for(c)
        old=FlightGate().evaluate(proposal,1000)
        new=RobustGuardian().check(proposal,1000,make_anchor(c))
        state=OfflineFallbackArbiter().observe(new)
        results.append(dict(
            name=c['name'],hazard=hazard,truth_crossing_s=cross,
            baseline=old.allowed,baseline_outcome=classify(hazard,old.allowed),
            v05_allowed=new.allowed,v05_outcome=classify(hazard,new.allowed),
            reasons=list(new.reasons),simulated_response=state,
            known_blind_spot=c.get('blind_spot',False),
            actual_xy=c['ground'][:2],
            reported_xy=c.get('reported',c['ground'][:2]),
            anchor_xy=(None if c.get('anchor_missing') else
                       c.get('forged_anchor',c['ground'][:2])),
            wind=c.get('wind',[0,0]),robust_clearance_m=new.worst_clearance_m))
    def counts(key):
        return {o:sum(1 for r in results if r[key]==o)
                for o in ('TP','TN','FP','FN')}
    return {'version':'0.5',
            'description':'fictional planar airspace; no real trust anchor',
            'case_count':len(results),
            'v04_counts_on_same_cases':counts('baseline_outcome'),
            'v05_counts':counts('v05_outcome'),
            'cases':results,
            'scope':'Hand-built synthetic cases, not flight safety evidence'}

if __name__=='__main__':
    out=run()
    Path(__file__).with_name('campaign_results_v05.json').write_text(
        json.dumps(out,indent=2)+'\n')
    print(json.dumps({k:out[k] for k in (
        'case_count','v04_counts_on_same_cases','v05_counts')},indent=2))
