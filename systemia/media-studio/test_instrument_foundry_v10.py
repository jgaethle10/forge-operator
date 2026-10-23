"""V10 instrument sample-bank admission tests with all twelve actual CC0 WAVs."""
import importlib.util,json,os,tempfile,unittest,zipfile
from pathlib import Path
import numpy as np
BASE=Path(__file__).parent
SPEC=importlib.util.spec_from_file_location("instrument_foundry_v10",BASE/"instrument-foundry-v10-build.py")
foundry=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(foundry)
class AuthenticSampledStrings(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  source=os.environ.get("LL_V10_SOURCE_ZIP")
  if not source:raise unittest.SkipTest("run against authentic source WAV ZIP, no fabricated fixtures")
  cls.source=Path(source)
  cls.manifest=json.loads(foundry.MANIFEST.read_text())
 def test_exactly_twelve_independent_recorded_dynamic_layers(self):
  self.assertEqual(len(self.manifest["files"]),12)
  triples={(r["instrument"],r["pitch"],r["dynamic"]) for r in self.manifest["files"]}
  self.assertEqual(len(triples),12)
  self.assertFalse(self.manifest["source_owned_by_evercraft"])
 def test_source_hashes_double_verified_and_all_native_44k_stereo(self):
  with zipfile.ZipFile(self.source) as z:
   for r in self.manifest["files"]:
    raw=z.read(r["filename"]);a=foundry.verify(raw,r)
    self.assertEqual(a.shape[1],2)
    self.assertTrue(np.isfinite(a).all())
 def test_source_tamper_refused(self):
  r=self.manifest["files"][0]
  with zipfile.ZipFile(self.source) as z:
   b=z.read(r["filename"])
  damaged=b[:300]+bytes([b[300]^0x3])+b[301:]
  with self.assertRaisesRegex(ValueError,"SOURCE_IDENTITY_DRIFT"):
   foundry.verify(damaged,r)
 def test_build_produces_auditable_sfz_and_unchanged_samples(self):
  with tempfile.TemporaryDirectory() as d:
   receipt=foundry.build(self.source,d)
   self.assertEqual(receipt["recorded_instruments"],2)
   self.assertEqual(receipt["recorded_velocity_layers_per_note"],2)
   self.assertFalse(receipt["genuine_performed_legato"])
   self.assertFalse(receipt["piano_mutated"])
   with zipfile.ZipFile(self.source) as z:
    for r in self.manifest["files"]:
     self.assertEqual((Path(d)/"samples"/r["filename"]).read_bytes(),z.read(r["filename"]))
   for part in ("Cello","Violin"):
    s=(Path(d)/f"Evercraft_V10_{part}_Acoustic_OneShot.sfz").read_text()
    self.assertEqual(s.count("<region>"),6)
    self.assertIn("loop_mode=one_shot",s)
    self.assertIn("amp_veltrack=0",s)
    self.assertIn("lovel=1 hivel=64",s)
    self.assertIn("lovel=65 hivel=127",s)
if __name__=="__main__":unittest.main()
