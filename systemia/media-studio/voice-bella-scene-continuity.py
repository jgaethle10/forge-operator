#!/usr/bin/env python3
"""Bella Scene Continuity: one complete native performance vs stitched scene beats.

This deliberately tests ONE structural question: does rendering three intentional
thought blocks help magnetic, warm commercial narration versus a full continuous
read? Gap lengths are compared without resynthesizing the blocks. All text stays
exact, original Kokoro 0.9.4 af_bella. REVIEW ONLY, not emotionally conditioned.
"""
import hashlib
import html
import json
import pathlib
import re
import subprocess
import sys
import wave

VOICE = "af_bella"
SEED = 1701
SR = 24000
SCENES = (
    "You know that moment when everything begins to make sense. "
    "The noise falls away. The next step becomes clear.",
    "And suddenly, you can see where this could go. "
    "That's what we're building at Evercraft.",
    "Something worth paying attention to. "
    "Something you'll want to come back to.",
)
FULL = " ".join(SCENES)
TAKES = (
    ("segmented", 0.14),
    ("continuous", 0.00),
    ("segmented", 0.26),
)
AXES = ("magnetism", "naturalness", "warmth", "sentence_flow", "ending", "bella_identity")
FADE_MS = 8
SPEED = 1.0


def words(text):
    return re.findall(r"[a-z]+(?:'[a-z]+)?", text.casefold())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify():
    assert len(SCENES) == 3 and len(FULL.split()) >= 45
    assert words(FULL) == [w for part in SCENES for w in words(part)]
    assert set(TAKES) == {("continuous", 0.0), ("segmented", 0.14), ("segmented", 0.26)}
    assert all("—" not in t and "–" not in t for t in SCENES)
    assert VOICE == "af_bella" and SR == 24000
    print("PASS: word-locked Bella continuous-vs-beat continuity experiment")


def ensure_sound(x, np):
    if x.ndim != 1 or len(x) < SR or not np.all(np.isfinite(x)):
        raise RuntimeError("BAD_NATIVE_SOUND")
    if np.max(np.abs(x)) >= 1.0:
        raise RuntimeError("SPEECH_CLIPPING")
    return x


def pcm_meta(path):
    with wave.open(str(path), "rb") as f:
        if (f.getnchannels(), f.getsampwidth(), f.getframerate()) != (1, 2, SR):
            raise RuntimeError("PCM_FORMAT_INCORRECT")
        duration = f.getnframes()/SR
    if not 8.0 < duration < 40:
        raise RuntimeError("VOICE_DURATION_FAILED")
    return round(duration, 3)


def tapered(block, np):
    out = np.array(block, dtype=np.float32, copy=True)
    n = int(SR*FADE_MS/1000)
    if len(out) <= 2*n:
        raise RuntimeError("BLOCK_TOO_SHORT_FOR_CLICK_SAFE_EDGE")
    out[:n] *= np.linspace(0., 1., n, dtype=np.float32)
    out[-n:] *= np.linspace(1., 0., n, dtype=np.float32)
    return out


def stitched(parts, gap_sec, np):
    if gap_sec not in (0.14, 0.26):
        raise RuntimeError("UNAPPROVED_GAP")
    silent = np.zeros(round(SR*gap_sec), dtype=np.float32)
    return np.concatenate([
        tapered(parts[0], np), silent,
        tapered(parts[1], np), silent,
        tapered(parts[2], np),
    ])


def room():
    players = []
    for i in range(1, 4):
        fields = "".join(
            f'<label>{html.escape(axis.replace("_"," "))} '
            f'<input data-score="{axis}" type="number" min="1" max="5" step="1" '
            f'inputmode="numeric" required></label>'
            for axis in AXES
        )
        players.append(
            f'<section data-take="{i}"><h2>Take {i}</h2>'
            f'<audio controls preload="none" src="take-{i:02d}.mp3"></audio>'
            f'<div class="scores">{fields}</div>'
            '<label>Where did Bella pull you in, or break the illusion? '
            '<textarea placeholder="Timecode and phrase" rows="2"></textarea></label></section>'
        )
    return """<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bella Scene Continuity | Private audition</title>
<style>
body{font:16px/1.5 system-ui;background:#161821;color:#eee;max-width:740px;
margin:2rem auto;padding:0 1rem}section{padding:1.2rem;border:1px solid #626b79;
border-radius:12px;margin:1rem 0}audio{width:100%}
.scores{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
input,textarea{display:block;padding:9px;background:#242733;color:#fff;
border:1px solid #808898;border-radius:5px}input{width:65px}textarea{width:90%}
button{padding:12px;border-radius:7px}
</style>
<h1>Bella, across the whole scene</h1>
<p>Three original Bella readings, all with precisely the same words.
Compare confidence, intimacy and scene continuity. All audio is from the native
af_bella identity; there is no emotional model control, artificial breath or pitch shift.
Listen before opening the separate evidence.json to reveal conditions.</p>
<p><strong>Original text:</strong> """ + html.escape(FULL) + "</p>" + "".join(players) + """
<button id="save">Export private ratings</button><p id="message" role="status"></p>
<script>
document.getElementById("save").addEventListener("click",()=>{
 const entries=[...document.querySelectorAll("section")].map(section=>{
  const scores={};section.querySelectorAll("input").forEach(x=>scores[x.dataset.score]=Number(x.value));
  return {take:Number(section.dataset.take),scores,notes:section.querySelector("textarea").value};
 });
 if(entries.some(x=>Object.values(x.scores).some(n=>!Number.isInteger(n)||n<1||n>5))){
  document.getElementById("message").textContent="Rate all six dimensions for all takes.";
  return;
 }
 const record={schema:"evercraft.bella.scene-continuity.reviewer-claim.v1",
  status:"UNVERIFIED_PERSONAL_REVIEW",publicationApproved:false,entries};
 const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:"application/json"}));
 const a=document.createElement("a");a.href=url;a.download="bella-scene-listening.json";
 a.click();URL.revokeObjectURL(url);
 document.getElementById("message").textContent="Private scores saved locally.";
});
</script></html>"""


