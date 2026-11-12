"""V12 software regression uses SYNTHETIC FIXTURES, not acoustic listening proof."""
from __future__ import annotations
import copy,importlib.util,io,json,tempfile,unittest,zipfile
from pathlib import Path
import numpy as np
import soundfile as sf

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("v12",HERE/"last-light-v12-native-audition.py")
v12=importlib.util.module_from_spec(spec);spec.loader.exec_module(v12)
SCORE=json.loads((HERE/"last-light-v9-conductor-score.json").read_text())
MANIFEST=json.loads((HERE/"instrument-foundry-v10-source-bank.json").read_text())

class AuditionSourceTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
    cls.tmp=tempfile.TemporaryDirectory()
    cls.manifest=copy.deepcopy(MANIFEST)
    cls.zip=Path(cls.tmp.name)/"SYNTHETIC_TEST_FIXTURES_NOT_FOR_RELEASE.zip"
    samples=6*v12.SR;t=np.arange(samples)/v12.SR
    with zipfile.ZipFile(cls.zip,"w",compression=zipfile.ZIP_STORED) as z:
        for i,item in enumerate(cls.manifest["files"]):
            mock=.04*np.sin(2*np.pi*(130+17*i)*t)*(1-np.exp(-12*t))
            data=np.column_stack([mock,mock*.95])
            b=io.BytesIO();sf.write(b,data,v12.SR,format="WAV",subtype="PCM_16")
            raw=b.getvalue()
            assert len(raw)>1_000_000
            item["sha256"]=v12.sha(raw)
            item["git_blob_sha1"]=v12.gitblob(raw)
            z.writestr(item["filename"],raw)
    cls.recorded,cls.receipts=v12.inspect_verified_sources(cls.zip,cls.manifest)
 @classmethod
 def tearDownClass(cls):cls.tmp.cleanup()
 def test_all_twelve_recordings_dual_hash_gated(self):
    self.assertEqual(len(self.recorded),12)
    self.assertEqual(len(self.receipts),12)
 def test_all_original_notes_accounted_for(self):
    tracks,notes,held=v12.route(SCORE,self.recorded)
    self.assertEqual((len(notes),len(held)),(9,38))
    self.assertEqual(set(tracks),{"violin_I","violin_II","cello"})
    self.assertTrue(all(not e["genuine_played_legato"] for e in notes))
 def test_strings_never_overlap_original_piano_solo_regions(self):
    tracks,_,_=v12.route(SCORE,self.recorded)
    for audio in tracks.values():
        self.assertFalse(np.any(audio[:round(8.8*v12.SR)]))
        self.assertFalse(np.any(audio[round(31*v12.SR):]))
    y=v12.mix(tracks,"three_part_strings")
    self.assertTrue(np.max(np.abs(y))>0)
    self.assertTrue(np.max(np.abs(y))<.94)
 def test_source_tamper_rejected(self):
    target=Path(self.tmp.name)/"tamper.zip"
    with zipfile.ZipFile(self.zip) as original,zipfile.ZipFile(target,"w") as out:
        for name in original.namelist():
            raw=original.read(name)
            if name==self.manifest["files"][0]["filename"]:
                raw=raw[:-5]+bytes([raw[-5]^1])+raw[-4:]
            out.writestr(name,raw)
    with self.assertRaisesRegex(ValueError,"source_hash_drift"):
        v12.inspect_verified_sources(target,self.manifest)
 def test_source_missing_rejected(self):
    target=Path(self.tmp.name)/"incomplete.zip"
    with zipfile.ZipFile(self.zip) as original,zipfile.ZipFile(target,"w") as out:
        for name in original.namelist()[1:]:out.writestr(name,original.read(name))
    with self.assertRaisesRegex(ValueError,"missing_or_extra_source"):
        v12.inspect_verified_sources(target,self.manifest)
 def test_no_piano_forgery(self):
    f=Path(self.tmp.name)/"bad-piano.wav";f.write_bytes(b"fake")
    with self.assertRaisesRegex(ValueError,"canonical_piano_sha_mismatch"):
        v12.verified_piano(f)
 def test_control_room_export_no_hidden_authorization(self):
    controls={"schema":"evercraft.music.proposed-controls.v11",
        "protected_piano_sha256":v12.PIANO_SHA,
        "approval":False,"audio_render_authorized":False,
        "changes":[{"section":s["id"],"included_in_proposed_score":True,
                    "expression_percent":100} for s in SCORE["sections"]]}
    self.assertEqual(len(v12.controls_for(controls,SCORE)),14)
    bad=copy.deepcopy(controls);bad["audio_render_authorized"]=True
    with self.assertRaisesRegex(ValueError,"unsafe_control_room_export"):
        v12.controls_for(bad,SCORE)
    bad=copy.deepcopy(controls);bad["changes"][-1]["section"]=bad["changes"][0]["section"]
    with self.assertRaisesRegex(ValueError,"duplicate_or_unknown_control"):
        v12.controls_for(bad,SCORE)
 def test_control_room_mute_is_respected(self):
    controls={"schema":"evercraft.music.proposed-controls.v11",
        "protected_piano_sha256":v12.PIANO_SHA,
        "approval":False,"audio_render_authorized":False,
        "changes":[{"section":s["id"],"included_in_proposed_score":s["id"]!="violin_I",
                    "expression_percent":100} for s in SCORE["sections"]]}
    tracks,notes,held=v12.route(SCORE,self.recorded,controls)
    self.assertEqual((len(notes),len(held)),(8,39))
    self.assertFalse(np.any(tracks["violin_I"]))
 def test_custody_receipt_avoids_fake_orchestra_claims(self):
    root=Path(self.tmp.name);score=root/"score.json";manifest=root/"manifest.json"
    score.write_text(json.dumps(SCORE));manifest.write_text(json.dumps(self.manifest))
    output=root/"render"
    receipt=v12.render(score,manifest,self.zip,output)
    self.assertEqual(receipt["exact_root_note_events_auditioned"],9)
    self.assertEqual(receipt["held_score_events"],38)
    self.assertTrue(receipt["source_samples_original_double_hash_verified"])
    self.assertFalse(receipt["synth_or_general_midi_fallback"])
    self.assertFalse(receipt["canonical_piano_imported"])
    self.assertFalse(receipt["performed_legato"])
    self.assertFalse(receipt["human_listening_approved"])
    self.assertEqual(len(receipt["output_sha256"]),6)
 def test_piano_identity_gate(self):
    bad=copy.deepcopy(SCORE);bad["protected_piano_sha256"]="0"*64
    with self.assertRaisesRegex(ValueError,"protected_piano_identity_drift"):
        v12.preflight(bad,MANIFEST)

if __name__=="__main__":unittest.main()
