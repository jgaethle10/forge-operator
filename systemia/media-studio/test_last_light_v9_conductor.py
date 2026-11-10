"""V9 tests are score/serialization gates, never a claim of acoustic quality."""
from __future__ import annotations
import copy, importlib.util, json, struct, tempfile, unittest
from pathlib import Path

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('evercraft_v9_conductor',HERE/'last-light-v9-conductor.py')
v9=importlib.util.module_from_spec(spec);spec.loader.exec_module(v9)
BASE=json.loads((HERE/'last-light-v9-conductor-score.json').read_text())

class ConductorGates(unittest.TestCase):
 def test_full_score_is_14_independent_sections(self):
  stats=v9.check_score(BASE)
  self.assertEqual(stats['sections'],14)
  self.assertEqual(stats['note_events'],47)
  self.assertEqual(len({s['channel'] for s in BASE['sections']}),14)
  self.assertNotIn(9,{s['channel'] for s in BASE['sections']})
 def test_protected_piano_is_identity_only_not_midi_piano(self):
  self.assertEqual(BASE['protected_piano_sha256'],v9.PIANO_SHA)
  midi,stats=v9.build_midi(BASE)
  self.assertEqual(midi[:4],b'MThd')
  self.assertEqual(struct.unpack('>IHHH',midi[4:14]),(6,1,15,960))
  self.assertEqual(midi.count(b'MTrk'),15)
  self.assertNotIn(b'Piano Track',midi)
 def test_no_melodic_section_claims_approved_sound(self):
  self.assertTrue(all(s['audio_approved'] is False for s in BASE['sections']))
  self.assertTrue(all(s['source_status'] in ('partial_recorded_samples_unapproved','recording_missing') for s in BASE['sections']))
 def test_missing_recording_never_promoted(self):
  changed=copy.deepcopy(BASE)
  changed['sections'][0]['audio_approved']=True
  with self.assertRaisesRegex(ValueError,'cannot_claim_instrument_approval'):v9.build_midi(changed)
 def test_instrument_pitch_range_rejects_bad_score(self):
  changed=copy.deepcopy(BASE)
  changed['sections'][3]['notes'][0][1]='C7'
  with self.assertRaisesRegex(ValueError,'instrument_range_violation'):v9.build_midi(changed)
 def test_piano_digest_change_rejected(self):
  changed=copy.deepcopy(BASE)
  changed['protected_piano_sha256']='0'*64
  with self.assertRaisesRegex(ValueError,'piano_identity_mismatch'):v9.build_midi(changed)
 def test_late_note_rejected_to_preserve_piano_solo_outro(self):
  changed=copy.deepcopy(BASE)
  changed['sections'][0]['notes'][0][0]=32.1
  with self.assertRaisesRegex(ValueError,'unsafe_score_event'):v9.build_midi(changed)
 def test_duplicate_midi_channel_is_error(self):
  changed=copy.deepcopy(BASE)
  changed['sections'][1]['channel']=changed['sections'][0]['channel']
  with self.assertRaisesRegex(ValueError,'duplicate_section_or_channel'):v9.build_midi(changed)
 def test_overlap_note_off_does_not_silence_next_key(self):
  changed=copy.deepcopy(BASE)
  changed['sections'][0]['notes'].append([12.4,'E5',.9,44,0])
  with self.assertRaisesRegex(ValueError,'overlapping_same_pitch'):v9.build_midi(changed)
 def test_midi_round_trip_with_standard_reader(self):
  try:import mido
  except ImportError:self.skipTest('optional independent mido parser not installed')
  with tempfile.TemporaryDirectory() as d:
   receipt=v9.render(HERE/'last-light-v9-conductor-score.json',d)
   mf=mido.MidiFile(str(Path(d)/'The_Last_Light_V9_UNAPPROVED_Orchestral_Conductor.mid'))
   self.assertEqual(len(mf.tracks),15)
   self.assertEqual(mf.ticks_per_beat,960)
   ons=sum(m.type=='note_on' and m.velocity>0 for t in mf.tracks for m in t)
   offs=sum(m.type=='note_off' for t in mf.tracks for m in t)
   self.assertEqual((ons,offs),(47,47))
   self.assertFalse(receipt['audio_orchestra_rendered'])
   self.assertFalse(receipt['piano_audio_present'])
   self.assertFalse(receipt['human_orchestration_approved'])
 def test_receipt_refuses_missing_original_sound(self):
  with tempfile.TemporaryDirectory() as d:
   receipt=v9.render(HERE/'last-light-v9-conductor-score.json',d)
   timeline=json.loads((Path(d)/'conductor-timeline.json').read_text())
   self.assertFalse(timeline['automatic_synth_fallback'])
   self.assertTrue(all(s['audio_status']=='BLOCKED_PENDING_PERFORMED_INSTRUMENT_APPROVAL' for s in timeline['sections']))
   self.assertEqual(receipt['approved_piano_sha256'],v9.PIANO_SHA)

if __name__=='__main__':unittest.main()
