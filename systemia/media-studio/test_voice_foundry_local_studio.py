#!/usr/bin/env python3
"""End-to-end local HTTP and security regression tests. NO neural runtime."""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
import wave

PATH = Path(__file__).with_name("voice-foundry-local-studio.py")
spec = importlib.util.spec_from_file_location("evercraft_private_voice_studio", PATH)
studio_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio_mod)


def fake_native_runner(voice, script_path, folder):
    """Inject locally fabricated PCM in lieu of a neural model; never call this genuine TTS."""
    profile = studio_mod.workstation.catalog()[voice]
    script = Path(script_path).read_text(encoding="utf8")
    folder.mkdir(parents=True, exist_ok=False)
    wav = folder / "native.wav"
    with wave.open(str(wav), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(24000)
        f.writeframes((200).to_bytes(2, "little", signed=True) * (24000 * 3))
    mp3 = folder / "preview.mp3"
    mp3.write_bytes(b"SIMULATED AUDIO DATA FOR SERVER TESTS ONLY"*150)
    receipt = {
        "schema":studio_mod.workstation.SCHEMA,
        "voiceInput":voice,"resolvedProfile":profile,"script":script,
        "nativeWav":"native.wav","nativeWavSha256":studio_mod.file_sha(wav),
        "previewMp3":"preview.mp3","previewMp3Sha256":studio_mod.file_sha(mp3),
        "audioDurationSec":3.0,"productionReady":False,
        "releaseAuthorized":False,"bellaOriginalMasterUntouched":True,
        "humanPronunciationApproved":False,"genuineNativeSynthesis":True
    }
    # Above fields imitate the authentic workstation receipt for protocol tests,
    # and MUST NOT be interpreted as evidence of genuine synthesis.
    (folder/"evidence.json").write_text(json.dumps(receipt), encoding="utf8")


class StudioTests(unittest.TestCase):
    def test_reject_public_network_binds(self):
        for host in ("0.0.0.0","192.168.1.8","::","10.0.0.4","example.com"):
            with self.assertRaisesRegex(ValueError,"LOCALHOST_ONLY"):
                studio_mod.validate_host(host)
        self.assertEqual(studio_mod.validate_host("127.0.0.1"),"127.0.0.1")

    def test_actual_receipt_integrity_and_tamper_detection(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)/"job"
            script="Cada proyecto merece una voz clara y confiable. Esto es solamente una prueba."
            input_path=Path(tmp)/"copy.txt";input_path.write_text(script)
            fake_native_runner("ef_dora",input_path,folder)
            receipt=studio_mod.verified_receipt(folder,"ef_dora",script)
            self.assertEqual(receipt["language"],"es-ES")
            with open(folder/"native.wav","ab") as f:
                f.write(b"tampered")
            with self.assertRaisesRegex(ValueError,"AUDIO_SHA256_MISMATCH"):
                studio_mod.verified_receipt(folder,"ef_dora",script)

    def test_invalid_release_state_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)/"job";text=Path(tmp)/"script.txt"
            text.write_text("Good technology respects human choices and keeps the voice clear.")
            fake_native_runner("am_michael",text,folder)
            evidence=folder/"evidence.json"
            raw=json.loads(evidence.read_text())
            raw["releaseAuthorized"]=True
            evidence.write_text(json.dumps(raw))
            with self.assertRaisesRegex(ValueError,"RELEASE_STATE"):
                studio_mod.verified_receipt(folder,"am_michael",text.read_text())

    def test_capacity_and_voice_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            engine=studio_mod.Studio(tmp,runner=fake_native_runner)
            try:
                with self.assertRaisesRegex(ValueError,"UNKNOWN_OR_UNREVIEWED"):
                    engine.submit("af_bella","This sentence has sufficient text to pass the length gate.")
                with self.assertRaisesRegex(ValueError,"MARKUP"):
                    engine.submit("ef_dora","[phoneme] This is forbidden unreviewed markup.")
            finally:
                engine.shutdown()


