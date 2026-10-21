import importlib.util, pathlib,unittest
P=pathlib.Path(__file__).resolve().parents[1]/"systemia/clip/evercraft-web-recorded-cello-audition.py"
spec=importlib.util.spec_from_file_location("audition",P)
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class CheckRecordedCello(unittest.TestCase):
 def test_reuse_exact_user_preferred_piano(self):
  self.assertEqual(a.EXPECTED_PIANO["close"],"43682c9b950379b74bcddf97420cd6f815f97b6d4169ac697229083f346d1bdb")
  self.assertEqual(a.EXPECTED_PIANO["room"],"367d937ad6fc2183d55b133a4ae4667fc67fe083dfd3f68373ba36afc21c7400")
 def test_real_cc0_samples_and_few_human_scale_phrases(self):
  self.assertEqual(len(a.CELLO_NOTES),5)
  self.assertTrue(all(n[1].endswith(".wav") and n[3]>35 and n[4]<3 for n in a.CELLO_NOTES))
  self.assertIn("sfzinstruments/karoryfer-bigcat.cello",a.CELLO_BASE)
 def test_no_synthesizer_or_synthetic_string_orchestrator(self):
  s=P.read_text().lower()
  for banned in ("timgm","fluid_synth","soundfont", "fake_strings", "waveform_generator","loudnorm"):
   self.assertNotIn(banned,s)
  self.assertIn("human_listening_approval",s)
  self.assertIn("production_release_authority",s)
if __name__=="__main__":unittest.main()
