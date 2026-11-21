#!/usr/bin/env python3
"""Synthetic fixture tests for evidence-verified iPhone review video exports.

No TTS model, authentic human recording, or commercial voice data used.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import wave

MODULE=Path(__file__).with_name("voice-foundry-mobile-review-export.py")
spec=importlib.util.spec_from_file_location("vf_mobile_review",MODULE)
vf=importlib.util.module_from_spec(spec)
spec.loader.exec_module(vf)


def make_fake_receipt(base):
    root=Path(base)
    with wave.open(str(root/"native.wav"),"wb") as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000)
        w.writeframes((120).to_bytes(2,"little",signed=True)*24000*5)
    (root/"preview.mp3").write_bytes(b"synthetic-fixture-not-a-real-mp3"*700)
    receipt={
        "schema":vf.SOURCE_SCHEMA,
        "voiceInput":"ef_dora",
        "resolvedProfile":{"voiceId":"ef_dora","language":"es-ES","kind":"publishedStockPack"},
        "nativeWav":"native.wav","nativeWavSha256":vf.sha(root/"native.wav"),
        "previewMp3":"preview.mp3","previewMp3Sha256":vf.sha(root/"preview.mp3"),
        "audioDurationSec":5.0,
        "productionReady":False,"releaseAuthorized":False,
        "humanPronunciationApproved":False,
        "textRightsVerified":False,"commercialRightsIndependentlyVerified":False,
        "trainedCustomVoice":False,"humanVoiceCloned":False,
        "bellaOriginalMasterUntouched":True,"genuineNativeSynthesis":True,
    }
    (root/"evidence.json").write_text(json.dumps(receipt),encoding="utf8")
    return receipt


class MobileReviewTests(unittest.TestCase):
    def test_verified_receipt_contract(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=make_fake_receipt(tmp)
            result,sec=vf.verify(tmp)
            self.assertEqual(sec,5.0)
            self.assertEqual(result["voiceInput"],"ef_dora")

    def test_modified_wav_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            make_fake_receipt(tmp)
            with open(Path(tmp)/"native.wav","ab") as f:f.write(b"tamper")
            with self.assertRaisesRegex(ValueError,"HASH_MISMATCH"):
                vf.verify(tmp)

    def test_modified_mp3_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            make_fake_receipt(tmp)
            with open(Path(tmp)/"preview.mp3","ab") as f:f.write(b"tamper")
            with self.assertRaisesRegex(ValueError,"HASH_MISMATCH"):
                vf.verify(tmp)

    def test_false_release_or_bella_profile_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest=make_fake_receipt(tmp)
            manifest["releaseAuthorized"]=True
            (Path(tmp)/"evidence.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError,"HOLD_MISSING"):
                vf.verify(tmp)
            manifest["releaseAuthorized"]=False
            manifest["voiceInput"]="af_bella"
            (Path(tmp)/"evidence.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError,"PROTECTED_BELLA"):
                vf.verify(tmp)

    def test_bad_locale_or_unsafe_poster_id_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            data=make_fake_receipt(tmp)
            data["voiceInput"]="voice:unknown"
            (Path(tmp)/"evidence.json").write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,"POSTER"):
                vf.verify(tmp)
            data["voiceInput"]="ef_dora"
            data["resolvedProfile"]["language"]="zz-ZZ"
            (Path(tmp)/"evidence.json").write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,"LANGUAGE"):
                vf.verify(tmp)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe") and vf.FONT.is_file(),
                         "ffmpeg, ffprobe and DejaVu font required for real video encoder")
    def test_actual_h264_aac_mobile_file_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            make_fake_receipt(root)
            out=root/"my-mobile.mp4"
            vf.render(root,out)
            evidence=json.loads(out.with_suffix(".evidence.json").read_text())
            self.assertEqual(evidence["videoSha256"],vf.sha(out))
            self.assertEqual(evidence["sourceNativeWavSha256"],vf.sha(root/"native.wav"))
            self.assertFalse(evidence["publicReleaseAuthorized"])
            self.assertFalse(evidence["humanDictionApproved"])
            self.assertEqual(evidence["audioCodec"],"aac")
            self.assertEqual(evidence["videoCodec"],"h264")
            self.assertLess(abs(evidence["videoDurationSec"]-5.0),0.5)
            self.assertGreater(out.stat().st_size,10000)
            with self.assertRaises(FileExistsError):
                vf.render(root,out)


if __name__ == "__main__":
    unittest.main()
