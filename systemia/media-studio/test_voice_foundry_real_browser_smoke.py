#!/usr/bin/env python3
"""Voice Foundry | REAL browser-to-Kokoro smoke test (isolated CI only).

Starts a loopback-only studio process, submits a NEW Spanish script through
the same HTTP API the browser uses, then waits for real Kokoro generation.
Verifies native WAV, MP3, SHA receipts, same-origin protections, and a saved
five-axis listener score. No mock runner and NO publication or commercial
release. Can only run on a properly provisioned owned/C.I. machine.

  python test_voice_foundry_real_browser_smoke.py

The spoken text is an original engineering fixture, not a customer script.
"""
from __future__ import annotations

import contextlib
import hashlib
import json
import os
import pathlib
import re
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import wave

ROOT = pathlib.Path(__file__).resolve().parent
SERVER = ROOT / "voice-foundry-local-studio.py"
SCRIPT = (
    "La tecnología debe ofrecer respuestas claras y ayudarte a trabajar con confianza. "
    "En Evercraft creamos herramientas prácticas para transformar buenas ideas en resultados. "
    "La voz correcta transmite claridad, respeto y tranquilidad. "
    "Ese es nuestro compromiso."
)
SELECTED = "ef_dora"
MIN_BYTES = 12000


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def request(base, path, *, method="GET", payload=None, origin=None, token=None,
            host=None, content_type=True):
    headers = {}
    if origin is not None:
        headers["Origin"] = origin
    if token is not None:
        headers["X-Voice-Foundry-Token"] = token
    if host is not None:
        headers["Host"] = host
    if payload is not None and content_type:
        headers["Content-Type"] = "application/json"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read()


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sk:
        sk.bind(("127.0.0.1", 0))
        return sk.getsockname()[1]


