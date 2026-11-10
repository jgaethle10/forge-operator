#!/usr/bin/env python3
"""Bella semantic endings R&D: natural content-word endings vs dangling 'to'.

Real original Kokoro-82M 0.9.4 af_bella with two intentional script versions.
No claim that the *words* match; this is a COPY intervention, not an isolated
model change. No phoneme overrides, pitch shifts or cloned voices. REVIEW ONLY.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import pathlib
import re
import subprocess
import wave

VOICE = "af_bella"
SEED = 1701
SR = 24000
G2P_BASELINE_SHA256 = "b609c9bb842a59167dd2eb0319d3e9cabfce0ccdc56a060ef71e456581dac70d"
PREFIX = (
    "You know that moment when everything begins to make sense. "
    "The noise falls away. The next step becomes clear. "
    "And suddenly, you can see where this could go. "
    "That's what we're building at Evercraft. "
)
ORIGINAL = PREFIX + (
    "Something worth paying attention to. "
    "Something you'll want to come back to."
)
REVISION = PREFIX + (
    "Something worth your attention. "
    "Something you'll want to revisit."
)
COPIES = {"original": ORIGINAL, "meaningful_endings": REVISION}
SCHEMA = "evercraft.bella.semantic-endings-private.v1"


def words(s):
    return re.findall(r"[a-z]+(?:'[a-z]+)?", s.casefold())


def digest_bytes(b):
    return hashlib.sha256(b).hexdigest()


def preflight():
    if not ORIGINAL.startswith(PREFIX) or not REVISION.startswith(PREFIX):
        raise ValueError("SPOKEN_PREFIX_CHANGED")
    if ORIGINAL == REVISION or len(words(ORIGINAL)) < 40 or len(words(REVISION)) < 35:
        raise ValueError("SCRIPTS_NOT_DISTINCT_OR_TOO_SHORT")
    if words(PREFIX) != words(ORIGINAL)[:len(words(PREFIX))]:
        raise ValueError("BASE_PREFIX_DRIFT")
    if words(PREFIX) != words(REVISION)[:len(words(PREFIX))]:
        raise ValueError("REVISION_PREFIX_DRIFT")
    if words(ORIGINAL)[-1] != "to" or words(REVISION)[-1] != "revisit":
        raise ValueError("ENDING_INTERVENTION_NOT_PRESENT")
    if words(REVISION)[-5:] != ["attention", "something", "you'll", "want", "to", "revisit"][-5:]:
        # Don't infer anything from similar word counts; check exact suffix instead.
        raise ValueError("REVISION_SUFFIX_CHANGED")
    if VOICE != "af_bella":
        raise ValueError("VOICE_ID_DRIFT")
    print("PASS: same native Bella, fixed prefix, intentional copy-only endings change")


def measure(result, label, script, path):
    import numpy as np
    import soundfile as sf
    audio = result.audio.detach().float().cpu().numpy()
    if audio.ndim != 1 or not np.isfinite(audio).all() or float(np.max(np.abs(audio))) >= 1:
        raise RuntimeError("INVALID_NATIVE_WAVEFORM")
    if not (10 <= len(audio)/SR <= 25):
        raise RuntimeError("INVALID_NATIVE_DURATION")
    # Enforce identical words for the unchanged prefix, not for revised endings.
    if words(result.graphemes) != words(script):
        raise RuntimeError("MODEL_SPOKEN_WORD_COVERAGE_FAILED")
    ps = result.phonemes
    if label == "original" and digest_bytes(ps.encode("utf8")) != G2P_BASELINE_SHA256:
        raise RuntimeError("ORIGINAL_G2P_CHANGED")
    sf.write(str(path),audio,SR,subtype="PCM_16")
    with wave.open(str(path),"rb") as f:
        if (f.getnchannels(),f.getsampwidth(),f.getframerate()) != (1,2,SR):
            raise RuntimeError("BAD_NATIVE_WAV")
        native_sec = f.getnframes()/SR
    record = {"script":script,"scriptSha256":digest_bytes(script.encode("utf8")),
              "phonemesSha256":digest_bytes(ps.encode("utf8")),
              "wav":path.name,"wavSha256":digest_bytes(path.read_bytes()),
              "audioDurationSec":round(native_sec,3), "referenceIsUnmodified":True,
              "wordCount":len(words(script)),
              "words":[],
              "nativeWordTimeProvenance":"KPipeline MToken.start_ts/end_ts; not independent ASR"}
    for tok in result.tokens or []:
        normalized=words(str(tok.text))
        if not normalized:
            continue
        start=getattr(tok,"start_ts",None);end=getattr(tok,"end_ts",None)
        valid = (isinstance(start,(int,float)) and isinstance(end,(int,float))
                 and 0<=start<end<=native_sec+.25)
        record["words"].append({"text":str(tok.text),"normalized":normalized,
             "startSec":round(start,3) if valid else None,
             "endSec":round(end,3) if valid else None,
             "durationSec":round(end-start,3) if valid else None})
    record["exactWordCoverage"] = (
        [w for t in record["words"] for w in t["normalized"]] == words(script))
    record["nativeTimingUsable"] = (
        record["exactWordCoverage"] and all(t["durationSec"] is not None for t in record["words"]))
    if not record["nativeTimingUsable"]:
        raise RuntimeError("MODEL_WORD_TIMING_NOT_AVAILABLE")
    return record


def review_page():
    blocks = []
    for label in ("A","B"):
        blocks.append(
            f'<section><h2>Take {label}</h2><audio preload="none" controls '
            f'src="take-{label}.mp3"></audio><label>Clarity <input type="number" '
            f'min="1" max="5" data-axis="clarity" required></label>'
            f'<label>Natural emphasis <input type="number" min="1" max="5" '
            f'data-axis="emphasis" required></label>'
            f'<label>Vowel endings <input type="number" min="1" max="5" '
            f'data-axis="endings" required></label>'
            f'<label>Bella identity <input type="number" min="1" max="5" '
            f'data-axis="identity" required></label><label>Heard defects '
            f'<textarea placeholder="Exact word and timecode" rows="2"></textarea></label></section>'
        )
    return ("""<!doctype html><html lang="en"><meta charset="utf-8"><meta
