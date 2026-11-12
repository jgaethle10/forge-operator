"""No false playback or license claims. Coverage tests do not test sound quality."""
import copy, importlib.util, json, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('llv11',ROOT/'last-light-v11-acoustic-routing.py')
v11=importlib.util.module_from_spec(spec);spec.loader.exec_module(v11)
SCORE=json.loads((ROOT/'last-light-v9-conductor-score.json').read_text())
BANK=json.loads((ROOT/'instrument-foundry-v10-source-bank.json').read_text())

class SourceCoverageGates(unittest.TestCase):
 def test_counts_actual_exact_catalogue_roots(self):
  report=v11.audit(SCORE,BANK)
  self.assertEqual((report['sections_total'],report['score_notes_total'],report['catalogued_exact_root_notes'],report['uncovered_score_notes']), (14,47,9,38))
  self.assertEqual(report['approved_audio_sections'],0)
 def test_even_all_cello_note_roots_does_not_mean_legato_or_approval(self):
  report=v11.audit(SCORE,BANK)
  cello=next(r for r in report['sections'] if r['id']=='cello')
  self.assertEqual(cello['notes_total'],cello['catalogued_exact_root_notes'])
  self.assertFalse(cello['recorded_legato_approved'])
  self.assertFalse(cello['production_stem_approved'])
  self.assertEqual(cello['audio_status'],'BLOCKED')
 def test_solo_violin_not_masquerading_as_orchestra_section(self):
  report=v11.audit(SCORE,BANK)
  for name in ('violin_I','violin_II'):
   part=next(r for r in report['sections'] if r['id']==name)
   self.assertIn('solo_note_cannot_prove_real_section_ensemble',part['instrument_limitation'])
 def test_no_real_bank_for_missing_brass_woodwinds(self):
  report=v11.audit(SCORE,BANK)
  for r in report['sections']:
   if r['family'] in ('brass','woodwinds'):
    self.assertEqual(r['catalogued_exact_root_notes'],0)
 def test_unchanged_piano_digest_is_nonnegotiable(self):
  broken=copy.deepcopy(SCORE);broken['protected_piano_sha256']='0'*64
  with self.assertRaisesRegex(ValueError,'piano_sha_mismatch'):v11.audit(broken,BANK)
 def test_no_silent_copyright_or_performance_promotion(self):
  for key,value in (('source_owned_by_evercraft',True),('actual_performed_legato',True),('status','human_accepted')):
   bad=copy.deepcopy(BANK);bad[key]=value
   with self.assertRaisesRegex(ValueError,'bank_rights_or_performance_misrepresented'):v11.audit(SCORE,bad)
 def test_missing_independent_recording_receipt_fails_closed(self):
  bad=copy.deepcopy(BANK);bad['files'][0]['sha256']='unverified'
  with self.assertRaisesRegex(ValueError,'missing_source_custody'):v11.audit(SCORE,bad)
 def test_unverified_extra_instrument_not_admitted_by_label_alone(self):
  bad=copy.deepcopy(SCORE);bad['sections'][4]['source_status']='partial_recorded_samples_unapproved'
  report=v11.audit(bad,BANK)
  self.assertEqual(report['sections'][4]['catalogued_exact_root_notes'],0)
 def test_interactive_dashboard_is_offline_and_has_export(self):
  html=v11.control_room(v11.audit(SCORE,BANK))
  self.assertIn('ORCHESTRA / CONTROL ROOM',html)
  self.assertIn('Export proposed score controls',html)
  self.assertIn('audio_render_authorized:false',html)
  self.assertNotIn('cdn.',html)
  self.assertNotIn('src="http',html)
 def test_output_receipts_are_not_fake_audio(self):
  with tempfile.TemporaryDirectory() as d:
   report=v11.render(ROOT/'last-light-v9-conductor-score.json',ROOT/'instrument-foundry-v10-source-bank.json',d)
   files={p.name for p in Path(d).iterdir()}
   self.assertEqual(files,{'orchestra-control-room.html','orchestra-source-coverage.json','README.txt'})
   self.assertEqual(report['catalogued_exact_root_notes'],9)
   self.assertFalse(report['source_bytes_verified_this_run'])
   self.assertFalse(report['midi_synthesis_used'])

if __name__=='__main__':unittest.main()