class StudioHTTPTests(unittest.TestCase):
    def setUp(self):
        self.root=tempfile.TemporaryDirectory()
        self.engine=studio_mod.Studio(self.root.name,runner=fake_native_runner)
        self.server=studio_mod.VoiceServer("127.0.0.1",0,self.engine)
        self.port=self.server.server_port
        self.base=f"http://127.0.0.1:{self.port}"
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.engine.shutdown()
        self.root.cleanup()

    def request(self,path,method="GET",payload=None,headers=None):
        h=headers or {}
        data=json.dumps(payload).encode("utf8") if payload is not None else None
        if data is not None:
            h={"Content-Type":"application/json",**h}
        req=urllib.request.Request(self.base+path,data=data,headers=h,method=method)
        try:
            with urllib.request.urlopen(req,timeout=5) as resp:
                return resp.status,dict(resp.headers),resp.read()
        except urllib.error.HTTPError as exc:
            return exc.code,dict(exc.headers),exc.read()

    def test_mobile_ui_and_catalog_hard_hold(self):
        status,headers,page=self.request("/")
        self.assertEqual(status,200)
        text=page.decode()
        self.assertIn("EVERCRAFT",text)
        self.assertIn("Generate private audition",text)
        self.assertNotIn("@@TOKEN@@",text)
        self.assertIn("frame-ancestors 'none'",headers["Content-Security-Policy"])
        status,_,raw=self.request("/api/voices")
        self.assertEqual(status,200)
        roster=json.loads(raw)
        self.assertEqual(len(roster["catalog"]),12)
        self.assertNotIn("af_bella",roster["catalog"])
        self.assertFalse(roster["releaseApproved"])

    def test_csrf_and_origin_deny_browser_cross_site(self):
        payload={"voice":"ef_dora","script":"La tecnología más útil es clara, sencilla y cercana a las personas."}
        status,_,_=self.request("/api/render","POST",payload)
        self.assertEqual(status,403)
        status,_,_=self.request("/api/render","POST",payload,headers={
            "Origin":"https://attack.example",
            "X-Voice-Foundry-Token":self.engine.csrf})
        self.assertEqual(status,403)
        status,_,_=self.request("/api/render","POST",payload,headers={
            "Origin":self.base,"X-Voice-Foundry-Token":"wrong"})
        self.assertEqual(status,403)

    def test_real_http_end_to_end_worker_contract(self):
        payload={"voice":"ef_dora","script":"La tecnología más útil es clara, sencilla y cercana a las personas."}
        code,_,body=self.request("/api/render","POST",payload,headers={
            "Origin":self.base,"X-Voice-Foundry-Token":self.engine.csrf})
        self.assertEqual(code,202,body)
        jobid=json.loads(body)["jobId"]
        self.assertRegex(jobid,"^[0-9a-f]{32}$")
        for _ in range(80):
            status,_,raw=self.request(f"/api/jobs/{jobid}")
            self.assertEqual(status,200)
            row=json.loads(raw)
            if row["state"]!="ready":
                time.sleep(0.03)
                continue
            self.assertFalse(row["details"]["releaseAuthorized"])
            self.assertEqual(row["details"]["language"],"es-ES")
            break
        else:
            self.fail("Worker failed to create verified private review")
        status,headers,raw=self.request(f"/api/jobs/{jobid}/native.wav")
        self.assertEqual(status,200)
        self.assertEqual(headers["Content-Type"],"audio/wav")
        self.assertGreater(len(raw),120000)
        ratings={"diction":5,"naturalness":4,"semantic_emphasis":4,
                 "brand_pronunciation":3,"accent":3}
        post_url=f"/api/jobs/{jobid}/review"
        review_headers={"Origin":self.base,"X-Voice-Foundry-Token":self.engine.csrf}
        code,_,body=self.request(post_url,"POST",{
            "scores":ratings,"notes":"0:02 assess the proper noun", "fluent":False},
            headers=review_headers)
        self.assertEqual(code,200)
        self.assertFalse(json.loads(body)["productionApproved"])
        saved=json.loads((self.engine.root/jobid/"private-review.json").read_text())
        self.assertEqual(saved["ratings"],ratings)
        self.assertFalse(saved["commercialReleaseApproved"])
        self.assertFalse(saved["fluentInLanguageClaim"])
        invalid=dict(ratings,diction=8)
        code,_,_=self.request(post_url,"POST",{
            "scores":invalid,"notes":"invalid","fluent":False},headers=review_headers)
        self.assertEqual(code,422)
        code,_,_=self.request(post_url,"POST",{
            "scores":ratings,"notes":"cross origin","fluent":True},
            headers={"Origin":"https://evil.example",
                     "X-Voice-Foundry-Token":self.engine.csrf})
        self.assertEqual(code,403)
        self.assertEqual(json.loads((self.engine.root/jobid/"private-review.json").read_text())["ratings"],ratings)
        status,_,_=self.request(f"/api/jobs/{jobid}/invalid.txt")
        self.assertEqual(status,404)
        status,_,_=self.request("/api/jobs/../../etc/passwd")
        self.assertEqual(status,404)
        folder=self.engine.root/jobid
        with open(folder/"native.wav","ab") as f:
            f.write(b"tamper")
        status,_,_=self.request(f"/api/jobs/{jobid}/native.wav")
        self.assertEqual(status,404, "Never serve bytes that fail the receipt digest")
        self.assertFalse((self.engine.root/(jobid+".script.txt")).exists())


if __name__=="__main__":
    unittest.main()
