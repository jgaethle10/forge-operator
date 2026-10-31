#!/usr/bin/env python3
"""Offline Bella mobile-video regression tests using generated PCM, not user audio."""
import hashlib
import importlib.util
import io
import json
import pathlib
import shutil
import tempfile
import unittest
import wave
import zipfile

SOURCE=pathlib.Path(__file__).with_name("voice-bella-iphone-video-review.py")
spec=importlib.util.spec_from_file_location("bella_iphone_review",SOURCE)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def source_fixture(path):
    evidence={
        "schema":"evercraft.bella.gap-repair-review.v1",
        "voice":"original_kokoro_af_bella",
        "humanApproved":False,"commercialReleaseAuthorized":False,
        "candidates":{}
    }
    files={}
    for i,letter in enumerate("ABCDE"):
        buff=io.BytesIO()
        with wave.open(buff,"wb") as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(24000)
            # 11s of low-volume synthetic test tone data (not a user's voice).
            sample=(150+i*100).to_bytes(2,"little",signed=True)
            f.writeframes(sample*(24000*11))
        audio=buff.getvalue()
        files["Bella_"+letter+"_master.wav"]=audio
        evidence["candidates"][letter]={"masterSha256":hashlib.sha256(audio).hexdigest(),
                                        "durationSec":11.0}
    with zipfile.ZipFile(path,"w",zipfile.ZIP_DEFLATED) as z:
        z.writestr("evidence.json",json.dumps(evidence))
        for name,contents in files.items():
            z.writestr(name,contents)
    return evidence,files


class BellaPhoneTests(unittest.TestCase):
    def test_five_real_wav_buffers_fingerprint_verified(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td)/"input.zip"
            source_fixture(p)
            verified=module.source_audio(p)
            self.assertEqual(set(verified),set("ABCDE"))
            self.assertTrue(all(x["seconds"]==11.0 for x in verified.values()))

    def test_tampered_master_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td)/"input.zip"
            evidence,files=source_fixture(p)
            files["Bella_C_master.wav"]+=b"tamper"
            with zipfile.ZipFile(p,"w",zipfile.ZIP_DEFLATED) as z:
                z.writestr("evidence.json",json.dumps(evidence))
                for name,contents in files.items():
                    z.writestr(name,contents)
            with self.assertRaisesRegex(ValueError,"SOURCE_TAMPERED_C"):
                module.source_audio(p)

    def test_false_approval_or_bad_release_gate_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td)/"input.zip"
            evidence,files=source_fixture(p)
            evidence["humanApproved"]=True
            with zipfile.ZipFile(p,"w",zipfile.ZIP_DEFLATED) as z:
                z.writestr("evidence.json",json.dumps(evidence))
                for name,contents in files.items():
                    z.writestr(name,contents)
            with self.assertRaisesRegex(ValueError,"REVIEW_HOLD_INVALID"):
                module.source_audio(p)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                         "ffmpeg required")
    def test_actual_synthetic_fixture_to_mobile_video(self):
        try:
            import PIL
        except ImportError:
            self.skipTest("Pillow required")
        with tempfile.TemporaryDirectory() as td:
            archive=pathlib.Path(td)/"input.zip"
            source_fixture(archive)
            output=pathlib.Path(td)/"bella_test.mp4"
            module.export(archive,output)
            receipt=json.loads(output.with_suffix(".evidence.json").read_text())
            self.assertEqual([x["take"] for x in receipt["timeline"]],list("ABCDE"))
            self.assertAlmostEqual(receipt["durationSec"],61.0,delta=.35)
            self.assertGreater(output.stat().st_size,15000)
            self.assertFalse(receipt["humanApproved"])
            self.assertTrue(receipt["sourceMastersVerified"])
            with self.assertRaises(FileExistsError):
                module.export(archive,output)


if __name__=="__main__":
    unittest.main()
