"""V13 pinned-artifact QA: source integrity and honest gain-only listening study."""
from __future__ import annotations
import copy,importlib.util,io,json,os,tempfile,unittest,zipfile
from pathlib import Path
import numpy as np
import soundfile as sf
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('v13',HERE/'last-light-v13-balance-audition.py')
v13=importlib.util.module_from_spec(spec);spec.loader.exec_module(v13)

class V13RealArtifactGates(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  path=os.environ.get('LL_V13_SOURCE_ZIP')
  if not path:raise unittest.SkipTest('Pinned real-source V12 artifact required; no synthetic fixtures accepted as acoustic proof')
  cls.path=Path(path)
  cls.zbytes=cls.path.read_bytes()
  cls.tracks,cls.proof,cls.original=v13.source_bundle(cls.path)
 def variant_zip(self,change):
  fd=tempfile.TemporaryDirectory();self.addCleanup(fd.cleanup)
  file=Path(fd.name)/'changed.zip'
  with zipfile.ZipFile(io.BytesIO(self.zbytes)) as origin,zipfile.ZipFile(file,'w') as target:
   for name in origin.namelist():
    data=origin.read(name)
    value=change(name,data)
    if value is not None:target.writestr(name,value)
  return file
 def test_all_original_v12_inputs_double_pinned(self):
  self.assertEqual(len(self.tracks),3)
  self.assertEqual(self.proof['exact_root_note_events_auditioned'],9)
  self.assertEqual(self.proof['held_score_events'],38)
  self.assertEqual(v13.sha(self.original),v13.BASELINE[1])
 def test_music_acoustic_level_measures_not_silent_full_clip(self):
  levels,notes=v13.note_rms(self.tracks,self.proof)
  self.assertTrue(-44<levels['cello']<-35)
  self.assertTrue(-49<levels['violin_II']<-40)
  self.assertEqual({k:len(v) for k,v in notes.items()}, {'cello':5,'violin_I':1,'violin_II':3})
 def test_gain_only_arrays_exact_for_each_mix(self):
  measured,_=v13.note_rms(self.tracks,self.proof)
  out,gains=v13.variants(self.tracks,measured)
  for variant in out:
   expectation=sum((self.tracks[k]*10**(gains[variant][k]/20) for k in v13.STEMS),np.zeros_like(self.tracks['cello']))
   self.assertTrue(np.array_equal(out[variant],expectation))
   self.assertLess(np.max(abs(out[variant])),.94)
 def test_piano_only_regions_remain_empty(self):
  measured,_=v13.note_rms(self.tracks,self.proof)
  out,_=v13.variants(self.tracks,measured)
  for mix in out.values():
   self.assertFalse(np.any(mix[:round(8.8*v13.SR)]))
   self.assertFalse(np.any(mix[round(31*v13.SR):]))
 def test_immutable_original_reference_copied_to_result(self):
  with tempfile.TemporaryDirectory() as d:
   report=v13.render(self.path,d)
   copied=(Path(d)/v13.BASELINE[0]).read_bytes()
   self.assertEqual(copied,self.original)
   self.assertEqual(report['rehearsal_files_sha256'][v13.BASELINE[0]],v13.BASELINE[1])
   self.assertEqual(len(report['rehearsal_files_sha256']),3)
 def test_no_legato_no_new_recordings_no_fake_piano(self):
  with tempfile.TemporaryDirectory() as d:
   report=v13.render(self.path,d)
   self.assertFalse(report['original_piano_included'])
   self.assertFalse(report['performed_legato'])
   self.assertFalse(report['new_recordings_created'])
   self.assertFalse(report['artistic_approval'])
   self.assertFalse(report['synthetic_audio_used'])
 def test_source_tamper_rejected(self):
  def edit(name,b):
   if name==v13.STEMS['cello'][0]:return b[:-1]+bytes([b[-1]^1])
   return b
  with self.assertRaisesRegex(ValueError,'pinned_stem_sha_drift'):
   v13.source_bundle(self.variant_zip(edit))
 def test_receipt_forged_approval_rejected(self):
  def edit(name,b):
   if name=='V12_AUDITION_PROVENANCE.json':
    j=json.loads(b);j['human_listening_approved']=True;return json.dumps(j).encode()
   return b
  with self.assertRaisesRegex(ValueError,'untrusted_v12_receipt'):
   v13.source_bundle(self.variant_zip(edit))
 def test_missing_provenance_rejected(self):
  with self.assertRaisesRegex(ValueError,'source_provenance_missing'):
   v13.source_bundle(self.variant_zip(lambda n,b: None if n=='V12_AUDITION_PROVENANCE.json' else b))
 def test_duplicate_wav_names_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'dup.zip'
   with zipfile.ZipFile(io.BytesIO(self.zbytes)) as src, zipfile.ZipFile(p,'w') as dst:
    for n in src.namelist():dst.writestr(n,src.read(n))
    dst.writestr(v13.STEMS['cello'][0],b'bad file')
   with self.assertRaisesRegex(ValueError,'duplicate_zip_entries'):v13.source_bundle(p)
 def test_excessive_levels_refused_without_limiting(self):
  measured,_=v13.note_rms(self.tracks,self.proof)
  bad={k:x*100 for k,x in self.tracks.items()}
  with self.assertRaisesRegex(ValueError,'output_headroom_refused'):
   v13.variants(bad,measured)
 def test_output_checksums_match_bytes(self):
  with tempfile.TemporaryDirectory() as d:
   report=v13.render(self.path,d)
   for file,digest in report['rehearsal_files_sha256'].items():
    self.assertEqual(v13.sha((Path(d)/file).read_bytes()),digest)

if __name__=='__main__':unittest.main()
