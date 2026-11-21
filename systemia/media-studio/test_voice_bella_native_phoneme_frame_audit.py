#!/usr/bin/env python3
"""Offline tests of native Bella phoneme duration provenance, no model download."""
import hashlib
import importlib.util
import json
import pathlib
import tempfile
import unittest
import zipfile

PATH=pathlib.Path(__file__).with_name("voice-bella-native-phoneme-frame-audit.py")
spec=importlib.util.spec_from_file_location("bella_phoneme_frames",PATH)
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def evidence():
    ph="tə tə tu. tu."
    words=[{"text":"to","predictedTotalWordSec":0.05} for _ in range(4)]
    frames=[1]*(len(ph)+2)
    item={"nativeInputPhonemeSha256":hashlib.sha256(ph.encode("utf8")).hexdigest(),
          "predictedTokenDurationsFrames":frames,
          "predictedWordRecords":words,"nativeTokenTimesUsable":True,
          "actualWavDurationSec":len(frames)/40,
          "dryNativeWavFile":"original.wav",
          "dryNativeWavSha256":hashlib.sha256(b"synthetic").hexdigest()}
    native={"schema":audit.EXPECTED_NATIVE,"voiceId":"af_bella",
            "productionApproved":False,"phonemeOverrideApplied":False,
            "observations":{"original":item}}
    frontend={"schema":audit.EXPECTED_FRONTEND,"voiceId":"af_bella",
              "originalBellaVoiceUntouched":True,
              "chunks":[{"phonemes":ph}]}
    return native,frontend


class BellaNativePhonemeFrameTests(unittest.TestCase):
    def test_verified_exact_symbol_mapping(self):
        n,g=evidence()
        r=audit.inspect(n,g)
        self.assertEqual(r["mappedPhonemeSymbols"],len(g["chunks"][0]["phonemes"]))
        self.assertEqual(len(r["words"]),4)
        self.assertEqual(len(r["functionWordToCandidates"]),4)
        self.assertEqual([x["phonemes"] for x in r["words"]],["tə","tə","tu.","tu."])
        self.assertFalse(r["humanAudioImprovementApproved"])
        self.assertTrue(r["modelFramesNotAcousticPhonemeAlignment"])

    def test_g2p_checksum_mismatch_is_rejected(self):
        n,g=evidence()
        g["chunks"][0]["phonemes"]="tə te tu. tu."
        with self.assertRaisesRegex(ValueError,"G2P_CHECKSUM"):
            audit.inspect(n,g)

    def test_predicted_duration_length_mismatch_is_rejected(self):
        n,g=evidence()
        n["observations"]["original"]["predictedTokenDurationsFrames"].append(1)
        with self.assertRaisesRegex(ValueError,"FRAME_TO_SYMBOL"):
            audit.inspect(n,g)

    def test_no_extra_words_inferred(self):
        n,g=evidence()
        n["observations"]["original"]["predictedWordRecords"].pop()
        with self.assertRaisesRegex(ValueError,"NOT_PAIRABLE"):
            audit.inspect(n,g)

    def test_release_flag_is_fail_closed(self):
        n,g=evidence()
        n["productionApproved"]=True
        with self.assertRaisesRegex(ValueError,"REVIEW_HOLDS"):
            audit.inspect(n,g)

    def test_real_archive_hash_verification_rejects_modified_audio(self):
        n,g=evidence()
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td)/"source.zip"
            with zipfile.ZipFile(p,"w") as z:
                z.writestr("evidence.json",json.dumps(n))
                z.writestr("original.wav",b"synthetic altered")
            with self.assertRaisesRegex(ValueError,"SOURCE_WAV_TAMPERED"):
                audit.verify_source_zip(p)

    def test_source_zip_roundtrip_and_cli(self):
        import subprocess,sys
        n,g=evidence()
        with tempfile.TemporaryDirectory() as td:
            root=pathlib.Path(td);archive=root/"source.zip"
            with zipfile.ZipFile(archive,"w") as z:
                z.writestr("evidence.json",json.dumps(n))
                z.writestr("original.wav",b"synthetic")
            frontend=root/"g2p.json";frontend.write_text(json.dumps(g))
            target=root/"report.json"
            cmd=[sys.executable,str(PATH),"--native-artifact",str(archive),
                 "--frontend-evidence",str(frontend),"--output",str(target)]
            result=subprocess.run(cmd,check=True,capture_output=True,text=True,timeout=15)
            self.assertIn("REVIEW_ONLY_NATIVE_PHONEME_PREDICTIONS",result.stdout)
            self.assertEqual(json.loads(target.read_text())["realModelFrameCount"],
                             len(g["chunks"][0]["phonemes"])+2)


if __name__=="__main__":
    unittest.main()
