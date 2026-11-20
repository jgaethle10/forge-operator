import unittest,copy
from server import SCHEMA,validate_state,validate_airframe
BASE={'schema':'evercraft.aaar.airframe-design.v1','name':'Cedar Sparrow','type':'rotor','massKg':2.4,
'spanM':1.1,'chordM':.35,'sweepDeg':5,'bodyLengthM':.7,'bodyWidthM':.32,'tailAreaM2':0,
'cgFraction':.28,'thrustN':3200,'cd0':.038,'clMax':1.35,'rotors':4,'rotorRadiusM':.23,'totalPowerW':900}
def payload(d):
 return {'schema':SCHEMA,'programs':[],'history':[],'experiments':[{'schema':'evercraft.aaar.worlds-flight.v1',
 'id':'AAAR-WFL-SAMPLE','created_at':'2026-11-20T01:00:00Z','model_state':'GAME_SIMULATION_ONLY',
 'evidence_state':'UNVALIDATED_GAMEPLAY','canonical_sync':'local_preview_only',
 'world':'anniston-cedar-basin-synthetic-v1','aircraft':'custom','design':d,
 'flight_time_seconds':12,'distance_m':15,'max_altitude_m':90,'max_speed_mps':5,'checkpoints':0,
 'events':[],'track':[]}]}
class FoundryContractTests(unittest.TestCase):
 def test_clean_record(self):self.assertEqual(validate_state(payload(copy.deepcopy(BASE)))['experiments'][0]['design']['name'],'Cedar Sparrow')
 def test_certification_rejected(self):
  d=payload(BASE);d['experiments'][0]['evidence_state']='CERTIFIED'
  with self.assertRaises(ValueError):validate_state(d)
 def test_extra_commands_rejected(self):
  with self.assertRaises(ValueError):validate_state(payload({**BASE,'hardwareCommand':'arm'}))
 def test_nan_and_unbounded_power_rejected(self):
  for d in [{**BASE,'massKg':float('nan')},{**BASE,'totalPowerW':2e10}]:
   with self.assertRaises(ValueError):validate_airframe(d)
 def test_missing_blueprint_rejected(self):
  with self.assertRaises(ValueError):validate_state(payload(None))
if __name__=='__main__':unittest.main()
