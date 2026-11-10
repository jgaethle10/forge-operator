import math
import random
import unittest
from virtual_airframe import FlightGate, Proposal, Reading, State, propagate
from benchmark_v04 import cases, proposal_for, run, independent_truth_hazard


def sample(x=500,y=500,heading=0,speed=20,turn=0,seq=1,at=1000,
           off=(0,0),roots=('root-a','root-b')):
    a=Reading('a',roots[0],x,y,at)
    b=Reading('b',roots[1],x+off[0],y+off[1],at)
    return Proposal(seq,at,heading,speed,turn,(a,b))


class DynamicsTests(unittest.TestCase):
    def test_forward(self):
        s=propagate(State(0,0,0,20),0,2)
        self.assertAlmostEqual(s.x_m,40)
        self.assertAlmostEqual(s.y_m,0)

    def test_curved_arc(self):
        s=propagate(State(0,0,0,20),.2,2)
        self.assertAlmostEqual(s.x_m,20/.2*math.sin(.4))
        self.assertAlmostEqual(s.y_m,20/.2*(1-math.cos(.4)))

    def test_wind_in_truth(self):
        s=propagate(State(0,0,0,20),0,2,(4,0))
        self.assertAlmostEqual(s.x_m,48)

    def test_independent_oracle_agrees_on_nominal(self):
        for s in [State(500,500,0,20),State(830,500,0,20)]:
            hazard,_=independent_truth_hazard(s,0)
            self.assertEqual(hazard,s.x_m+160>900)


class GateTests(unittest.TestCase):
    def test_center_allowed(self):
        self.assertTrue(FlightGate().evaluate(sample(),1000).allowed)

    def test_edge_denied(self):
        d=FlightGate().evaluate(sample(x=835),1000)
        self.assertIn('FORECAST_CORRIDOR_BREACH',d.reasons)

    def test_latched_even_after_safe_sample(self):
        g=FlightGate();g.evaluate(sample(x=835),1000)
        self.assertIn('INTERLOCK_LATCHED',g.evaluate(sample(seq=2,at=1001),1001).reasons)

    def test_source_disagreement(self):
        d=FlightGate().evaluate(sample(off=(20,0)),1000)
        self.assertIn('SENSOR_DISAGREEMENT',d.reasons)

    def test_claimed_common_root(self):
        d=FlightGate().evaluate(sample(roots=('same','same')),1000)
        self.assertIn('DUPLICATE_CLAIMED_PROVENANCE',d.reasons)

    def test_stale_sensor(self):
        d=FlightGate().evaluate(sample(),1001)
        self.assertIn('SENSOR_FRESHNESS',d.reasons)

    def test_sensor_future(self):
        d=FlightGate().evaluate(sample(),999)
        self.assertIn('SENSOR_FRESHNESS',d.reasons)

    def test_replay(self):
        g=FlightGate();g.evaluate(sample(),1000)
        self.assertIn('REPLAY_OR_GAP',g.evaluate(sample(),1000).reasons)

    def test_position_jump(self):
        g=FlightGate();g.evaluate(sample(),1000)
        d=g.evaluate(sample(x=600,seq=2,at=1001),1001)
        self.assertIn('IMPLAUSIBLE_TRANSLATION',d.reasons)

    def test_nan_inf_bool_rejected(self):
        for v in [math.nan,math.inf,-math.inf,True]:
            self.assertFalse(FlightGate().evaluate(sample(x=v),1000).allowed)
            self.assertFalse(FlightGate().evaluate(sample(turn=v),1000).allowed)

    def test_missing_reading_denied(self):
        p=sample();p=Proposal(p.sequence,p.timestamp_s,p.heading_rad,p.speed_m_s,p.turn_rad_s,(p.readings[0],))
        self.assertIn('INVALID_SENSOR_SET',FlightGate().evaluate(p,1000).reasons)

    def test_instant_envelope(self):
        self.assertIn('COMMAND_ENVELOPE',FlightGate().evaluate(sample(turn=.3),1000).reasons)
        self.assertIn('COMMAND_ENVELOPE',FlightGate().evaluate(sample(speed=50),1000).reasons)

    def test_unknown_object_denied(self):
        self.assertIn('INVALID_PROPOSAL',FlightGate().evaluate({},1000).reasons)

    def test_random_forecast_outward(self):
        rng=random.Random(20261109)
        for _ in range(1000):
            x=rng.uniform(760,870)
            d=FlightGate().evaluate(sample(x=x,heading=0,turn=0),1000)
            self.assertFalse(d.allowed)


class CampaignTests(unittest.TestCase):
    def test_distinguishes_truth_from_claimed_sensors(self):
        out=run()
        missed={r['name'] for r in out['cases'] if r['outcome']=='FN'}
        self.assertIn('two_consistent_spoofed_sources',missed)
        self.assertIn('unmodeled_strong_wind',missed)

    def test_counts_all_cases(self):
        out=run()
        self.assertEqual(sum(out['counts'].values()),len(cases()))

    def test_preemptive_block_lead_time(self):
        out=run()['advance_warning']
        self.assertIsNotNone(out['first_symbolic_block_s'])
        self.assertGreater(out['simulated_lead_time_s'],0)


if __name__=='__main__':
    unittest.main()
