"""Source-original instrument regression gates, runnable in CI with actual WAVs."""
import importlib.util,json,os,sys,tempfile,unittest,zipfile
from pathlib import Path
import numpy as np
P=Path(__file__).with_name("last-light-v7-native-full-takes.py")
spec=importlib.util.spec_from_file_location("last_light_v7",P)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class TestActualOriginalStrings(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  path=os.environ.get("LL_V7_SOURCE_ZIP")
  if not path:raise unittest.SkipTest("actual recorded take ZIP not supplied")
  cls.source=Path(path)
  cls.bank,cls.proof=m.inspect_bank(cls.source)
  cls.stems,cls.events=m.stems(cls.bank)
 def test_three_original_samples_pinned_twice(self):
  self.assertEqual(len(self.bank),3)
  self.assertEqual(len(self.proof),3)
  self.assertEqual(len({x["source_sha256"] for x in self.proof}),3)
  self.assertTrue(all(x["rights"]=="CC0" for x in self.proof))
 def test_no_waveform_modification_not_even_recorded_tail(self):
  for key,when,gain in m.SCORE:
   x=self.bank[key];start=round(when*m.SR);part=m.TAKES[key]["part"]
   self.assertTrue(np.array_equal(self.stems[part][start:start+len(x)],x*gain))
 def test_untouched_bow_phrases_and_end_of_piano_protected(self):
  self.assertEqual(len(self.events),3)
  self.assertLess(max(x["start_seconds"]+x["full_recorded_length_s"] for x in self.events),32)
  self.assertTrue(all(x["no_trim"] and x["no_resample"] and x["no_synthetic_release"] for x in self.events))
 def test_no_unverified_replacement_accepted(self):
  with tempfile.TemporaryDirectory() as folder:
   target=Path(folder)/"tampered.zip"
   with zipfile.ZipFile(self.source) as source,zipfile.ZipFile(target,"w") as out:
    for name in source.namelist():
     b=source.read(name)
     if name.endswith("susvib_E3_v1_1.wav"):
      b=b[:-4]+bytes([b[-4]^1])+b[-3:]
     out.writestr(name,b)
   with self.assertRaisesRegex(ValueError,"source_hash_drift"):
    m.inspect_bank(target)
 def test_piano_only_open_and_close_against_stems(self):
  mock_piano=np.zeros((m.LENGTH*m.SR,2),dtype=np.float64)
  mock_piano[:,0]=.002
  for include_violin in (False,True):
   y=m.mix(mock_piano,self.stems,include_violin)
   self.assertTrue(np.array_equal(y[:int(8.8*m.SR)],mock_piano[:int(8.8*m.SR)]))
   self.assertTrue(np.array_equal(y[int(32*m.SR):],mock_piano[int(32*m.SR):]))
 def test_unavailable_canonical_original_piano_is_not_forged(self):
  with tempfile.TemporaryDirectory() as folder:
   receipts=m.render(self.source,folder)
   self.assertFalse(receipts["original_piano_present"])
   self.assertNotIn("The_Last_Light_Canonical_Piano_UNCHANGED.wav",receipts["output_sha256"])
   self.assertEqual(len(receipts["output_sha256"]),2)
 def test_piano_hash_is_bounded_to_founder_approved_binary(self):
  self.assertEqual(m.PIANO_SHA,"630efc0e8206ec7a6f4f0dac41634ab2a34da7f518f9f90be0b339b4e5a2015e")
  with tempfile.TemporaryDirectory() as folder:
   fake=Path(folder)/"any_other_piano.wav";fake.write_bytes(b"arbitrary")
   with self.assertRaisesRegex(ValueError,"protected_piano_byte_mismatch"):
    m.load_piano(fake)
if __name__=="__main__":unittest.main()
