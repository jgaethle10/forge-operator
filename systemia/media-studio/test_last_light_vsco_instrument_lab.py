import importlib.util,io,unittest
from pathlib import Path
import numpy as np
import soundfile as sf
PATH=Path(__file__).with_name("last-light-vsco-instrument-lab.py")
spec=importlib.util.spec_from_file_location("last_light_vsco_instrument_lab",PATH)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class InstrumentBankSafety(unittest.TestCase):
 def setUp(self):
  self.short=np.full((int(5*m.SR),2),.016,dtype=np.float64)
  self.bank={(part,root,layer):self.short for part,s in m.SOURCES.items()
     for root in s["layers"] for layer in ("soft","strong")}
 def test_explicit_two_real_dynamic_layers_and_source_provenance(self):
  self.assertEqual(len(self.bank),12)
  ids=[hash_value for s in m.SOURCES.values() for l in s["layers"].values() for hash_value in l.values()]
  self.assertEqual(len(set(ids)),12)
  self.assertTrue(all(len(x)==40 for x in ids))
  self.assertEqual(m.source_filename("cello","C3","strong"),"susvib_C3_v3_1.wav")
  self.assertEqual(m.source_filename("violin","G4","soft"),"LLVln_ArcoVib_G4_p.wav")
 def test_source_identity_cannot_be_laundered(self):
  good=b"RIFF"+b"\0"*120
  self.assertNotEqual(m.git_blob_sha(good),m.SOURCES["cello"]["layers"]["C3"]["soft"])
  self.assertNotEqual(m.git_blob_sha(good+b"!"),m.git_blob_sha(good))
 def test_nearest_zone_and_missing_range(self):
  clip,root,layer,interval=m.choose(self.bank,"cello","F3",.32)
  self.assertEqual(root,"E3")
  self.assertEqual(layer,"soft")
  self.assertEqual(interval,1)
  clip,root,layer,interval=m.choose(self.bank,"violin","B4",.7)
  self.assertEqual(root,"C5")
  self.assertEqual(layer,"strong")
  self.assertEqual(interval,-1)
  with self.assertRaisesRegex(ValueError,"coverage_missing"):m.choose(self.bank,"cello","E6",.3)
 def test_real_source_duration_and_note_release(self):
  result,g=m.rendered_note(self.short,"cello",1.6,.44,0)
  self.assertEqual(result.shape[1],2)
  self.assertTrue(np.isfinite(result).all())
  self.assertAlmostEqual(float(result[-1,0]),0,places=7)
  self.assertGreater(float(np.max(abs(result))),0)
  with self.assertRaisesRegex(ValueError,"source_too_short"):m.rendered_note(self.short[:m.SR],"cello",2.5,.4,0)
 def test_original_piano_held_exact_in_open_and_close(self):
  p=np.zeros((int(35*m.SR),2),dtype=np.float32)
  p+=.012
  part={"cello":np.zeros_like(p),"violin":np.zeros_like(p)}
  part["cello"][int(9*m.SR):int(28*m.SR)]=.001
  variants=m.mix(p,part)
  self.assertEqual(set(variants),{"cello_focus","duet"})
  for clip,strength in variants.values():
   self.assertTrue(np.array_equal(p[:int(7.5*m.SR)],clip[:int(7.5*m.SR)]))
   self.assertTrue(np.array_equal(p[int(32*m.SR):],clip[int(32*m.SR):]))
   self.assertLessEqual(float(np.max(abs(clip))),.94)
 def test_voice_output_independence(self):
  stems,receipts=m.voices(self.bank)
  self.assertEqual(set(stems),{"cello","violin"})
  self.assertEqual(len(receipts),13)
  self.assertTrue(all(-2<=r["semitones"]<=2 for r in receipts))
  self.assertTrue(all(np.isfinite(x).all() for x in stems.values()))
if __name__=="__main__":unittest.main()
