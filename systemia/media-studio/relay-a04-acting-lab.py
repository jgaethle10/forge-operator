#!/usr/bin/env python3
"""Evercraft Voice Foundry, Relay A04 native acting auditions.

Intention: underplay "Most mistakes don't announce themselves" as a
conversational thought which hands meaning forward to "Relay finds the difference."
No changed spoken words, forced pitches, cloned voices or post-processed contours.
"""
import hashlib, json, pathlib, sys, re, wave
import numpy as np
import torch, soundfile as sf
from kokoro import KPipeline

BASE="Most mistakes don't announce themselves."
TAKES=[
 ("plain","Most mistakes don't announce themselves.",1.0,"clean baseline"),
 ("carry","Most mistakes don't announce themselves,",1.0,"continues into what Relay does next"),
 ("carry_quick","Most mistakes don't announce themselves,",1.075,"understated, forward-moving"),
 ("carry_relaxed","Most mistakes don't announce themselves,",0.96,"quiet, connected thought"),
 ("open","Most mistakes don't announce themselves",1.0,"unfinished spoken idea"),
 ("colon","Most mistakes don't announce themselves:",1.0,"lead into response"),
 ("urgent","Most mistakes don't announce themselves!",1.04,"contrasting alertness, may be too theatrical"),
 ("settle","Most mistakes don't announce themselves.",1.075,"shorter, cleaner, understated"),
]
def words(s):return re.findall(r"[a-z0-9']+",s.casefold())
def main(out):
 assert len(TAKES)==8 and all(words(t)==words(BASE) for _,t,_,_ in TAKES)
 root=pathlib.Path(out);root.mkdir(exist_ok=True,parents=True)
 pipe=KPipeline(lang_code='a')
 receipt=[]
 for i,(name,text,speed,intent) in enumerate(TAKES):
  torch.manual_seed(2900+i)
  a=[np.asarray(x.audio,dtype=np.float32) for x in pipe(text,voice='af_bella',speed=speed)]
  if not a:raise RuntimeError("empty "+name)
  data=np.concatenate(a)
  if not np.isfinite(data).all():raise RuntimeError("non finite")
  dest=root/f'a04_{name}.wav';sf.write(dest,data,24000,subtype='PCM_16')
  with wave.open(str(dest),'rb') as w:
   dur=w.getnframes()/w.getframerate()
   assert w.getnchannels()==1 and w.getframerate()==24000 and 1.5<dur<5
  receipt.append(dict(variant=name,text=text,intention=intent,speed=speed,
       duration=round(dur,3),file=dest.name,sha256=hashlib.sha256(dest.read_bytes()).hexdigest()))
 ev={"schema":"evercraft.relay.a04.native-auditions.v1","voice":"af_bella",
 "base_model":"Kokoro-82M","version":"kokoro==0.9.4",
 "words_preserved":True,"synthetic_actors":False,"founder_listening_approved":False,
 "post_synth_pitch_adjustment":False,"takes":receipt}
 (root/'receipt.json').write_text(json.dumps(ev,indent=2)+'\n')
 print(json.dumps({"status":"generated","takes":len(receipt),"voice":"af_bella"}))
if __name__=="__main__":
 if len(sys.argv)==2 and sys.argv[1]=="--verify-only":
  assert len(TAKES)==8 and all(words(t)==words(BASE) for _,t,_,_ in TAKES)
  print("Verified all eight acting variants have identical spoken words")
 elif len(sys.argv)==2:main(sys.argv[1])
 else:raise SystemExit("pass --verify-only or output directory")
