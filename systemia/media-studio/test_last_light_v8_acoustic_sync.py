"""V8 tests against three real source recordings fetched and SHA-pinned by CI."""
import importlib.util, os, tempfile, unittest
from pathlib import Path
import numpy as np
import soundfile as sf

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("last_light_v8",HERE/"last-light-v8-acoustic-sync.py")
v8=importlib.util.module_from_spec(spec);spec.loader.exec_module(v8)
v7=v8.v7

class FirstRiseSourceRegression(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  source=os.environ.get("LL_V7_SOURCE_ZIP")
  if not source:raise unittest.SkipTest("CI sample ZIP with authentic SHA-pinned WAVs required")
  cls.bank,cls.sources=v7.inspect_bank(source)
 def test_three_original_recordings_pass_existing_dual_hash_gates(self):
  self.assertEqual(len(self.sources),3)
  self.assertEqual({r["source_sha256"] for r in self.sources},
                   {i["sha256"] for i in v7.TAKES.values()})
 def test_first_rise_both_instruments_coincide_with_piano_within_20ms(self):
  score=v8.scored_placement(self.bank,"together_at_first_rise")
  for key in ("cello_G3","violin_G4"):
   t=next(t for k,t,g in score if k==key)
   onset=t+v8.natural_attack_seconds(self.bank[key])
   self.assertLess(abs(onset-17.6),.020)
 def test_staggered_variant_aligns_cello_to_piano_1940(self):
  score=v8.scored_placement(self.bank,"staggered_at_peak")
  t=next(t for k,t,g in score if k=="cello_G3")
  self.assertLess(abs(t+v8.natural_attack_seconds(self.bank["cello_G3"])-19.4),.015)
 def test_no_sample_trim_or_stretch_or_pitch_change(self):
  score=v8.scored_placement(self.bank)
  outputs,events=v8.source_native_stems(self.bank,score)
  for key,t,gain in score:
   x=self.bank[key];part=v7.TAKES[key]["part"];start=round(t*v7.SR)
   # Cellos overlap during the first lift, so compare each raw contribution
   # by rendering just this one event.
   part_only,_=v8.source_native_stems(self.bank,[(key,t,gain)])
   self.assertTrue(np.array_equal(part_only[part][start:start+len(x)],x*gain))
   self.assertLess(t+len(x)/v7.SR,32)
  self.assertEqual(len(events),3)
 def test_original_v7_order_and_timing_not_changed(self):
  self.assertEqual(v7.SCORE[1][1],19.28)
  self.assertEqual(v7.SCORE[2][1],17.04)
 def test_mix_does_not_modify_piano_intro_or_outro(self):
  score=v8.scored_placement(self.bank)
  stems,_=v8.source_native_stems(self.bank,score)
  reference=np.zeros((35*v7.SR,2),dtype=np.float64)
  reference[:,0]=.007
  mix=v7.mix(reference,stems,True)
  self.assertTrue(np.array_equal(mix[:int(8.8*v7.SR)],reference[:int(8.8*v7.SR)]))
  self.assertTrue(np.array_equal(mix[int(32*v7.SR):],reference[int(32*v7.SR):]))
  self.assertLess(np.max(abs(mix)),.95)
 def test_unknown_variant_fails_closed(self):
  with self.assertRaisesRegex(ValueError,"unknown_sync_variant"):
   v8.scored_placement(self.bank,"almost_good")
 def test_cannot_claim_piano_from_absent_source(self):
  with tempfile.TemporaryDirectory() as d:
   receipt=v8.render(os.environ["LL_V7_SOURCE_ZIP"],d)
   self.assertFalse(receipt["piano_recreated"])
   self.assertFalse(receipt["human_approval"])
   self.assertNotIn("CANONICAL_PIANO_NEVER_MODIFIED.wav",receipt["output_sha256"])
   self.assertEqual(len(receipt["output_sha256"]),4)

if __name__=="__main__":unittest.main()
