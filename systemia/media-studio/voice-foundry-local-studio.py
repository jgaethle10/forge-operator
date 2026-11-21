#!/usr/bin/env python3
"""Evercraft Voice Foundry | private localhost-only audition studio.

Use existing owned-infrastructure Kokoro workstation; not a hosted TTS service.
12 registered configurations across en-US, en-GB, es-ES and pt-BR.
Bella's original af_bella V05 is deliberately excluded. No uploads, impersonation,
customer publishing, or automatic commercial licensing decisions.

  python voice-foundry-local-studio.py --check-only
  python voice-foundry-local-studio.py --port 8766
  # Open http://127.0.0.1:8766 on the SAME computer.

Public internet, router/LAN and tunnel binds are intentionally forbidden.
Do not reverse-proxy this prototype to the internet. Requires explicit
authentication, accounts, quotas and security review before remote deployment.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import threading
from urllib.parse import urlsplit
import wave

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "voice_foundry_workstation", HERE / "voice-foundry-workstation.py")
workstation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workstation)

PORT = 8766
MAX_POST_BYTES = 4096
MAX_JOBS_PER_SESSION = 40
MAX_PENDING = 3
JOB_ID_RE = re.compile(r"^[0-9a-f]{32}$")
AUDIO_FILES = {
    "preview.mp3": "previewMp3Sha256",
    "native.wav": "nativeWavSha256",
    "evidence.json": None,
}
MIME = {"preview.mp3": "audio/mpeg", "native.wav": "audio/wav",
        "evidence.json": "application/json; charset=utf-8"}


def validate_host(host):
    if host != "127.0.0.1":
        raise ValueError("LOCALHOST_ONLY_NO_LAN_OR_PUBLIC_BIND")
    return host


def file_sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def verified_receipt(folder, voice, script):
    folder = Path(folder)
    evidence_file = folder / "evidence.json"
    if not evidence_file.is_file() or evidence_file.stat().st_size > 50000:
        raise ValueError("MISSING_NATIVE_EVIDENCE")
    d = json.loads(evidence_file.read_text(encoding="utf-8"))
    if (d.get("schema") != workstation.SCHEMA or d.get("voiceInput") != voice
            or d.get("script") != script or d.get("productionReady") is not False
            or d.get("releaseAuthorized") is not False
            or d.get("bellaOriginalMasterUntouched") is not True
            or d.get("humanPronunciationApproved") is not False
            or d.get("genuineNativeSynthesis") is not True):
        raise ValueError("UNVERIFIED_VOICE_GENERATION_OR_RELEASE_STATE")
    for filename, digest_field in (("native.wav", "nativeWavSha256"),
                                   ("preview.mp3", "previewMp3Sha256")):
        if d.get("nativeWav" if filename.endswith("wav") else "previewMp3") != filename:
            raise ValueError("UNEXPECTED_OUTPUT_FILENAME")
        p = folder / filename
        if not p.is_file() or p.is_symlink() or p.stat().st_size > 40_000_000:
            raise ValueError("MISSING_OR_UNSAFE_AUDIO_FILE")
        if file_sha(p) != d.get(digest_field):
            raise ValueError("AUDIO_SHA256_MISMATCH")
    with wave.open(str(folder / "native.wav"), "rb") as w:
        if (w.getnchannels(), w.getsampwidth(), w.getframerate()) != (1, 2, 24000):
            raise ValueError("BAD_PCM_FORMAT")
        seconds = w.getnframes() / 24000
    if not (2 <= seconds <= 120 and abs(seconds-d["audioDurationSec"]) < 0.004):
        raise ValueError("BAD_PCM_DURATION")
    return {"durationSec": round(seconds, 3), "voice": voice,
            "language": d["resolvedProfile"]["language"],
            "status": "review_only", "releaseAuthorized": False}


class Studio:
    def __init__(self, directory, *, runner=None):
        root = Path(directory).expanduser().resolve()
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if not root.is_dir() or root.is_symlink():
            raise ValueError("UNSAFE_DATA_FOLDER")
        self.root = root
        self.runner = runner or self._default_runner
        self.csrf = secrets.token_urlsafe(32)
        self.csp_nonce = secrets.token_urlsafe(18)
        self.lock = threading.RLock()
        self.jobs = {}
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="voice-foundry")

    @staticmethod
    def _default_runner(voice, text_path, folder):
        p = subprocess.run(
            [sys.executable, str(HERE / "voice-foundry-workstation.py"),
             "--voice", voice, "--text-file", str(text_path), "--output", str(folder)],
            text=True, capture_output=True, timeout=360, check=False)
        if p.returncode:
            raise RuntimeError("NATIVE_WORKSTATION_RENDER_FAILED")

    def submit(self, voice, text):
        script, _ = workstation.validate(voice, text)
        with self.lock:
            pending = sum(j["state"] in ("queued", "rendering") for j in self.jobs.values())
            if pending >= MAX_PENDING or len(self.jobs) >= MAX_JOBS_PER_SESSION:
                raise OverflowError("PRIVATE_STUDIO_CAPACITY_REACHED")
            jobid = secrets.token_hex(16)
            self.jobs[jobid] = {"state": "queued", "voice": voice,
                                "details": None, "error": None}
        self.executor.submit(self._generate, jobid, voice, script)
        return jobid

    def _generate(self, jobid, voice, script):
        path = self.root / jobid
        text_file = self.root / (jobid + ".script.txt")
        try:
            with self.lock:
                self.jobs[jobid]["state"] = "rendering"
            with open(text_file, "x", encoding="utf-8") as f:
                os.chmod(text_file, 0o600)
                f.write(script)
            self.runner(voice, text_file, path)
            details = verified_receipt(path, voice, script)
            with self.lock:
                self.jobs[jobid]["details"] = details
                self.jobs[jobid]["state"] = "ready"
        except Exception:
            # Never reveal system paths, uploaded text, tracebacks or model logs
            # in the browser. Keep evidence on disk for local diagnostics only.
            with self.lock:
                self.jobs[jobid]["state"] = "failed"
                self.jobs[jobid]["error"] = "Render or verification failed. Check local operator logs."
        finally:
            text_file.unlink(missing_ok=True)

    def read_job(self, jobid):
        if not JOB_ID_RE.fullmatch(jobid):
            return None
        with self.lock:
            data = self.jobs.get(jobid)
            if data is None:
                return None
            return {"state": data["state"], "voice": data["voice"],
                    "details": data["details"], "error": data["error"]}

    def read_file(self, jobid, filename):
        if filename not in AUDIO_FILES or not JOB_ID_RE.fullmatch(jobid):
            return None
        if not self.read_job(jobid) or self.read_job(jobid)["state"] != "ready":
            return None
        folder = self.root / jobid
        if not folder.is_dir() or folder.is_symlink():
            return None
        try:
            receipt = json.loads((folder / "evidence.json").read_text())
            path = folder / filename
            if not path.is_file() or path.is_symlink():
                return None
            expected = AUDIO_FILES[filename]
            if expected is not None and file_sha(path) != receipt.get(expected):
                return None
            if path.stat().st_size > 40_000_000:
                return None
            return path.read_bytes()
        except (OSError, json.JSONDecodeError):
            return None

    def save_review(self, jobid, scores, notes, fluent):
        """Persist explicitly human ratings as a private claim, never release approval."""
        job = self.read_job(jobid)
        if job is None or job["state"] != "ready":
            raise ValueError("UNVERIFIED_REVIEW_JOB")
        axes = {"diction", "naturalness", "semantic_emphasis",
                "brand_pronunciation", "accent"}
        if (not isinstance(scores, dict) or set(scores) != axes
                or any(type(v) is not int or not 1 <= v <= 5
                       for v in scores.values())):
            raise ValueError("INVALID_REVIEW_RATINGS")
        if (not isinstance(notes, str) or len(notes) > 600
                or any(ord(c) < 32 and c not in "\n\t" for c in notes)):
            raise ValueError("INVALID_REVIEW_NOTES")
        if type(fluent) is not bool:
            raise ValueError("INVALID_LANGUAGE_FLUENCY_CLAIM")
        folder = self.root / jobid
        source = json.loads((folder / "evidence.json").read_text(encoding="utf8"))
        verified_receipt(folder, job["voice"], source["script"])
        review = {"schema": "evercraft.voice-foundry.private-listener-score.v1",
                  "jobId": jobid, "voice": job["voice"],
                  "sourceWavSha256": source["nativeWavSha256"],
                  "fluentInLanguageClaim": fluent,
                  "ratings": scores, "notes": notes,
                  "isHumanClaimNotAutomatedQA": True,
                  "commercialReleaseApproved": False, "productionApproved": False}
        temp = folder / ("review-" + secrets.token_hex(8) + ".tmp")
        try:
            with open(temp, "x", encoding="utf8") as fh:
                os.chmod(temp, 0o600)
                json.dump(review, fh, indent=2, ensure_ascii=False)
            os.replace(temp, folder / "private-review.json")
        finally:
            temp.unlink(missing_ok=True)
        return {"saved": True, "productionApproved": False}

    def shutdown(self):
        self.executor.shutdown(wait=False, cancel_futures=True)


class Handler(BaseHTTPRequestHandler):
    server: "VoiceServer"

    def log_message(self, fmt, *args):
        # Browser URLs can contain job tokens. Never log them in plaintext.
        pass

    def _same_host(self):
        host = self.headers.get("Host", "").lower()
        allowed = {
            f"127.0.0.1:{self.server.server_port}",
            f"localhost:{self.server.server_port}",
            f"[::1]:{self.server.server_port}",
        }
        try:
            client = ipaddress.ip_address(self.client_address[0])
        except ValueError:
            return False
        return host in allowed and client.is_loopback

    def _headers(self, code, content_type, length):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        nonce = self.server.studio.csp_nonce
        self.send_header("Content-Security-Policy",
                         "default-src 'none'; script-src 'nonce-"+nonce+
                         "'; style-src 'nonce-"+nonce+
                         "'; connect-src 'self'; media-src 'self'; "
                         "base-uri 'none'; object-src 'none'; frame-ancestors 'none'")
        self.end_headers()

    def send_body(self, code, raw, mime):
        self._headers(code, mime, len(raw))
        self.wfile.write(raw)

    def send_json(self, code, value):
        self.send_body(code, json.dumps(value, ensure_ascii=False).encode("utf-8"),
                       "application/json; charset=utf-8")

    def do_GET(self):
        if not self._same_host():
            return self.send_json(403, {"error": "LOCAL_ONLY"})
        url = urlsplit(self.path)
        if url.path == "/healthz":
            return self.send_json(200, {"state": "private_review", "public": False})
        if url.path == "/":
            page = PAGE.replace("@@NONCE@@", self.server.studio.csp_nonce).replace(
                "@@TOKEN@@", self.server.studio.csrf)
            return self.send_body(200, page.encode("utf-8"), "text/html; charset=utf-8")
        if url.path == "/api/voices":
            return self.send_json(200, {
                "catalog": workstation.catalog(),
                "languages": workstation.casting.LANGUAGES,
                "examples": workstation.casting.SCRIPTS,
                "releaseApproved": False,
            })
        parts = url.path.strip("/").split("/")
        if len(parts) >= 3 and parts[0:2] == ["api", "jobs"]:
            data = self.server.studio.read_job(parts[2])
            if data is None:
                return self.send_json(404, {"error": "NOT_FOUND"})
            if len(parts) == 3:
                return self.send_json(200, data)
            if len(parts) == 4 and parts[3] in AUDIO_FILES:
                contents = self.server.studio.read_file(parts[2], parts[3])
                if contents is not None:
                    return self.send_body(200, contents, MIME[parts[3]])
        return self.send_json(404, {"error": "NOT_FOUND"})

    def do_POST(self):
        if not self._same_host():
            return self.send_json(403, {"error": "LOCAL_ONLY"})
        origin = self.headers.get("Origin", "")
        allowed = {f"http://localhost:{self.server.server_port}",
                   f"http://127.0.0.1:{self.server.server_port}",
                   f"http://[::1]:{self.server.server_port}"}
        if origin not in allowed:
            return self.send_json(403, {"error": "CROSS_ORIGIN_BLOCKED"})
        if not secrets.compare_digest(
                self.headers.get("X-Voice-Foundry-Token", ""), self.server.studio.csrf):
            return self.send_json(403, {"error": "CSRF_DENIED"})
        path = urlsplit(self.path).path
        parts = path.strip("/").split("/")
        is_review = (len(parts) == 4 and parts[:2] == ["api", "jobs"]
                     and parts[3] == "review")
        if path != "/api/render" and not is_review:
            return self.send_json(404, {"error": "NOT_FOUND"})
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            return self.send_json(415, {"error": "JSON_REQUIRED"})
        try:
            n = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            return self.send_json(400, {"error": "INVALID_CONTENT_LENGTH"})
        if n < 2 or n > MAX_POST_BYTES:
            return self.send_json(413, {"error": "INPUT_TOO_LARGE"})
        try:
            data = json.loads(self.rfile.read(n))
            if not isinstance(data, dict):
                raise ValueError("INVALID_FIELDS")
            if is_review:
                if set(data) != {"scores", "notes", "fluent"}:
                    raise ValueError("INVALID_REVIEW_FIELDS")
                saved = self.server.studio.save_review(
                    parts[2], data["scores"], data["notes"], data["fluent"])
                return self.send_json(200, saved)
            if set(data) != {"voice", "script"}:
                raise ValueError("INVALID_FIELDS")
            jobid = self.server.studio.submit(data["voice"], data["script"])
        except (TypeError, ValueError, UnicodeDecodeError):
            return self.send_json(422, {"error": "INVALID_VOICE_OR_SCRIPT"})
        except OverflowError:
            return self.send_json(429, {"error": "REVIEW_QUEUE_FULL"})
        return self.send_json(202, {"jobId": jobid, "state": "queued"})


class VoiceServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, host, port, studio):
        validate_host(host)
        self.studio = studio
        super().__init__((host, port), Handler)


PAGE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Evercraft | Voice Foundry</title>
<style nonce="@@NONCE@@">
:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#171717;background:#faf9f8}
*{box-sizing:border-box}body{margin:0}header{background:#fff;border-bottom:1px solid #e7e3e3;padding:20px 6vw}
.logo{font-weight:850;letter-spacing:.15em;font-size:14px}.logo b{color:#a91133}
main{max-width:1000px;margin:0 auto;padding:40px 22px 70px}
.eyebrow{color:#9b1631;font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}
h1{font-size:clamp(34px,6vw,58px);letter-spacing:-.05em;margin:6px 0}p{line-height:1.55;color:#555}
.panel{border:1px solid #e5e0df;border-radius:18px;background:#fff;padding:26px;margin-top:24px;box-shadow:0 8px 28px #11111107}
label{display:block;font-size:13px;font-weight:700;margin:0 0 8px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.script-field{margin-top:22px}select,textarea{width:100%;background:#fff;color:#181818;border:1px solid #d4cbca;border-radius:10px;padding:13px;font:inherit}
textarea{min-height:190px;resize:vertical;margin:0}.notes{min-height:90px}button{background:#9f1230;color:#fff;border:0;padding:15px 24px;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer}
button:disabled{opacity:.55;cursor:wait}.row{display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap;margin-top:14px}
.muted{font-size:12px;color:#777}audio{width:100%;margin:18px 0}a{color:#98112d;font-weight:700;margin-right:20px}
.notice{border-radius:8px;padding:11px;background:#f6eef0;color:#84142e;font-weight:700;font-size:13px}
#result{display:none}.foot{font-size:12px;color:#777;margin-top:24px}
@media(max-width:650px){.grid{grid-template-columns:1fr}main{padding-top:25px}.panel{padding:19px}}
</style>
</head>
<body>
<header><div class="logo"><b>EVERCRAFT</b> / VOICE FOUNDRY</div></header>
<main>
<div class="eyebrow">Private studio · Native inference</div>
<h1>Find the voice<br>for the story.</h1>
<p>Write your script. Select a language and one of twelve voice profiles.
Hear the result using Evercraft's local Kokoro engine.</p>
<div class="panel">
  <div class="grid">
    <div><label for="language">Language</label><select id="language"></select></div>
    <div><label for="voice">Voice</label><select id="voice"></select></div>
  </div>
  <div class="script-field"><label for="script">Your script</label><textarea id="script" maxlength="1500" aria-describedby="scriptHelp"></textarea></div>
  <p id="scriptHelp" class="muted">20–1,500 characters. The voice's regional pronunciation is not certified.</p>
  <div class="row"><button id="render">Generate private audition</button>
    <span class="muted" id="progress" role="status" aria-live="polite">Ready to audition</span></div>
</div>
<div class="panel" id="result" aria-live="polite">
  <div class="eyebrow">Private listening room</div>
  <h2>Your take is ready.</h2>
  <audio controls id="player" preload="none"></audio>
  <div><a id="mp3" download="preview.mp3">Save MP3</a><a id="wav" download="native.wav">Save dry WAV</a></div>
  <p class="notice">Review only. Not cleared for public or commercial release.</p>
  <div id="review" class="script-field">
    <h3>Quality notes</h3>
    <p class="muted">Rate what you actually hear. A 5 is excellent. Your scores do not approve a release.</p>
    <div class="grid" id="ratings"></div>
    <label for="notes" class="script-field">Exact word and timecode notes</label>
    <textarea id="notes" maxlength="600" class="notes" placeholder="e.g., 0:08 Evercraft vowel sounds stretched"></textarea>
    <label class="script-field"><input type="checkbox" id="fluent"> I am fluent in the selected language</label>
    <button id="saveReview" type="button">Save private review</button>
    <p class="muted" id="reviewStatus" role="status"></p>
  </div>
</div>
<p class="foot">All processing runs on this computer. No public access, voice cloning, uploads,
or automatic publication. Bella V05 stays protected in its separate approved-reference lab.
This local-only prototype is not accessible from an iPhone on another device.</p>
</main>
<script nonce="@@NONCE@@">
"use strict";
const token="@@TOKEN@@", lang=document.getElementById("language"),
voice=document.getElementById("voice"), script=document.getElementById("script"),
button=document.getElementById("render"), progress=document.getElementById("progress"),
result=document.getElementById("result"), player=document.getElementById("player");
let catalog={}, examples={}, currentJobId=null;
const axes=[
  ["diction","Clear diction"],
  ["naturalness","Natural delivery"],
  ["semantic_emphasis","Emphasis follows meaning"],
  ["brand_pronunciation","Brand pronunciation"],
  ["accent","Accent authenticity"]
];
const ratings=document.getElementById("ratings");
for(const [key,label] of axes){
  const box=document.createElement("div");
  const lab=document.createElement("label");lab.textContent=label;
  const pick=document.createElement("select");pick.dataset.axis=key;
  for(let n=1;n<=5;n++){const o=document.createElement("option");o.value=String(n);o.textContent=String(n)+" / 5";pick.append(o);}
  pick.value="3";box.append(lab,pick);ratings.append(box);
}
function loadVoices(){
  const chosen=lang.value;
  voice.replaceChildren();
  for(const [id,entry] of Object.entries(catalog)){
    if(entry.language!==chosen)continue;
    const option=document.createElement("option");
    option.value=id;
    option.textContent=(entry.kind==="derivedTwoPackBlend"?"Original blend · ":"Model voice · ")+id;
    voice.append(option);
  }
  script.value=examples[chosen]||"";
  result.style.display="none";
}
async function initialize(){
  try{
    const data=await (await fetch("/api/voices")).json();
    catalog=data.catalog; examples=data.examples;
    for(const [locale,record] of Object.entries(data.languages)){
      const option=document.createElement("option");
      option.value=locale;option.textContent=record.name;lang.append(option);
    }
    lang.value="en-US";loadVoices();
  }catch(e){progress.textContent="Voice catalog unavailable."}
}
lang.addEventListener("change",loadVoices);
button.addEventListener("click",async()=>{
  if(button.disabled)return;
  button.disabled=true;result.style.display="none";
  progress.textContent="Submitting your private audition…";
  try{
    const req=await fetch("/api/render",{method:"POST",
      headers:{"Content-Type":"application/json","X-Voice-Foundry-Token":token},
      body:JSON.stringify({voice:voice.value,script:script.value})});
    if(!req.ok){throw Error("Please check the selected voice, text length or queue capacity.");}
    const created=await req.json();
    const id=created.jobId;
    for(let i=0;i<360;i++){
      const r=await fetch("/api/jobs/"+id);
      if(!r.ok)throw Error("Private review job unavailable.");
      const job=await r.json();
      if(job.state==="failed")throw Error("Voice render failed. Inspect local operator logs.");
      if(job.state==="ready"){
        currentJobId=id;
        const base="/api/jobs/"+id+"/";
        player.src=base+"preview.mp3";
        document.getElementById("mp3").href=base+"preview.mp3";
        document.getElementById("wav").href=base+"native.wav";
        result.style.display="block";
        progress.textContent="Verified native audio. Review before release.";
        return;
      }
      progress.textContent="Rendering: "+job.state+"…";
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    throw Error("Review is still processing. Try again later.");
  }catch(e){progress.textContent=e.message}
  finally{button.disabled=false}
});
document.getElementById("saveReview").addEventListener("click",async()=>{
  if(!currentJobId)return;
  const scores={};
  ratings.querySelectorAll("select").forEach(x=>scores[x.dataset.axis]=Number(x.value));
  const notes=document.getElementById("notes").value;
  const fluent=document.getElementById("fluent").checked;
  const status=document.getElementById("reviewStatus");
  try{
    const response=await fetch("/api/jobs/"+currentJobId+"/review",{
      method:"POST",headers:{"Content-Type":"application/json","X-Voice-Foundry-Token":token},
      body:JSON.stringify({scores,notes,fluent})
    });
    if(!response.ok)throw Error("Review could not be saved.");
    status.textContent="Private listening notes saved. No public release approval was issued.";
  }catch(e){status.textContent=e.message}
});
initialize();
</script>
</body></html>
"""


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--check-only", action="store_true")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=PORT)
    p.add_argument("--data-dir",
                   default=str(Path.home() / ".local/share/evercraft/voice-foundry/reviews"))
    args=p.parse_args()
    validate_host(args.host)
    if not (1 <= args.port <= 65535):
        p.error("Invalid TCP port")
    if args.check_only:
        print(json.dumps({"localhostOnly": True, "supportedVoices": len(workstation.catalog()),
                          "public": False, "releaseApproved": False}))
        return
    studio = Studio(args.data_dir)
    try:
        with VoiceServer(args.host, args.port, studio) as server:
            print(f"Evercraft Voice Foundry private review: http://127.0.0.1:{args.port}")
            print("Local computer only; do not expose this server publicly.")
            server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        studio.shutdown()


if __name__=="__main__":
    main()
