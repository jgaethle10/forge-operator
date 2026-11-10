import unittest
import numpy as np
import importlib.util
from pathlib import Path
path=Path(__file__).with_name('recorded-steinway-pilot.py')
spec=importlib.util.spec_from_file_location('recorded_piano_pilot',path)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PianoPilotTest(unittest.TestCase):
 def test_original_phrase_structure_has_no_four_bar_loop(self):
  self.assertEqual(len(m.EVENTS),25)
  self.assertNotEqual(m.EVENTS[:5],m.EVENTS[5:10])
 def test_credited_source_and_safe_url(self):
  self.assertIn('theremin.music.uiowa.edu',m.sample_url('pp','Eb4'))
  with self.assertRaises(ValueError):m.sample_url('../','C4')
 def test_pcm_and_natural_release_with_finite_headroom(self):
  fake=np.zeros((m.FS*3,2),dtype=np.float32)
  fake[:m.FS,:]=np.sin(np.arange(m.FS,dtype=np.float32)*2*np.pi*220/m.FS)[:,None]*.12
  bank={(layer,pitch):fake for _,pitch,layer,*_ in m.EVENTS}
  pcm,receipt=m.render(bank)
  self.assertEqual(pcm.shape,(m.FS*29,2))
  self.assertTrue(np.isfinite(pcm).all())
  self.assertLessEqual(np.max(np.abs(pcm)),.89)
  self.assertEqual(len(receipt['events']),25)
  self.assertEqual(np.max(np.abs(pcm[-200:])),0)
 def test_missing_real_source_fails_closed(self):
  with self.assertRaises(KeyError):m.render({})
 def test_invalid_gain_refused(self):
  with self.assertRaises(ValueError):m.render({},events=[(0,'E4','pp',3,1,0)])
if __name__=='__main__':unittest.main()
