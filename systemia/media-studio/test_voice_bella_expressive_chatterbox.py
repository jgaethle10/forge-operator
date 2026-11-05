#!/usr/bin/env python3
"""Bella Chatterbox gated bridge tests with real WAV bytes, no model/Internet."""
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
import wave

SCRIPT=pathlib.Path(__file__).with_name("voice-bella-expressive-chatterbox.py")
spec=importlib.util.spec_from_file_location("bella_expressive",SCRIPT)
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def fixture(tmp):
    root=pathlib.Path(tmp)
    wav=root/"bella-owned-reference.wav"
    with wave.open(str(wav),"wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(24000)
        f.writeframes((3000).to_bytes(2,"little",signed=True)*24000*8)
    auth=root/"authorized.json"
    record={"schema":gate.SCHEMA,
            "referenceKind":"synthetic_kokoro_af_bella",
            "privateExperimentOnly":True,
            "noPublicationAuthorized":True,
            "permissionToUseReferenceInExpressiveTest":True,
            "evidenceRef":"owner-directed-private-bella-voice-expressivity-test",
            "commercialReleaseRightsVerified":False,
            "referenceSha256":hashlib.sha256(wav.read_bytes()).hexdigest()}
    auth.write_text(json.dumps(record))
    return wav,auth,record


class BellaExpressiveGateTests(unittest.TestCase):
    def test_design_is_mechanically_isolated(self):
        gate.validate_design()
        self.assertEqual(len(gate.CONDITIONS),3)
        self.assertEqual(gate.CONDITIONS[0]["cfg_weight"],gate.CONDITIONS[1]["cfg_weight"])
        self.assertEqual(gate.CONDITIONS[1]["exaggeration"],gate.CONDITIONS[2]["exaggeration"])

    def test_genuine_audio_reference_preflights_without_neural_runtime(self):
        with tempfile.TemporaryDirectory() as td:
            wav,auth,_=fixture(td)
            result=gate.preflight(str(wav),str(auth))
            self.assertEqual(result["referenceSha256"],gate.sha256(wav))
            self.assertFalse(result["modelCheckpointDigestVerified"])
            self.assertFalse(result["voiceReferenceIndependentRightsAudit"])
            self.assertFalse(result["productionReady"])

    def test_reject_other_audio_even_if_original_approval_file_exists(self):
        with tempfile.TemporaryDirectory() as td:
            wav,auth,_=fixture(td)
            with open(wav,"ab") as f:
                f.write(b"tamper")
            with self.assertRaisesRegex(ValueError,"SHA256"):
                gate.preflight(wav,auth)

    def test_no_reference_permission_no_model_download(self):
        with tempfile.TemporaryDirectory() as td:
            wav,auth,record=fixture(td)
            record["permissionToUseReferenceInExpressiveTest"]=False
            auth.write_text(json.dumps(record))
            new=pathlib.Path(td)/"should-not-exist"
            with self.assertRaisesRegex(ValueError,"PERMISSION"):
                gate.render(wav,auth,new,"cpu")
            self.assertFalse(new.exists())

    def test_release_rights_must_remain_independently_unverified(self):
        with tempfile.TemporaryDirectory() as td:
            wav,auth,record=fixture(td)
            record["commercialReleaseRightsVerified"]=True
            auth.write_text(json.dumps(record))
            with self.assertRaisesRegex(ValueError,"COMMERCIAL_RIGHTS"):
                gate.preflight(wav,auth)

    def test_silent_voice_prompt_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            wav,auth,record=fixture(td)
            with wave.open(str(wav),"wb") as f:
                f.setnchannels(1);f.setsampwidth(2);f.setframerate(24000)
                f.writeframes(bytes(2*24000*8))
            record["referenceSha256"]=gate.sha256(wav)
            auth.write_text(json.dumps(record))
            with self.assertRaisesRegex(ValueError,"SILENT"):
                gate.preflight(wav,auth)

    def test_missing_evidence_ref_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            wav,auth,record=fixture(td)
            record["evidenceRef"]="not real"
            auth.write_text(json.dumps(record))
            with self.assertRaisesRegex(ValueError,"EVIDENCE"):
                gate.preflight(wav,auth)

    def test_real_cli_preflight_and_no_automatic_output(self):
        with tempfile.TemporaryDirectory() as td:
            wav,auth,_=fixture(td)
            result=subprocess.run([sys.executable,str(SCRIPT),
                                   "--reference",str(wav),"--authorization",str(auth)],
                                  capture_output=True,text=True,timeout=15,check=True)
            evidence=json.loads(result.stdout.split("PASS:")[-1].split("\n",1)[1])
            self.assertTrue(evidence["reviewOnly"])
            self.assertFalse(evidence["productionReady"])
            self.assertNotIn("samples",evidence)
            self.assertEqual(list(pathlib.Path(td).glob("*.wav")),[wav])


if __name__=="__main__":
    unittest.main()
