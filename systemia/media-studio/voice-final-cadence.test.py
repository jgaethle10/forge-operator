import importlib.util,sys,tempfile,unittest
from pathlib import Path
import numpy as np,soundfile as sf
here=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('cadence',here/'voice-final-cadence.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class CadenceTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory()
  sr=24000;t=np.arange(round(3.36*sr))/sr
  hz=np.where(t<2.82,170.,np.where(t<=3.,170+(t-2.82)*150,197.))
  phase=np.cumsum(hz)/sr
  x=.12*np.sin(2*np.pi*phase)+.04*np.sin(4*np.pi*phase)
  self.src=Path(self.temp.name)/'src.wav';self.dst=Path(self.temp.name)/'out.wav'
  sf.write(self.src,x,sr,subtype='PCM_16')
  self.args=dict(pitch_start=2.82,pitch_end=3.,fade_start=2.7,fade_end=2.737,target_final_hz=140)
 def tearDown(self):self.temp.cleanup()
 def test_fall_and_preservation(self):
  receipt=mod.repair(self.src,self.dst,**self.args)
  a,sr=sf.read(self.src);b,_=sf.read(self.dst)
  self.assertTrue(np.array_equal(a[:int(sr*2.7)],b[:int(sr*2.7)]))
  self.assertLess(receipt['finalF0Hz'][1],receipt['finalF0Hz'][0])
  self.assertEqual(len(a),len(b))
  self.assertFalse(receipt['humanQualityApproved'])
  self.assertFalse(receipt['publicationAuthorized'])
 def test_invalid_bounds(self):
  with self.assertRaisesRegex(ValueError,'manual_bounds_invalid'):
   mod.repair(self.src,self.dst,**dict(self.args,fade_end=2.95))
  with self.assertRaisesRegex(ValueError,'target_not_falling'):
   mod.repair(self.src,self.dst,**dict(self.args,target_final_hz=300))
 def test_source_cannot_be_overwritten(self):
  with self.assertRaisesRegex(ValueError,'never_overwrite_source'):
   mod.repair(self.src,self.src,**self.args)
if __name__=='__main__':unittest.main()
