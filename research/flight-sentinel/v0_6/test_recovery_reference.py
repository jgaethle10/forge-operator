"""Offline-only regressions for the v0.6 reviewable reference subset."""
import unittest
import math
from recovery_reference import experiment, rollout, fallback_turn, clearance
from virtual_airframe import State

def c(x=500,y=500,turn=0,heading=0,speed=20,**kwargs):
    return dict(ground=[x,y,heading,speed],turn=turn,**kwargs)

class RecoveryReferenceTests(unittest.TestCase):
    def test_center_path(self):
        self.assertFalse(rollout(c()).crossed)
    def test_edge_crossing(self):
        self.assertTrue(rollout(c(x=830)).crossed)
    def test_clearance(self):
        self.assertEqual(clearance(State(500,500,0,20)),400)
    def test_turn_rate_bound(self):
        for heading in (0,math.pi/2,math.pi,-math.pi/2):
            self.assertIn(fallback_turn(State(800,500,heading,20),8),
                          (-.25,-.125,0,.125,.25))
    def test_switch_time_zero(self):
        self.assertEqual(rollout(c(x=830),"fallback",0).switch_s,0)
    def test_no_switch_with_eight_second_delay(self):
        self.assertIsNone(rollout(c(x=830),"fallback",8).switch_s)
    def test_bad_mode_rejected(self):
        with self.assertRaises(ValueError): rollout(c(),"aircraft")
    def test_invalid_delay_rejected(self):
        for value in (-1,float("nan"),True,"1"):
            with self.assertRaises(ValueError): rollout(c(),delay_s=value)
    def test_match_21_cases(self):
        r=experiment(1)
        self.assertEqual(r["case_count"],21)
        self.assertEqual(r["counts"],
            {"prevented":3,"unprevented":6,"introduced":1,"both_safe":11})
    def test_four_second_delay(self):
        self.assertEqual(experiment(4)["counts"],
            {"prevented":1,"unprevented":8,"introduced":0,"both_safe":12})
    def test_eight_second_delay(self):
        self.assertEqual(experiment(8)["counts"],
            {"prevented":0,"unprevented":9,"introduced":0,"both_safe":12})
    def test_wrong_pose_can_hurt(self):
        x=next(x for x in experiment()["cases"] if x["name"]=="false_alert_wrong_pose_can_hurt")
        self.assertTrue(x["alert"])
        self.assertEqual(x["outcome"],"introduced")
        self.assertFalse(x["before"]["crossed"])
        self.assertTrue(x["after"]["crossed"])
    def test_consistent_spoofing_still_missed(self):
        x=next(x for x in experiment()["cases"] if x["name"]=="all_three_sources_coherently_spoofed")
        self.assertFalse(x["alert"])
        self.assertTrue(x["after"]["crossed"])
    def test_no_ack_never_switches(self):
        r=experiment(ack=False)
        self.assertTrue(all(x["after"]["switch_s"] is None for x in r["cases"]))
        self.assertTrue(all(x["before"]["crossed"]==x["after"]["crossed"]
                            for x in r["cases"]))
    def test_false_alert_exists(self):
        self.assertTrue(any(x["alert"] and not x["before"]["crossed"]
                            for x in experiment()["cases"]))
    def test_deterministic(self):
        self.assertEqual(experiment(2),experiment(2))
    def test_sum(self):
        r=experiment(1)
        self.assertEqual(sum(r["counts"].values()),r["case_count"])

if __name__=="__main__": unittest.main()
