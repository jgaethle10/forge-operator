#!/usr/bin/env python3
"""Fresh native Bella af_bella Pacific replacement line; private owner audition only."""
from pathlib import Path
import json,hashlib,sys,wave
PATH=Path("pacific-v12-bella-review")
LINES=[
("a","Bring it by our Yakima shop, or we'll come to you."),
("b","Stop by our shop in Yakima, or we'll come straight to you."),
]
def render():
 import numpy as np, soundfile as sf, torch
 from kokoro import KPipeline
 PATH.mkdir(exist_ok=True)
 pipeline=KPipeline(lang_code="a")
 result=[]
 for i,(ident,script) in enumerate(LINES):
  torch.manual_seed(2520+i)
  np.random.seed(2520+i)
  audio=np.concatenate([np.asarray(c.audio,dtype=np.float32) for c in pipeline(script,voice="af_bella",speed=1)])
  filename=PATH/(ident+".wav")
  sf.write(filename,audio,24000,subtype="PCM_16")
  with wave.open(str(filename),'rb') as w: length=w.getnframes()/w.getframerate()
  result.append({"id":ident,"line":script,"duration_seconds":round(length,3),"sha256":hashlib.sha256(filename.read_bytes()).hexdigest(),"voice":"af_bella"})
  print(json.dumps(result[-1]))
 (PATH/"evidence.json").write_text(json.dumps({"private_review":True,"published":False,"model":"Kokoro-82M","runtime":"kokoro 0.9.4","natural_speed":1.0,"lines":result},indent=2))
if __name__=="__main__":render()
