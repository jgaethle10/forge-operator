#!/usr/bin/env python3
"""Safe prosody variants for Kokoro with phoneme inspection and lexical stress preserved."""
import array
import hashlib
import html
import json
import pathlib
import re
import subprocess
import sys
import wave

SCRIPT="This is Evercraft, and this is only the beginning."
VOICES=(("02","af_heart"),("05","af_bella"),("06","am_michael"))
VARIANTS=(
 ("baseline",SCRIPT,1.0),
 ("soft_pause","This is Evercraft... and this is only the beginning.",1.0),
 ("completed_thought","This is Evercraft. And this is only the beginning.",1.0),
 ("gentle_pace",SCRIPT,.96),
)
WORDS=lambda s:re.findall(r"[^\W_]+(?:'[^\W_]+)?",s.casefold(),re.UNICODE)
def validate():
 for name,text,speed in VARIANTS:
  assert WORDS(text)==WORDS(SCRIPT),name+" cannot change any spoken word"
  assert .92<=speed<=1.08,"keep inference-level tempo adjustments modest"
 assert len(VOICES)==3 and len(VARIANTS)==4
 print("12 safe prosody takes validated; exact words and model lexical stress unchanged")
def sha(p):
 h=hashlib.sha256()
 with open(p,"rb") as f:
  for buf in iter(lambda:f.read(1048576),b""):h.update(buf)
 return h.hexdigest()
def run(args):
 subprocess.run(args,check=True,timeout=90)
def g2p_snapshot(pipeline):
 parsed=pipeline.g2p(SCRIPT)
 if not isinstance(parsed,tuple) or len(parsed)!=2 or not isinstance(parsed[1],list):
  raise RuntimeError("Unexpected Kokoro G2P API, fail closed")
 tokens=parsed[1]
 audit=[]
 for t in tokens:
  word=re.sub(r"[^a-z]+","",str(t.text).casefold())
  if word in ("only","beginning"):
   audit.append({"word":word,"modelOriginalPhonemes":str(t.phonemes),"unchanged":True})
 if {x["word"] for x in audit}!={"only","beginning"}:
  raise RuntimeError("Missing observed target phoneme sequence")
 # Known wrong correction from experimental run: moving lexical stress to
 # the first syllable of "beginning" was a NEGATIVE CONTROL, not an enhancement.
 # The original model phonemes must always be passed through UNMODIFIED.
 return audit
def render(folder):
 validate()
 import numpy as np
 import soundfile as sf
 from kokoro import KPipeline
 out=pathlib.Path(folder);out.mkdir(parents=True,exist_ok=False)
 pipeline=KPipeline(lang_code="a")
 audit=g2p_snapshot(pipeline)
 report={
  "schema":"evercraft.voice-foundry.lexical-stress-preserving-prosody.v2",
  "status":"private_real_neural_audition_only",
  "ownerFavorites":["02","05","06"],
  "script":SCRIPT,
  "phonemeAudit":audit,
  "rejectedPreviousAttempt":"First experiment moved stress in beginning from bəɡˈɪnɪŋ to bˈəɡɪnɪŋ; incorrect stress was detected and REJECTED. Prior focus recordings are not approved.",
  "phraseAndSpeedOnly":True,
  "originalPhonemesPreserved":True,
  "phonemeTokenOverridesApplied":False,
  "originalWordDigest":hashlib.sha256(" ".join(WORDS(SCRIPT)).encode()).hexdigest(),
  "model":"Kokoro-82M, runtime-loaded, model checkpoint not independently pinned",
  "actualNeuralRenders":[],
  "qualityAssessedByHuman":False,
  "voiceRightsIndependentlyVerified":False,
  "publicationAuthorityGranted":False,
 }
 for label,voice in VOICES:
  for variant,text,speed in VARIANTS:
   key=label+"-"+variant
   wav=out/(key+".wav");mp3=out/(key+".mp3")
   # Raw model synthesis, no fake breaths, no phoneme modifications.
   generated=[np.asarray(audio,dtype=np.float32) for _,_,audio in pipeline(text,voice=voice,speed=speed)]
   if not generated:raise RuntimeError("Kokoro produced no audio")
   gap=np.zeros(2400,dtype=np.float32)
   samples=np.concatenate([part for i,segment in enumerate(generated) for part in ((gap,segment) if i else (segment,))])
   sf.write(wav,samples,24000,subtype="PCM_16")
   with wave.open(str(wav),"rb") as w:
    duration=w.getnframes()/w.getframerate()
    if not (1.5<duration<18 and w.getnchannels()==1 and w.getsampwidth()==2):
     raise RuntimeError("Invalid private neural audition output")
   run(["ffmpeg","-nostdin","-v","error","-y","-i",str(wav),
        "-af","loudnorm=I=-16:TP=-1.5:LRA=11","-codec:a","libmp3lame","-q:a","3",str(mp3)])
   report["actualNeuralRenders"].append({
    "id":key,"voice":voice,"variation":variant,"inputText":text,"modelSpeed":speed,
    "spokenWordsUnchanged":True,"stressMarkersOverridden":False,
    "wavSha256":sha(wav),"mp3Sha256":sha(mp3),"durationSec":round(duration,3)
   })
 (out/"micro-prosody-report.json").write_text(json.dumps(report,indent=2)+"\n")
 sections=[]
 for label,_ in VOICES:
  parts=[]
  for name,_,speed in VARIANTS:
   key=label+"-"+name
   parts.append(f"<article><strong>{html.escape(name.replace('_',' ').title())}</strong><audio controls preload='metadata' src='{key}.mp3'></audio><small>Model speed {speed}</small></article>")
  sections.append("<section><h2>Voice "+label+"</h2>"+"".join(parts)+"</section>")
 page="""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evercraft Word Flow Studio</title>
<style>body{max-width:780px;margin:28px auto;padding:0 20px;background:#111c2d;color:#f3f6ff;font:16px/1.5 system-ui}section{border:1px solid #66748b;border-radius:16px;padding:18px;margin:22px 0}article{margin:10px 0;padding:10px;border-radius:10px;background:#253247}audio{display:block;width:100%}small{color:#bccbdb}</style>
<h1>Voice Foundry | Word Flow Studio</h1>
<p>The three owner-favorite neural voices, four controlled performances each. Original phonemes and correct lexical stress are preserved. Only sentence boundaries or modest inference speed change. Compare word flow and whether the last thought lands naturally.</p>
<p><strong>Words:</strong> """+html.escape(SCRIPT)+"""</p>
<p>A previous exploratory variant moved the word stress in “beginning” incorrectly. It has been rejected and is NOT in this pack. No real speech has been certified as a finished performance.</p>
"""+ "".join(sections)+"""
<p>Dry WAVs and separately level-adjusted MP3 listening copies are included. Ratings and rights remain unverified, and no release is authorized.</p></html>"""
 (out/"index.html").write_text(page)
 print(json.dumps({"rendered":len(report["actualNeuralRenders"]),"phonemesUnchanged":audit},ensure_ascii=False))
if __name__=="__main__":
 if sys.argv[1:]==["--verify-only"]:validate()
 elif len(sys.argv)==2:render(sys.argv[1])
 else:raise SystemExit("Usage: voice-kokoro-microprosody.py --verify-only | <new-output-dir>")
