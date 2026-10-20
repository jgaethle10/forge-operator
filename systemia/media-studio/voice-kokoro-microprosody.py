#!/usr/bin/env python3
"""Micro-prosody study for real Kokoro: careful word-focus overrides, NOT a model-quality claim."""
import copy
import hashlib
import html
import json
import pathlib
import re
import subprocess
import sys
import wave

import numpy as np

SCRIPT="This is Evercraft, and this is only the beginning."
BREATH="This is Evercraft... and this is only the beginning."
VOICES=(("02","af_heart"),("05","af_bella"),("06","am_michael"))
VARIANTS=("baseline","lexical_focus","phrase_boundary")
VOWELS=set("æɐɑɒɔəɛɜɪiʊuʌɨɝɚʉøœaAeEiIoOuUɶyɯ")
PRIMARY="ˈ"
SECONDARY="ˌ"
WORDS=lambda s: re.findall(r"[^\W_]+(?:'[^\W_]+)?",s.casefold(),re.UNICODE)
def validate():
 assert WORDS(SCRIPT)==WORDS(BREATH),"Script words cannot be changed"
 assert len(VOICES)==3 and len(VARIANTS)==3
 print("Micro-prosody 3x3 verified: same spoken words; three original voice identities")
def sha(path):
 h=hashlib.sha256()
 with open(path,"rb") as f:
  for part in iter(lambda:f.read(1048576),b""):h.update(part)
 return h.hexdigest()
def subprocess_ok(cmd):
 subprocess.run(cmd,check=True,timeout=90)
def retarget_phonemes(phonemes):
 # A laboratory stress-mark change, not a linguist-verified pronunciation.
 # The model's original phoneme sequence is preserved EXCEPT syllable stress symbols.
 raw=phonemes.replace(PRIMARY,"").replace(SECONDARY,"")
 for i,sign in enumerate(raw):
  if sign in VOWELS:return raw[:i]+PRIMARY+raw[i:]
 raise RuntimeError("Cannot find a syllabic nucleus for requested stress override")
def edited_tokens(pipeline):
 result=pipeline.g2p(SCRIPT)
 if not isinstance(result,tuple) or len(result)!=2 or not isinstance(result[1],list):
  raise RuntimeError("Unexpected Kokoro G2P token result: review upstream API")
 tokens=copy.deepcopy(result[1])
 changes=[]
 for t in tokens:
  word=re.sub(r"[^a-z]+","",str(t.text).casefold())
  if word not in {"only","beginning"}:continue
  prior=str(t.phonemes or "")
  if not prior:raise RuntimeError("Missing phonemes for expected word "+word)
  after=retarget_phonemes(prior)
  changes.append({"word":word,"originalPhonemes":prior,"experimentalPhonemes":after,"changed":after!=prior})
  t.phonemes=after
 if {x["word"] for x in changes}!={"only","beginning"}:
  raise RuntimeError("Target phoneme tokens not detected; stop before inference")
 if not any(x["changed"] for x in changes):
  raise RuntimeError("No phoneme stress change. This would be fake intervention")
 if any(x["experimentalPhonemes"].replace(PRIMARY,"").replace(SECONDARY,"")!=
        x["originalPhonemes"].replace(PRIMARY,"").replace(SECONDARY,"") for x in changes):
  raise RuntimeError("Underlying segmental phonemes changed unexpectedly")
 return tokens,changes
def record_metrics(file):
 with wave.open(str(file),"rb") as w:
  d=w.getnframes()/w.getframerate()
  if w.getnchannels()!=1 or not 1.5<d<18 or w.getsampwidth()!=2:
   raise RuntimeError("Bad synthesis WAV format/duration")
  return {"durationSec":round(d,3),"sampleRate":w.getframerate()}
