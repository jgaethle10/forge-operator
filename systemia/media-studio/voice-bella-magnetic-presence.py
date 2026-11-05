#!/usr/bin/env python3
"""Bella Magnetic Presence Lab: audio-first, review-only commercial voice direction.

2 punctuation patterns x 2 native Kokoro speeds x 2 listening chains.
This is an *audition*, not emotional conditioning, training or voice replacement.
Keep the original af_bella voice. No clone, IPA surgery, pitch shift or fake breaths.
"""
from __future__ import annotations

import hashlib
import html
import json
import pathlib
import re
import subprocess
import sys
import wave

VOICE = "af_bella"
SR = 24000
SEED = 1701
BASE = (
    "You know that moment when everything begins to make sense. "
    "The noise falls away. The next step becomes clear. "
    "And suddenly, you can see where this could go. "
    "That's what we're building at Evercraft. "
    "Something worth paying attention to. Something you'll want to come back to."
)
CONNECTED = (
    "You know that moment when everything begins to make sense? "
    "The noise falls away... the next step becomes clear, "
    "and suddenly, you can see where this could go. "
    "That's what we're building at Evercraft: "
    "something worth paying attention to. Something you'll want to come back to."
)
PUNCTUATION = {"original": BASE, "connected": CONNECTED}
SPEEDS = {"native": 1.0, "patient": .98}
MIXES = ("neutral", "nearfield")
# One render per unique native text/speed. Post-mix audio does not trigger resynthesis.
# The map is deliberately not in the listening room.
BLIND = (
    ("connected", "patient", "nearfield"),
    ("original", "native", "neutral"),
    ("connected", "patient", "neutral"),
    ("original", "native", "nearfield"),
    ("original", "patient", "neutral"),
    ("connected", "native", "nearfield"),
    ("original", "patient", "nearfield"),
    ("connected", "native", "neutral"),
)
AXES = (
    "magnetism",
    "warmth",
    "naturalness",
    "trustworthiness",
    "phrase_endings",
    "bella_identity",
)


def tokens(s: str):
    return re.findall(r"[a-z]+(?:'[a-z]+)?", s.lower())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check():
    assert set(PUNCTUATION) == {"original", "connected"}
    assert tokens(BASE) == tokens(CONNECTED), "Spoken dialogue must be IDENTICAL"
    assert len(tokens(BASE)) >= 45
    assert SPEEDS == {"native": 1.0, "patient": .98}
    assert len(BLIND) == len(set(BLIND)) == 8
    assert set(BLIND) == {(p, s, m) for p in PUNCTUATION for s in SPEEDS for m in MIXES}
    assert all("—" not in s and "–" not in s for s in PUNCTUATION.values())
    print("PASS: original Bella, fixed words, native cadence x studio proximity factorial audition")


def exec_cmd(args):
    p = subprocess.run(args, check=False, capture_output=True, text=True, timeout=90)
    if p.returncode:
        raise RuntimeError("FFMPEG_FAILED: " + p.stderr[-500:])
    return p


def wav_metrics(path):
    with wave.open(str(path), "rb") as f:
        channels, width, rate, frames = f.getnchannels(), f.getsampwidth(), f.getframerate(), f.getnframes()
    if (channels, width, rate) != (1, 2, 48000):
        raise RuntimeError("BAD_REVIEW_WAV_FORMAT")
    sec = frames / rate
    if not 12 <= sec <= 40:
        raise RuntimeError(f"BAD_REVIEW_DURATION: {sec}")
    return {"durationSec": round(sec, 3), "sampleRate": rate, "channels": channels}


def room():
    units = []
    for i in range(1, 9):
        scale = "".join(
            f'<label>{html.escape(axis.replace("_"," "))}: '
            f'<input type="number" min="1" max="5" step="1" inputmode="numeric" '
            f'data-dimension="{axis}" required></label>' for axis in AXES
        )
        units.append(
            f'<section class="take" data-take="{i}"><h2>Take {i:02d}</h2>'
            f'<audio controls preload="none" src="take-{i:02d}.mp3"></audio>'
            f'<div class="ratings">{scale}</div>'
            f'<label>What made you lean in, or broke the spell? '
            f'<textarea rows="2" placeholder="At 0:14..."></textarea></label></section>'
        )
    return """<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bella | Magnetic Presence blind review</title>
<style>body{font:16px/1.5 system-ui;background:#141620;color:#f3efe8;max-width:900px;
margin:2rem auto;padding:0 1rem}section{padding:1.1rem;border:1px solid #5e6574;
border-radius:12px;margin:1rem 0}audio{width:100%}.ratings{display:grid;
grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}
label{display:block}input,textarea{background:#222935;color:#fff;border:1px solid #889;
padding:8px;border-radius:6px;display:block}input{width:70px}textarea{width:95%}
button{padding:12px;margin:14px 0;border-radius:8px}
</style>
<h1>Bella: Magnetic Presence</h1>
<p>Same words. Same original voice. Four source performances with two listening
treatments. Listen on headphones at comfortable volume, and score first.
The goal is confident, inviting, subtly intimate storytelling: never a fake
whisper, exaggerated breath or artificial radio-announcer flirtation.</p>
<p><strong>Locked words:</strong> """ + html.escape(BASE) + "</p>" + "".join(units) + """
<button id="export">Download private listening scorecard</button>
<p id="state" role="status"></p><small>Human scores are opinions, not verified reviews,
release rights, or commercial authorization. Controls are disclosed in evidence.json
only after rating. Local browser download; no remote submission.</small>
<script>
document.getElementById('export').addEventListener('click',()=>{
 const scores=[...document.querySelectorAll('.take')].map(el=>{
  const dimensions={}, inputs=[...el.querySelectorAll('input')];
  inputs.forEach(input=>dimensions[input.dataset.dimension]=Number(input.value));
  return {take:Number(el.dataset.take),scores:dimensions,
    notes:el.querySelector('textarea').value};
 });
 if(scores.some(x=>Object.values(x.scores).some(n=>!Number.isInteger(n)||n<1||n>5))){
   document.getElementById('state').textContent='Score all six qualities for all eight takes.';
   return;
 }
 const data={schema:'evercraft.voice.bella-magnetic.listener-claim.v1',
   reviewOnly:true,independentListeningVerified:false,productionApproved:false,takes:scores};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='bella-magnetic-listener.json';
 a.click();URL.revokeObjectURL(url);
 document.getElementById('state').textContent='Saved locally. You can now reveal conditions in evidence.json.';
});
</script></html>"""


