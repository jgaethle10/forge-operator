#!/usr/bin/env python3
"""Fallen original-male narrator audition. Public promotional text only.
No client images, videos, private messages, or customer PII may be staged here.
These are distinct stock synthesizer voices, NOT clones of any actor or ad character.
"""
from pathlib import Path
import sys, json, hashlib
ENGLISH = ("Ricky grows exotic peppers, smokes them, and transforms their fire into his "
           "famous guacamole. Exotic Chiles. Grown. Smoked. Crafted.")
SPANISH = ("Ricky cultiva chiles exóticos, los ahúma y transforma ese fuego en su "
           "famoso guacamole. Exotic Chiles. Cultivados. Ahumados. Hechos con pasión.")
SPEC=[
 ("english_onyx","a","am_onyx",ENGLISH,0.94),
 ("english_adam","a","am_adam",ENGLISH,0.92),
 ("english_michael","a","am_michael",ENGLISH,0.97),
 ("spanish_alex","e","em_alex",SPANISH,0.94),
 ("spanish_santa","e","em_santa",SPANISH,0.91),
]
def check():
 assert len(SPEC)==5
 assert len(set(x[0] for x in SPEC))==5
 assert len(ENGLISH.split())>=15 and len(SPANISH.split())>=15
 for key,lang,voice,txt,speed in SPEC:
  assert voice[0]==lang and voice[1]=='m'
  assert 0.8<=speed<=1.1
  assert txt and "Exotic Chiles" in txt
 print("PASS: 3 male English + 2 male Spanish ORIGINAL voice auditions")
def build(dest):
 import numpy as np,torch,soundfile as sf
 from kokoro import KPipeline
 check()
 dest=Path(dest);dest.mkdir(parents=True,exist_ok=False)
 pipes={};items=[]
 for idx,(key,lang,voice,txt,speed) in enumerate(SPEC):
  if lang not in pipes:pipes[lang]=KPipeline(lang_code=lang)
  seed=7311+idx*113;torch.manual_seed(seed);np.random.seed(seed)
  chunks=[np.asarray(chunk.audio,dtype=np.float32) for chunk in pipes[lang](txt,voice=voice,speed=speed)]
  if not chunks:raise RuntimeError("empty voice: "+voice)
  wav=dest/(key+".wav")
  sf.write(wav,np.concatenate(chunks),24000,subtype="PCM_16")
  info=sf.info(wav)
  if info.duration<4 or info.duration>35:raise RuntimeError("bad duration: "+key+" "+str(info.duration))
  items.append({"key":key,"voice":voice,"language":lang,"speed":speed,"seed":seed,
                "script":txt,"file":wav.name,"durationSeconds":round(info.duration,3),
                "sha256":hashlib.sha256(wav.read_bytes()).hexdigest()})
 (dest/"receipt.json").write_text(json.dumps({"schema":"evercraft.voice-foundry.original-male-commercial-auditions.v1",
   "engine":"kokoro","engineVersion":"0.9.4","samples":items,
   "claims":{"notCelebrityClone":True,"mexicanRegionalAccentIndependentlyVerified":False,
             "matureVocalAgeVerified":False,"ownerVoiceApproval":False,"customerReleaseApproved":False}},indent=2,ensure_ascii=False)+"\n")
 print("SUCCESS: rendered",len(items),"native Kokoro male voices")
if __name__=='__main__':
 if len(sys.argv)!=2:raise SystemExit("Usage: voice_audition.py --verify-only|<private-output-dir>")
 if sys.argv[1]=='--verify-only':check()
 else:build(sys.argv[1])