def render(target):
 validate()
 import soundfile as sf
 from kokoro import KPipeline
 dest=pathlib.Path(target);dest.mkdir(parents=True,exist_ok=False)
 pipeline=KPipeline(lang_code="a")
 prepared,changes=edited_tokens(pipeline)
 receipt={
  "schema":"evercraft.voice-foundry.micro-prosody.v1",
  "status":"experiment_needs_human_listening",
  "ownerFavorites":["02","05","06"],
  "text":SCRIPT,"spokenWordsSha256":hashlib.sha256(" ".join(WORDS(SCRIPT)).encode()).hexdigest(),
  "stressIntervention":changes,
  "phoneticLimitation":"Experimental syllable-stress marker promotion only, never claimed as correct pronunciation or authentic acting.",
  "model":"Kokoro-82M weights resolved by runtime, not independently SHA256 pinned",
  "synthesisQualityApproved":False,"independentAsrPerformed":False,"humanListeningVerified":False,
  "voiceRightsIndependentlyVerified":False,"publicationAuthorityGranted":False,
  "files":[]
 }
 for number,voice in VOICES:
  for variation in VARIANTS:
   id=f"{number}-{variation}"
   wav=dest/(id+".wav");mp3=dest/(id+".mp3")
   if variation=="lexical_focus":
    results=list(pipeline.generate_from_tokens(copy.deepcopy(prepared),voice=voice,speed=1.0))
   else:
    text=BREATH if variation=="phrase_boundary" else SCRIPT
    results=list(pipeline(text,voice=voice,speed=1.0))
   segments=[np.asarray(x.audio,dtype=np.float32) for x in results]
   if not segments:raise RuntimeError("Model returned zero audio segments for "+id)
   gap=np.zeros(2400,dtype=np.float32)
   audio=np.concatenate([y for i,x in enumerate(segments) for y in ((gap,x) if i else (x,))])
   sf.write(wav,audio,24000,subtype="PCM_16")
   m=record_metrics(wav)
   subprocess_ok(["ffmpeg","-nostdin","-v","error","-y","-i",str(wav),
     "-af","loudnorm=I=-16:TP=-1.5:LRA=11","-codec:a","libmp3lame","-q:a","3",str(mp3)])
   receipt["files"].append({"blindId":id,"voice":voice,"variant":variation,
    "wavSha256":sha(wav),"mp3Sha256":sha(mp3),"segments":len(segments),
    "scriptWordsPreserved":True,**m})
 (dest/"micro-prosody-report.json").write_text(json.dumps(receipt,indent=2)+"\n")
 cards=[]
 for v,_ in VOICES:
  takes=[]
  for variant in VARIANTS:
   id=f"{v}-{variant}"
   takes.append(f"<article><strong>{html.escape(variant.replace('_',' ').title())}</strong><audio controls preload='metadata' src='{id}.mp3'></audio></article>")
  cards.append("<section><h2>Voice "+v+"</h2>"+"".join(takes)+"</section>")
 page="""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evercraft voice: word cadence lab</title><style>body{max-width:780px;margin:30px auto;padding:0 20px;background:#111c2d;color:#f3f6ff;font:16px/1.5 system-ui}section{border:1px solid #66748b;border-radius:16px;padding:18px;margin:22px 0}article{margin:10px 0;padding:10px;border-radius:10px;background:#253247}audio{display:block;width:100%}p{color:#becbdc}</style>
<h1>Voice Foundry | Micro-prosody: 9 real neural takes</h1>
<p>V02, V05 and V06. Compare baseline to a strictly documented experimental phoneme-stress variant, then a longer phrase boundary. The exact spoken words are preserved in all takes.</p>
<p><b>Original:</b> """+html.escape(SCRIPT)+"""</p>
<p>These aren't certified improvements. Listen for syllable stress, word connections, and how the final thought resolves. Do not assume lexical-focus phonemes are correct; see audit JSON for exact alterations.</p>"""+ "".join(cards)+"""
<p>MP3s are loudness-adjusted; dry WAVs preserved. Voice rights, independent ASR and genuine acting quality are unverified. No publication authority.</p></html>"""
 (dest/"index.html").write_text(page)
 print(json.dumps({"rendered":len(receipt["files"]),"phonemesChanged":changes},ensure_ascii=False))
if __name__=="__main__":
 if sys.argv[1:]==["--verify-only"]:validate()
 elif len(sys.argv)==2:render(sys.argv[1])
 else:raise SystemExit("Usage: voice-kokoro-microprosody.py --verify-only | <new-output-directory>")