def generate(output):
    check()
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline

    root = pathlib.Path(output)
    root.mkdir(parents=True, exist_ok=False)
    originals = root / "dry-native"
    originals.mkdir()
    pipeline = KPipeline(lang_code="a")
    native = {}
    for p, script in PUNCTUATION.items():
        for name, speed in SPEEDS.items():
            torch.manual_seed(SEED)
            np.random.seed(SEED)
            chunks = [np.asarray(result.audio, dtype=np.float32)
                      for result in pipeline(script, voice=VOICE, speed=speed)]
            if not chunks:
                raise RuntimeError("EMPTY_NATIVE_OUTPUT")
            audio = np.concatenate(chunks)
            if audio.ndim != 1 or not np.all(np.isfinite(audio)) or np.max(np.abs(audio)) >= 1:
                raise RuntimeError("BAD_NATIVE_AUDIO")
            f = originals / f"{p}-{name}.wav"
            sf.write(f, audio, SR, subtype="PCM_16")
            native[(p,name)] = {"file": f, "sha256": sha(f), "sampleRate": SR,
                                "durationSec": round(len(audio) / SR, 3)}
    takes = []
    for i, (p, speed, mix) in enumerate(BLIND, start=1):
        raw = native[(p, speed)]
        file = root / f"take-{i:02d}.wav"
        mp3 = root / f"take-{i:02d}.mp3"
        # Both branches use the SAME audio loudness target for fair-ish comparisons.
        # "Nearfield" is only modest spectral shaping and gentle dynamics, no new voice.
        base = "aresample=48000,highpass=f=65"
        if mix == "nearfield":
            base += (",equalizer=f=220:t=q:w=1:g=1.0"
                     ",equalizer=f=4200:t=q:w=1:g=-0.7"
                     ",acompressor=threshold=0.16:ratio=1.35:attack=20:release=220:makeup=1")
        base += ",loudnorm=I=-19:TP=-2:LRA=10"
        exec_cmd(["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-n",
                  "-i",str(raw["file"]),"-af",base,"-ar","48000","-ac","1",
                  "-c:a","pcm_s16le",str(file)])
        metrics = wav_metrics(file)
        exec_cmd(["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-n",
                  "-i",str(file),"-c:a","libmp3lame","-q:a","2",str(mp3)])
        if not mp3.is_file() or mp3.stat().st_size < 10000:
            raise RuntimeError("NO_LISTENING_MP3")
        takes.append({
            "take":i,"punctuation":p,"speed":SPEEDS[speed],"mix":mix,
            "script":PUNCTUATION[p],"nativeDryFile":str(raw["file"].relative_to(root)),
            "nativeDrySha256":raw["sha256"],
            "reviewWav":file.name,"reviewWavSha256":sha(file),
            "reviewMp3":mp3.name,"reviewMp3Sha256":sha(mp3),
            "metrics":metrics,
        })
    receipt = {
        "schema":"evercraft.bella.magnetic-presence-audition.v1",
        "model":"Kokoro-82M","version":"0.9.4","voiceId":VOICE,
        "originalNativeVoice":True,"sameSpokenWords":True,
        "editorialGoal":"intimate, magnetic, confident commercial narration",
        "actualEmotionalConditioning":False,"phonemeOverrides":False,
        "pitchShift":False,"voiceCloning":False,"fabricatedBreaths":False,
        "postProductionOnReviewOnly":True,"targetLufs":-19,
        "loudnessMatchedIndependentlyMeasured":False,
        "modelCheckpointPinned":False,"voiceRightsIndependentlyCleared":False,
        "humanPerformanceApproved":False,"productionReleased":False,
        "sourceModels": [{"script":p,"speed":SPEEDS[s],
                          "file":str(item["file"].relative_to(root)),
                          "sha256":item["sha256"]}
                         for (p,s),item in native.items()],
        "takes":takes,
    }
    (root/"evidence.json").write_text(json.dumps(receipt,indent=2)+"\n")
    (root/"index.html").write_text(room())
    print(json.dumps({"result":"PRIVATE_NEURAL_BELLA_AUDITION",
                      "nativeRenders":len(native),"reviewTakes":len(takes),
                      "release":False},indent=2))


if __name__ == "__main__":
    if len(sys.argv)==2 and sys.argv[1]=="--verify-only":
        check()
    elif len(sys.argv)==2:
        generate(sys.argv[1])
    else:
        raise SystemExit("Usage: voice-bella-magnetic-presence.py NEW_OUTPUT_FOLDER|--verify-only")
