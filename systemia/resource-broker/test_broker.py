import importlib.util
import pathlib
import unittest

spec=importlib.util.spec_from_file_location("broker",pathlib.Path(__file__).with_name("broker.py"))
broker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(broker)
JOB={"kind":"render","estimated_hours":"2","max_hourly_usd":"0.75","max_estimated_compute_usd":"1.50","min_vram_gb":"20","min_ram_gb":"32"}
OFFERS=[{"provider":"vast","id":"high","available":True,"verified":True,"hourly_usd":"0.8","vram_gb":24,"ram_gb":64},
        {"provider":"evercraft-owned","id":"local","available":True,"verified":True,"hourly_usd":"0.2","vram_gb":24,"ram_gb":64},
        {"provider":"vast","id":"cheap","available":True,"verified":False,"hourly_usd":"0.1","vram_gb":24,"ram_gb":64}]
class Tests(unittest.TestCase):
    def test_prefers_eligible_cheapest(self):
        p=broker.plan(JOB,OFFERS)
        self.assertEqual(p["candidate"]["id"],"local")
        self.assertFalse(p["provisioning_authorized"])
        self.assertFalse(p["execution_performed"])
    def test_no_capacity(self):
        self.assertEqual(broker.plan(JOB,[])["status"],"NO_ELIGIBLE_CAPACITY")
    def test_reject_invalid_hours(self):
        with self.assertRaises(ValueError): broker.plan({**JOB,"estimated_hours":"NaN"},OFFERS)
    def test_reject_unapproved_provider(self):
        p=broker.plan(JOB,[{**OFFERS[1],"provider":"unknown"}])
        self.assertIsNone(p["candidate"])
    def test_budget_reject(self):
        self.assertIsNone(broker.plan({**JOB,"max_estimated_compute_usd":"0.01"},OFFERS)["candidate"])
if __name__=="__main__": unittest.main()
