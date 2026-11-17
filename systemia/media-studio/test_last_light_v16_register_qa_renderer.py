"""V16 source-registry and musical-pitch tests. Fixtures are synthetics, not proof."""
from __future__ import annotations
import copy,hashlib,io,importlib.util,json,math,tempfile,unittest,zipfile
from pathlib import Path
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('v16',ROOT/'last-light-v16-register-qa-renderer.py')
v16=importlib.util.module_from_spec(s);s.loader.exec_module(v16)
SCORE=json.loads((ROOT/'last-light-v9-conductor-score.json').read_text())
PINS=json.loads((ROOT/'last-light-v16-register-correction-source-pins.json').read_text())

class RegisteredPitchGates(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory()
  cls.fixture=copy.deepcopy(PINS)
  cls.path=Path(cls.tmp.name)/'synthetic_source_frequencies_not_actual_music.zip'
  t=np.arange(6*v16.SR)/v16.SR
  with zipfile.ZipFile(cls.path,'w',compression=zipfile.ZIP_STORED) as z:
   for item in cls.fixture['source_map']:
    pitchHz=v16.hz(item['source_label'])*(1 if item['role']=='harp' else 2)
    # Original mock sources mimic the actual observed VSCO octave naming difference.
    wave=.055*np.sin(2*math.pi*pitchHz*t)*(1-np.exp(-17*t))
    stereo=np.column_stack([wave,wave*.93])
    buf=io.BytesIO();sf.write(buf,stereo,v16.SR,format='WAV',subtype='PCM_16')
    b=buf.getvalue()
    item['size_bytes']=len(b);item['git_blob_sha1']=v16.gitblob(b)
    z.writestr(Path(item['path']).name,b)
  cls.source,cls.source_hashes=v16.read_recorded_sources(cls.path,cls.fixture)
 @classmethod
 def tearDownClass(cls):cls.tmp.cleanup()

 def test_pinned_real_library_scientific_pitch_map_is_valid(self):
  mapping=v16.validate(SCORE,PINS)
  self.assertEqual(len(mapping),12)
  self.assertEqual(sum(e['semitone_shift']==0 for e in mapping.values()),4)
 def test_no_octave_speed_adjustment_is_allowed(self):
  broken=copy.deepcopy(PINS);broken['source_map'][0]['semitone_shift']=12
  with self.assertRaisesRegex(ValueError,'unsafe_pitch_shift_limit'):
   v16.validate(SCORE,broken)
 def test_wrong_source_note_relation_refused(self):
  broken=copy.deepcopy(PINS);broken['source_map'][0]['semitone_shift']=0
  with self.assertRaisesRegex(ValueError,'mathematically_incorrect'):
   v16.validate(SCORE,broken)
 def test_canonical_piano_digest_is_nonnegotiable(self):
  changed=copy.deepcopy(SCORE);changed['protected_piano_sha256']='0'*64
  with self.assertRaisesRegex(ValueError,'canonical_piano_hash_drift'):v16.validate(changed,PINS)
 def test_real_source_rights_not_claimed(self):
  changed=copy.deepcopy(PINS);changed['exclusive_rights_claimed']=True
  with self.assertRaisesRegex(ValueError,'source_custody_policy_failed'):
   v16.validate(SCORE,changed)
 def test_all_twelve_raw_samples_have_valid_stereo_and_file_identity(self):
  self.assertEqual(len(self.source),12)
  self.assertTrue(all(len(x)==64 for x in self.source_hashes.values()))
 def test_original_audio_tamper_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   dst=Path(d)/'corrupt.zip'
   with zipfile.ZipFile(self.path) as src,zipfile.ZipFile(dst,'w') as target:
    for i,name in enumerate(src.namelist()):
     b=src.read(name)
     if i==0:b=b[:-1]+bytes([b[-1]^1])
     target.writestr(name,b)
   with self.assertRaisesRegex(ValueError,'original_source_digest_mismatch'):
    v16.read_recorded_sources(dst,self.fixture)
 def test_actual_heard_root_measured_before_playback_shift(self):
  item=self.fixture['source_map'][0]
  audio=self.source[(item['role'],item['score_pitch'])]
  actual,onset,cents=v16.measure_onset_and_register(audio,item)
  self.assertLess(abs(cents),20.)
  self.assertGreater(actual,100.)
 def test_corrected_real_audio_pitch_is_measured_after_shift(self):
  for key in [('cello','E3'),('violin_section','B4'),('double_bass','E2'),('harp','D4')]:
   item=next(x for x in self.fixture['source_map'] if (x['role'],x['score_pitch'])==key)
   shifted=v16.bounded_pitch_correction(self.source[key],item['semitone_shift'])
   frequency,onset,cents=v16.verify_corrected_pitch(shifted,item['score_pitch'],item['semitone_shift'])
   self.assertLess(abs(cents),20.)
 def test_gainonly_source_stays_original_for_no_shift(self):
  item=next(x for x in self.fixture['source_map'] if x['role']=='flute')
  wave=self.source[(item['role'],item['score_pitch'])]
  self.assertTrue(np.array_equal(v16.bounded_pitch_correction(wave,0),wave))
 def test_acoustic_render_creates_eight_verified_stems_with_17_events(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);score=root/'score.json';manifest=root/'pins.json'
   score.write_text(json.dumps(SCORE));manifest.write_text(json.dumps(self.fixture))
   receipt=v16.render(score,manifest,self.path,root/'out')
   self.assertEqual(receipt['status'],'AUDIBLE_PITCH_GATE_PASSED_ARTISTIC_HOLD')
   self.assertEqual((receipt['sample_based_events'],receipt['held_score_events']), (17,30))
   self.assertEqual(receipt['source_mappings_audibly_verified'],12)
   self.assertEqual(len(receipt['output_sha256']),11)
   self.assertFalse(receipt['human_listening_approved'])
 def test_approved_piano_unavailable_and_unaltered(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);score=root/'score.json';manifest=root/'pins.json'
   score.write_text(json.dumps(SCORE));manifest.write_text(json.dumps(self.fixture))
   receipt=v16.render(score,manifest,self.path,root/'out')
   self.assertFalse(receipt['canonical_piano_imported'])
   self.assertFalse(receipt['canonical_piano_mutated'])
   self.assertFalse(receipt['performed_true_legato'])
   self.assertFalse(receipt['actual_musicians_played_the_score'])
   for f,h in receipt['output_sha256'].items():
    self.assertEqual(v16.sha((root/'out'/f).read_bytes()),h)
 def test_raw_same_pitch_not_described_as_transposition(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);score=root/'score.json';manifest=root/'pins.json'
   score.write_text(json.dumps(SCORE));manifest.write_text(json.dumps(self.fixture))
   receipt=v16.render(score,manifest,self.path,root/'out')
   native=[x for x in receipt['accepted_note_events'] if x['pitch_shift_semitones']==0]
   shifted=[x for x in receipt['accepted_note_events'] if x['pitch_shift_semitones']>0]
   self.assertEqual((len(native),len(shifted)),(5,12))
 def test_intro_and_outro_hold_silence_against_piano(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);score=root/'score.json';manifest=root/'pins.json'
   score.write_text(json.dumps(SCORE));manifest.write_text(json.dumps(self.fixture))
   receipt=v16.render(score,manifest,self.path,root/'out')
   for wav in receipt['output_sha256']:
    a,sr=sf.read(root/'out'/wav,always_2d=True)
    self.assertFalse(np.any(a[:round(8.8*v16.SR)]))
    self.assertFalse(np.any(a[round(31*v16.SR):]))

if __name__=='__main__':unittest.main()
