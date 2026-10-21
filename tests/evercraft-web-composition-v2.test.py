import pathlib,importlib.util,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
P=ROOT/'systemia/clip/evercraft-web-composition-v2.py'
spec=importlib.util.spec_from_file_location('evercraft_cue',P)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class CompositionContract(unittest.TestCase):
 def test_change_in_harmony_and_tempo(self):
  self.assertEqual(len(m.HARMONY),8)
  self.assertGreaterEqual(len(set(m.HARMONY)),6)
  self.assertEqual(len(set(m.BPM)),6)
  self.assertTrue(25<m.DURATION<31)
 def test_accompaniment_does_not_repeat_same_rhythm_each_measure(self):
  self.assertEqual(len(m.PATTERNS),8)
  shapes={tuple(round(x[0],2) for x in part) for part in m.PATTERNS}
  self.assertEqual(len(shapes),8)
 def test_real_counterpoint_not_sustained_chord_roots(self):
  self.assertGreater(len(m.MELODY),24)
  self.assertGreater(len(m.CELLO),8)
  self.assertTrue(all(0<=x[0]<32 for x in m.MELODY))
  self.assertTrue(m.CELLO[0][0]>8)
  self.assertEqual(len({x[1] for x in m.CELLO})>=5,True)
 def test_pinned_sources_and_no_release_claim(self):
  text=P.read_text()
  self.assertIn('P.SOURCE_SHA',text)
  self.assertIn('C.CELLO_REV',text)
  self.assertIn("'human_music_approval':False",text)
  self.assertIn("'commercial_release':False",text)
if __name__=='__main__': unittest.main()
