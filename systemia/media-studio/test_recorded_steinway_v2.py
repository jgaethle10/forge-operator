import importlib.util
import json
import os
from pathlib import Path
import unittest
import numpy as np

MODULE_PATH=Path(__file__).with_name('recorded-steinway-phrasing-v2.py')
spec=importlib.util.spec_from_file_location('recorded_steinway_v2',MODULE_PATH)
music=importlib.util.module_from_spec(spec)
spec.loader.exec_module(music)

class ActualSteinwayQualityGates(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  source=os.environ.get('IOWA_SOURCE_DIR')
  original=os.environ.get('IOWA_ORIGINAL_RECEIPT')
  if not source or not original:
   raise RuntimeError('actual recorded source and original source receipt required')
  cls.bank,cls.report=music.inspect_sources(Path(source),json.loads(Path(original).read_text()))
 def test_every_used_source_has_independently_pinned_hash(self):
  self.assertEqual(len(self.report),12)
  self.assertEqual(len(music.SOURCE_SHA256),12)
  self.assertNotIn('Piano.pp.A4.aiff',self.report)
  self.assertTrue(all(v['source_noise_margin_db']>=18 for v in self.report.values()))
 def test_recorded_onsets_are_aligned_not_synthesized(self):
  self.assertTrue(all(150<r['source_onset_trim_ms']<700 for r in self.report.values()))
 def test_composition_no_looping_four_chord_pattern(self):
  self.assertEqual(len(music.EVENTS),31)
  self.assertNotEqual(music.EVENTS[:6],music.EVENTS[8:14])
  self.assertIn('apex',[event[6] for event in music.EVENTS])
 def test_real_stereo_audio_has_headroom_and_a_natural_end(self):
  audio,receipt=music.render(self.bank,self.report)
  self.assertEqual(audio.shape,(1543500,2))
  self.assertTrue(np.isfinite(audio).all())
  self.assertLessEqual(np.max(np.abs(audio)),.84)
  self.assertLess(np.max(np.abs(audio[-1000:])),1e-3)
  self.assertGreater(receipt['peak_after'],0)
 def test_no_substitute_for_a_missing_acoustic_note(self):
  with self.assertRaisesRegex(ValueError,'missing_actual_note_recording'):
   music.render({},self.report)

if __name__=='__main__':unittest.main()