def check():
    with tempfile.TemporaryDirectory(prefix="evercraft-voice-real-browser-") as temp:
        port = free_port()
        base = f"http://127.0.0.1:{port}"
        reviews = pathlib.Path(temp) / "reviews"
        command = [
            sys.executable, str(SERVER), "--host", "127.0.0.1",
            "--port", str(port), "--data-dir", str(reviews),
        ]
        proc = subprocess.Popen(
            command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        try:
            for attempt in range(80):
                if proc.poll() is not None:
                    raise RuntimeError("LOCAL_STUDIO_EXITED_EARLY")
                try:
                    status, _, body = request(base, "/healthz")
                    if status == 200 and json.loads(body)["public"] is False:
                        break
                except (OSError, ValueError):
                    pass
                time.sleep(.2)
            else:
                raise RuntimeError("LOCAL_STUDIO_DID_NOT_OPEN")

            status, headers, page = request(base, "/")
            assert status == 200
            assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
            assert "no-store" in headers["Cache-Control"]
            html = page.decode("utf-8")
            found = re.search(r'const token="([^"]+)"', html)
            assert found, "Per-launch CSRF token not embedded in real UI"
            token = found.group(1)
            assert len(token) >= 30 and "@@" not in token

            status, _, _ = request(base, "/api/voices", host="attacker.example")
            assert status == 403, "DNS rebinding host should be blocked"

            status, _, record = request(base, "/api/voices")
            assert status == 200
            catalog = json.loads(record)["catalog"]
            assert SELECTED in catalog and catalog[SELECTED]["language"] == "es-ES"
            assert "af_bella" not in catalog

            payload = {"voice": SELECTED, "script": SCRIPT}
            status, _, _ = request(base, "/api/render", method="POST", payload=payload,
                                   origin="https://untrusted.example", token=token)
            assert status == 403, "Cross-site write succeeded"
            status, _, _ = request(base, "/api/render", method="POST", payload=payload,
                                   origin=base, token="invalid")
            assert status == 403, "CSRF bypass"
            status, _, _ = request(
                base, "/api/render", method="POST",
                payload={"voice": "af_bella", "script": SCRIPT}, origin=base, token=token)
            assert status == 422, "Protected Bella should remain unavailable"

            status, _, created = request(base, "/api/render", method="POST",
                                         payload=payload, origin=base, token=token)
            assert status == 202, f"Script submit failed: {status}"
            jobid = json.loads(created)["jobId"]
            assert re.fullmatch(r"[0-9a-f]{32}", jobid)
            print("PASS: actual local browser request submitted to owned native renderer", flush=True)

            deadline = time.monotonic() + 330
            while time.monotonic() < deadline:
                assert proc.poll() is None, "Renderer process exited during synthesis"
                status, _, body = request(base, f"/api/jobs/{jobid}")
                assert status == 200
                job = json.loads(body)
                assert SCRIPT not in body.decode("utf8"), "Private script leaked in job status"
                if job["state"] == "failed":
                    raise RuntimeError("REAL_KOKORO_JOB_FAILED")
                if job["state"] == "ready":
                    break
                time.sleep(2)
            else:
                raise TimeoutError("Real native synthesis exceeded bounded test time")
            assert job["details"]["releaseAuthorized"] is False
            assert job["details"]["language"] == "es-ES"

            status, headers, wav = request(base, f"/api/jobs/{jobid}/native.wav")
            assert status == 200 and headers["Content-Type"] == "audio/wav"
            status, headers, mp3 = request(base, f"/api/jobs/{jobid}/preview.mp3")
            assert status == 200 and headers["Content-Type"] == "audio/mpeg"
            assert len(wav) > MIN_BYTES and len(mp3) > MIN_BYTES
            status, _, receipt_raw = request(base, f"/api/jobs/{jobid}/evidence.json")
            assert status == 200
            receipt = json.loads(receipt_raw)
            assert digest(wav) == receipt["nativeWavSha256"]
            assert digest(mp3) == receipt["previewMp3Sha256"]
            assert receipt["script"] == SCRIPT
            assert receipt["genuineNativeSynthesis"] is True
            assert receipt["voiceInput"] == SELECTED
            assert receipt["productionReady"] is False
            assert receipt["releaseAuthorized"] is False
            assert receipt["humanPronunciationApproved"] is False
            assert receipt["bellaOriginalMasterUntouched"] is True

            wav_path = reviews / jobid / "native.wav"
            with wave.open(str(wav_path), "rb") as wf:
                assert (wf.getnchannels(), wf.getsampwidth(), wf.getframerate()) == (1, 2, 24000)
                duration = wf.getnframes() / wf.getframerate()
                assert 3 < duration < 45
            assert not (reviews / (jobid + ".script.txt")).exists()

            axes = {
                "diction": 3, "naturalness": 3,
                "semantic_emphasis": 3, "brand_pronunciation": 3, "accent": 3,
            }
            score = {"scores": axes, "notes": "Synthetic CI scoring, not a human listening verdict.",
                     "fluent": False}
            status, _, saved = request(base, f"/api/jobs/{jobid}/review", method="POST",
                                       payload=score, origin=base, token=token)
            assert status == 200
            assert json.loads(saved)["productionApproved"] is False
            human_claim = json.loads((reviews / jobid / "private-review.json").read_text())
            assert human_claim["sourceWavSha256"] == digest(wav)
            assert human_claim["commercialReleaseApproved"] is False

            # Important: CI's placeholder review is NOT represented as a
            # genuine human verdict, despite exercising the persistence API.
            print("PASS: real browser-to-Kokoro Spanish script / WAV+MP3 / SHA / review API",
                  f"nativeDurationSec={duration:.3f}, mp3Bytes={len(mp3)}", flush=True)
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=8)
            if proc.returncode not in (0, -15) and proc.stderr is not None:
                # Prevent private voice data, filesystem paths or user scripts
                # leaking via a raw traceback in a public CI log.
                print("Studio process ended with nonstandard code", proc.returncode)


if __name__ == "__main__":
    check()
