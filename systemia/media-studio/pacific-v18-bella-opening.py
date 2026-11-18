#!/usr/bin/env python3
"""Pacific V18 Bella opening line auditions. No client delivery or external publication."""
from pathlib import Path
import json,hashlib, wave
ROOT=Path("pacific-v18-bella-private")
LINES=[
 ("a_places","You've got places to be. Your car has other plans.",0.99),
 ("b_day","Your day doesn't stop just because your car does.",1.01),
 ("c_warning","A strange noise. A warning light. And suddenly the day takes a turn.",1.02)
]
def main():
 import numpy as np,soundfile as sf,torch
 from kokoro import KPipeline
 ROOT.mkdir(exist_ok=True)
 pipe=KPipeline(lang_code='a')
 results=[]
 for i,(name,words,speed) in enumerate(LINES):
  torch.manual_seed(2810+i); np.random.seed(2810+i)
  samples=np.concatenate([np.asarray(c.audio,dtype=np.float32) for c in pipe(words,voice="af_bella",speed=speed)])
  path=ROOT/(name+".wav")
  sf.write(path,samples,24000,subtype="PCM_16")
  with wave.open(str(path),"rb") as w:dur=w.getnframes()/24000
  row={"name":name,"text":words,"speed":speed,"durationSec":round(dur,3),"sha256":hashlib.sha256(path.read_bytes()).hexdigest()}
  results.append(row);print(json.dumps(row),flush=True)
 (ROOT/"evidence.json").write_text(json.dumps({"schema":"evercraft.pacific.v18.native-bella-opening-review.v1","voice":"af_bella","model":"Kokoro-82M","version":"0.9.4","privateOwnerReview":True,"commercialClearance":False,"lines":results},indent=2))
if __name__=="__main__":main()