def generate(folder):
    verify()
    import torch
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    root = pathlib.Path(folder)
    root.mkdir(parents=True, exist_ok=False)
    raw = root/"original-dry"
    raw.mkdir()
    pipeline = KPipeline(lang_code="a")

    def speak(text, seed):
        torch.manual_seed(seed)
        np.random.seed(seed)
        chunks = [np.asarray(item.audio, dtype=np.float32)
                  for item in pipeline(text, voice=VOICE, speed=SPEED)]
        if not chunks:
            raise RuntimeError("NO_NATIVE_VOICE")
        return ensure_sound(np.concatenate(chunks), np)

    full = speak(FULL, SEED)
    blocks = [speak(t, SEED+i) for i,t in enumerate(SCENES)]
    dry = {}
    for key, audio in [("continuous",full)]+[(f"beat-{i+1}",a) for i,a in enumerate(blocks)]:
        file = raw/f"{key}.wav"
        sf.write(file, audio, SR, subtype="PCM_16")
        dry[key] = {"filename":str(file.relative_to(root)), "sha256":digest(file),
                    "durationSec":pcm_meta(file)}
    results = []
    for i, (mode, gap) in enumerate(TAKES,1):
        sound = full.copy() if mode == "continuous" else stitched(blocks, gap, np)
        if not np.all(np.isfinite(sound)) or np.max(np.abs(sound))>=1:
            raise RuntimeError("UNSAFE_STITCH")
        wav = root/f"take-{i:02d}.wav"
        mp3 = root/f"take-{i:02d}.mp3"
        sf.write(wav, sound, SR, subtype="PCM_16")
        duration = pcm_meta(wav)
        cmd = ["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-n",
               "-i",str(wav),"-af","aresample=48000,loudnorm=I=-19:TP=-2:LRA=10",
               "-c:a","libmp3lame","-q:a","2",str(mp3)]
        out = subprocess.run(cmd,capture_output=True,text=True,timeout=90)
        if out.returncode or not mp3.is_file() or mp3.stat().st_size<9000:
            raise RuntimeError("FAILED_AUDITION_MP3 "+out.stderr[-300:])
        results.append({"take":i,"mode":mode,"interBeatGapSec":gap,
                        "fadeMs":FADE_MS if mode=="segmented" else 0,
                        "sameWords":True,"wav":wav.name,"wavSha256":digest(wav),
                        "mp3":mp3.name,"mp3Sha256":digest(mp3),
                        "durationSec":duration})
    receipt={"schema":"evercraft.voice.bella.scene-continuity.v1",
             "voiceId":VOICE,"model":"Kokoro-82M","version":"0.9.4",
             "originalNativeVoice":True,
             "lockedSpeech":FULL,"sameSpokenWords":True,
             "oneContinuousNativeRender":True,"independentBeatNativeRenders":3,
             "gapsAloneDifferBetweenSegmentedCandidates":True,
             "segmentedVsContinuousAlsoChangesGeneratorContextAndSeeds":True,
             "emotionalConditioningVerified":False,
             "phonemeOverrides":False,"voiceCloning":False,
             "pitchEffects":False,"fabricatedBreaths":False,
             "humanListeningApproved":False,"commercialRightsVerified":False,
             "productionReady":False,
             "originalDry":dry,"takes":results}
    (root/"evidence.json").write_text(json.dumps(receipt,indent=2)+"\n")
    (root/"index.html").write_text(room(),encoding="utf8")
    print(json.dumps({"status":"SCENE_CONTINUITY_REVIEW_ONLY",
                      "candidateCount":len(results),
                      "durations":[x["durationSec"] for x in results]},indent=2))


if __name__ == "__main__":
    if len(sys.argv)==2 and sys.argv[1]=="--verify-only":
        verify()
    elif len(sys.argv)==2:
        generate(sys.argv[1])
    else:
        raise SystemExit("Usage: voice-bella-scene-continuity.py NEW_EMPTY_DIR|--verify-only")