name="viewport" content="width=device-width, initial-scale=1">
<title>Bella | Meaningful Endings blind review</title>
<style>body{font:16px/1.5 system-ui;max-width:740px;margin:auto;padding:20px;
background:#151821;color:#f4f0ec}section{border:1px solid #555c65;
border-radius:12px;padding:17px;margin:16px 0}audio{width:100%}
label{display:block;margin:10px 0}input,textarea{background:#242832;color:white;
padding:8px;border:1px solid #79808e;border-radius:6px}input{width:70px}
textarea{display:block;width:90%}button{padding:12px}</style>
<h1>Bella | Where the sentence lands</h1>
<p>Two original-voice readings. The first five sentences are unchanged.
The last two sentences intentionally use different words to avoid hanging
on a final "to." This is not a same-words test.
Rate clarity and naturalness before revealing which copy is which.</p>"""
        + "".join(blocks)
        + """<button id="export">Export private ratings</button>
<p id="status" role="status"></p>
<script>
document.getElementById('export').onclick=()=>{
 const reviews=[...document.querySelectorAll('section')].map((s,i)=>{
  const scores={};s.querySelectorAll('input').forEach(n=>scores[n.dataset.axis]=Number(n.value));
  return {blindTake:i===0?'A':'B',scores,notes:s.querySelector('textarea').value};
 });
 if(reviews.some(r=>Object.values(r.scores).some(n=>!Number.isInteger(n)||n<1||n>5))){
  document.getElementById('status').textContent='Rate every dimension first.';return;
 }
 const data={schema:'evercraft.bella.semantic-endings.listener-claim.v1',
   producerVerified:false,publicationApproved:false,reviews};
 const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=u;a.download='bella-endings-review.json';a.click();
 document.getElementById('status').textContent='Review downloaded locally.';
 setTimeout(()=>URL.revokeObjectURL(u),5000);
};
</script><p>Private audition only. No automatic release or voice change.</p></html>""")


def generate(dest):
    preflight()
    root=pathlib.Path(dest)
    if root.exists():
        raise FileExistsError("OUTPUT_ALREADY_EXISTS")
    import numpy as np
    import torch
    from kokoro import KPipeline
    pipeline=KPipeline(lang_code="a")
    root.mkdir(parents=True,exist_ok=False)
    source={}
    for label,script in COPIES.items():
        torch.manual_seed(SEED)
        np.random.seed(SEED)
        results=list(pipeline(script,voice=VOICE,speed=1.0))
        if len(results)!=1:
            raise RuntimeError("UNEXPECTED_CHUNKING")
        record=measure(results[0],label,script,root/(label+".wav"))
        source[label]=record
    # Fixed blind order, but do not leak copy assignment inside the HTML.
    order={"A":"meaningful_endings","B":"original"}
    for a,label in order.items():
        mp3=root/f"take-{a}.mp3"
        process=subprocess.run(
            ["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-n",
             "-i",str(root/(label+".wav")),"-af","loudnorm=I=-19:TP=-2:LRA=10",
             "-c:a","libmp3lame","-q:a","2",str(mp3)],
            check=True,capture_output=True,timeout=90)
        if not mp3.is_file() or mp3.stat().st_size<10000:
            raise RuntimeError("NO_PRIVATE_REVIEW_MP3")
        source[label]["reviewMp3"]=mp3.name
        source[label]["reviewMp3Sha256"]=digest_bytes(mp3.read_bytes())
    evidence={
        "schema":SCHEMA,"voiceId":VOICE,"kokoroVersion":"0.9.4",
        "sameSourceVoice":True,"sameSeed":True,"sameModelSpeed":True,
        "sameOpeningWords":True, "closingWordsIntentionallyRewritten":True,
        "evidenceOnly":True,"humanQualityApproved":False,
        "productionApproved":False,"commercialRightsIndependentlyVerified":False,
        "phonemeOverridesApplied":False,"timeStretchingApplied":False,
        "voiceCloningPerformed":False,
        "source":source,"blindConditionMap":order}
    (root/"evidence.json").write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+"\n")
    (root/"index.html").write_text(review_page())
    print(json.dumps({"status":"PRIVATE_NEW_COPY_BELLA_DRY_TAKES",
                      "originalSeconds":source["original"]["audioDurationSec"],
                      "revisedSeconds":source["meaningful_endings"]["audioDurationSec"],
                      "approved":False}))


if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--verify-only",action="store_true")
    p.add_argument("--output")
    a=p.parse_args()
    if a.verify_only and not a.output: preflight()
    elif a.output and not a.verify_only: generate(a.output)
    else: p.error("Use --verify-only or --output NEW_PRIVATE_FOLDER")
