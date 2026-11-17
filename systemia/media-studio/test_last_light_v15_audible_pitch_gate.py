"""V15 auditory note identity: tests real recorded sound, not just SHA or labels."""
from __future__ import annotations
import copy,io,json,math,os,tempfile,unittest,importlib.util
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('v15',ROOT/'last-light-v15-audible-pitch-gate.py')
v15=importlib.util.module_from_spec(spec);spec.loader.exec_module(v15)

class PitchGateTests(unittest.TestCase):
 def test_heard_note_same_octave_is_admitted(self):
  self.assertEqual(v15.classify(v15.cents_between(440.,440.)),'PITCH_REGISTER_MATCH')
 def test_octave_higher_is_blocked(self):
  self.assertEqual(v15.classify(v15.cents_between(880.,440.)),'ONE_OCTAVE_ABOVE_SCORE')
 def test_octave_lower_is_blocked(self):
  self.assertEqual(v15.classify(v15.cents_between(220.,440.)),'ONE_OCTAVE_BELOW_SCORE')
 def test_any_unexplained_half_step_is_hold(self):
  self.assertEqual(v15.classify(v15.cents_between(440.*2**(1/12),440.)),'UNRESOLVED_PITCH_MISMATCH')
 def test_malformed_frequency_is_rejected(self):
  for frequency in (0.,-1.,float('nan'),float('inf')):
   with self.assertRaisesRegex(ValueError,'invalid_measured_frequency'):
    v15.cents_between(frequency,440.)
 def test_yin_440_hz_true_acoustic_test_fixture(self):
  t=np.arange(round(.45*v15.SR))/v15.SR
  synthetic=np.column_stack([.06*np.sin(2*math.pi*440*t)]*2)
  freq,mad,frames=v15.measured_note_frequency(synthetic)
  self.assertLess(abs(freq-440.),2.)
  self.assertGreater(frames,5)
 def test_yin_octave_anomaly_mock(self):
  t=np.arange(round(.45*v15.SR))/v15.SR
  synthetic=np.column_stack([.06*np.sin(2*math.pi*880*t)]*2)
  freq,_,_=v15.measured_note_frequency(synthetic)
  self.assertEqual(v15.classify(v15.cents_between(freq,440.)),'ONE_OCTAVE_ABOVE_SCORE')
 def test_short_pcm_rejected(self):
  with self.assertRaisesRegex(ValueError,'unusable_short_audio'):
   v15.measured_note_frequency(np.zeros((100,2)))
 def test_silent_pcm_rejected(self):
  with self.assertRaisesRegex(ValueError,'inaudible_recording'):
   v15.measured_note_frequency(np.zeros((int(.4*v15.SR),2)))
 def test_pins_refuse_audio_swaps(self):
  self.assertEqual(len(v15.PINNED),8)
  self.assertTrue(all(len(h)==64 for h in v15.PINNED.values()))

class RealRecordedPitchTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  path=os.environ.get('LL_V15_V14_SOURCE_ZIP')
  if not path:raise unittest.SkipTest('No original V14 artifact: only synthetic software tests can run')
  cls.source=Path(path)
  cls.report=v15.analyze(cls.source)
 def test_real_v14_pitch_gate_refuses_promotion(self):
  self.assertEqual(self.report['status'],'HOLD_PITCH_MISMATCH')
  self.assertEqual(self.report['tested_note_events'],17)
  self.assertEqual(self.report['tallies']['ONE_OCTAVE_ABOVE_SCORE'],16)
  self.assertEqual(self.report['tallies']['PITCH_REGISTER_MATCH'],1)
  self.assertEqual(self.report['tallies']['UNRESOLVED_PITCH_MISMATCH'],0)
 def test_real_v14_harp_exception(self):
  matched=[x for x in self.report['note_qa'] if x['pitch_status']=='PITCH_REGISTER_MATCH']
  self.assertEqual([(x['section'],x['score_pitch']) for x in matched],[('harp','D4')])
 def test_audit_writes_actual_report_not_corrected_sound(self):
  with tempfile.TemporaryDirectory() as d:
   report=v15.analyze(self.source,d)
   files={p.name for p in Path(d).iterdir()}
   self.assertEqual(files,{'DO_NOT_RELEASE.txt','V15_AUDIBLE_PITCH_HOLD.json','V15_AUDIBLE_PITCH_HOLD.csv'})
   self.assertFalse(report['source_audio_resampled_or_fixed'])
   self.assertFalse(report['automatic_release_approved'])

if __name__=='__main__':unittest.main()
