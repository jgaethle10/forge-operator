"""V14 tests: SYNTHETIC fixtures for software safety, NOT musical proof."""
from __future__ import annotations
import copy,io,importlib.util,json,math,tempfile,unittest,zipfile
from pathlib import Path
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parent
p=importlib.util.spec_from_file_location('v14',ROOT/'last-light-v14-real-section-audition.py')
v14=importlib.util.module_from_spec(p);p.loader.exec_module(v14)
SCORE=json.loads((ROOT/'last-light-v9-conductor-score.json').read_text())
REAL=json.loads((ROOT/'last-light-v14-verified-section-source-pins.json').read_text())

class V14SourceGates(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.temp=tempfile.TemporaryDirectory()
  cls.manifest=copy.deepcopy(REAL)
  cls.archive=Path(cls.temp.name)/'synthetic_fixture_only.zip'
  sample_len=round(6.0*v14.SR)
  t=np.arange(sample_len)/v14.SR
  with zipfile.ZipFile(cls.archive,'w',compression=zipfile.ZIP_STORED) as z:
   for index,entry in enumerate(cls.manifest['sample_files']):
    wave=.055*np.sin(2*math.pi*(90+18*index)*t)*(1-np.exp(-25*t))
    stereo=np.column_stack([wave,wave*.95])
    buf=io.BytesIO()
    sf.write(buf,stereo,v14.SR,format='WAV',subtype='PCM_16')
    blob=buf.getvalue()
    entry['git_blob_sha1']=v14.gitblob(blob)
    entry['size_bytes']=len(blob)
    z.writestr(Path(entry['path']).name,blob)
  cls.audio,cls.receipts=v14.inspect_sources(cls.archive,cls.manifest)
 @classmethod
 def tearDownClass(cls):cls.temp.cleanup()

 def test_fourteen_score_sections_and_preserved_piano_hash(self):
  v14.validate_score(SCORE)
  self.assertEqual(SCORE['protected_piano_sha256'],v14.PIANO_SHA)
 def test_exact_native_pitch_plan_is_seventeen_notes(self):
  rows,held=v14.plan(SCORE,v14.validate_manifest(REAL))
  self.assertEqual((len(rows),len(held)),(17,30))
  self.assertEqual({x['section'] for x in rows},set(v14.ROLE))
 def test_manifest_pin_has_fixed_upstream_revision(self):
  self.assertEqual(REAL['source_commit_sha'],v14.UPSTREAM_PIN)
  self.assertEqual(len(v14.validate_manifest(REAL)),12)
 def test_no_upstream_identity_drift_allowed(self):
  bad=copy.deepcopy(REAL);bad['source_commit_sha']='0'*40
  with self.assertRaisesRegex(ValueError,'manifest_admission_failed'):v14.validate_manifest(bad)
 def test_source_rights_approval_not_invented(self):
  for k in ('source_recordings_evercraft_exclusively_owned','recordings_human_listening_approved','live_performed_legato','artistic_ensemble_approved'):
   bad=copy.deepcopy(REAL);bad[k]=True
   with self.assertRaisesRegex(ValueError,'manifest_admission_failed'):v14.validate_manifest(bad)
 def test_missing_or_duplicate_recording_refused(self):
  with tempfile.TemporaryDirectory() as temp:
   missing=Path(temp)/'missing.zip'
   with zipfile.ZipFile(self.archive) as src,zipfile.ZipFile(missing,'w') as dst:
    for name in src.namelist()[1:]:dst.writestr(name,src.read(name))
   with self.assertRaisesRegex(ValueError,'source_zip_missing_extra'):v14.inspect_sources(missing,self.manifest)
 def test_tampered_original_recording_refused(self):
  with tempfile.TemporaryDirectory() as temp:
   corrupted=Path(temp)/'corrupt.zip'
   with zipfile.ZipFile(self.archive) as src,zipfile.ZipFile(corrupted,'w') as dst:
    for j,name in enumerate(src.namelist()):
     blob=src.read(name)
     dst.writestr(name,blob if j else blob[:-1]+bytes([blob[-1]^1]))
   with self.assertRaisesRegex(ValueError,'pinned_original_git_blob_drift'):v14.inspect_sources(corrupted,self.manifest)
 def test_all_sources_verified_as_decodable_stereo(self):
  self.assertEqual(len(self.audio),12)
  self.assertTrue(all(r['verified_original_sha256'] for r in self.receipts))
 def test_reject_false_piano_identity(self):
  altered=copy.deepcopy(SCORE);altered['protected_piano_sha256']='0'*64
  with self.assertRaisesRegex(ValueError,'protected_piano_identity_drift'):v14.validate_score(altered)
 def test_only_exact_root_samples_produce_audio(self):
  rows,held=v14.plan(SCORE,v14.validate_manifest(self.manifest))
  self.assertEqual(len(rows),17)
  self.assertTrue(all((r['instrument'],r['pitch']) in self.audio for r in rows))
  self.assertFalse(any((r['instrument'],r['pitch']) in self.audio for r in held))
 def test_all_solo_piano_regions_kept_silent(self):
  with tempfile.TemporaryDirectory() as d:
   score=Path(d)/'score.json';pins=Path(d)/'pins.json'
   score.write_text(json.dumps(SCORE));pins.write_text(json.dumps(self.manifest))
   receipt=v14.render(score,pins,self.archive,Path(d)/'out')
   for name in receipt['output_sha256']:
    wave,sr=sf.read(Path(d)/'out'/name,always_2d=True)
    self.assertEqual(sr,v14.SR)
    self.assertFalse(np.any(wave[:round(8.8*v14.SR)]))
    self.assertFalse(np.any(wave[round(31*v14.SR):]))
 def test_all_eight_independent_instrument_stems_render(self):
  with tempfile.TemporaryDirectory() as d:
   score=Path(d)/'score.json';pins=Path(d)/'pins.json'
   score.write_text(json.dumps(SCORE));pins.write_text(json.dumps(self.manifest))
   receipt=v14.render(score,pins,self.archive,Path(d)/'out')
   self.assertEqual((receipt['recorded_note_events'],receipt['held_note_events']), (17,30))
   self.assertEqual(receipt['recorded_sections_with_at_least_one_root'],8)
   self.assertEqual(len(receipt['output_sha256']),11)
 def test_rehearsal_outputs_have_matching_sha_receipts(self):
  with tempfile.TemporaryDirectory() as d:
   score=Path(d)/'score.json';pins=Path(d)/'pins.json'
   score.write_text(json.dumps(SCORE));pins.write_text(json.dumps(self.manifest))
   receipt=v14.render(score,pins,self.archive,Path(d)/'out')
   for f,h in receipt['output_sha256'].items():
    self.assertEqual(v14.sha((Path(d)/'out'/f).read_bytes()),h)
 def test_no_synthesis_pitch_shift_or_artistic_approval(self):
  with tempfile.TemporaryDirectory() as d:
   score=Path(d)/'score.json';pins=Path(d)/'pins.json'
   score.write_text(json.dumps(SCORE));pins.write_text(json.dumps(self.manifest))
   receipt=v14.render(score,pins,self.archive,Path(d)/'out')
   for f in ('original_piano_included','original_piano_mutated','recorded_continuous_legato',
             'synthesis_or_pitch_shifting_used','full_14_section_orchestra_recorded',
             'founder_listening_approved','commercial_release_approved'):
    self.assertFalse(receipt[f])
   self.assertTrue(all(n['original_named_pitch_unchanged'] for n in receipt['note_custody']))
 def test_pinned_path_rejects_traversal(self):
  bad=copy.deepcopy(REAL);bad['sample_files'][0]['path']='../bad.wav'
  with self.assertRaisesRegex(ValueError,'source_path_traversal'):v14.validate_manifest(bad)

if __name__=='__main__':unittest.main()
