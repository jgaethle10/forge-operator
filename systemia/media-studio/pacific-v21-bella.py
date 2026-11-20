#!/usr/bin/env python3
"""Pacific V21: owner-requested natural hook, one continuous native Bella take.
Private founder review only. Does not publish or contact client.
"""
from pathlib import Path
import hashlib,json,wave
ROOT=Path("pacific-v21-bella-private")
SCRIPT=("You probably have places to be, but your car has other plans. "
"We've all been there. Thankfully, Pacific can help. "
"Their crew takes a closer look, figures out what's wrong, and gets to work. "
"From engines to bodywork, it's about getting you moving again. "
"Stop by their Yakima shop, or ask about mobile service. "
"Pacific Service Center. Keeping Yakima moving.")
def main():
 import numpy as np
 import torch
 import soundfile as sf
 from kokoro import KPipeline
 ROOT.mkdir(exist_ok=True)
 p=KPipeline(lang_code="a")
 rows=[]
 for i,speed in enumerate((0.97,1.0)):
  np.random.seed(2119+i)
  torch.manual_seed(2119+i)
  parts=[np.asarray(c.audio,dtype=np.float32) for c in p(SCRIPT,voice="af_bella",speed=speed)]
  if not parts: raise RuntimeError("Missing Kokoro speech")
  audio=np.concatenate(parts)
  f=ROOT/f"pacific_v21_bella_{str(speed).replace('.','_')}.wav"
  sf.write(f,audio,24000,subtype="PCM_16")
  with wave.open(str(f),"rb") as w:
   assert w.getnchannels()==1 and w.getframerate()==24000
   d=w.getnframes()/24000
  row={"speed":speed,"file":f.name,"duration":round(d,3),"sha256":hashlib.sha256(f.read_bytes()).hexdigest(),"segments":len(parts)}
  rows.append(row)
  print(json.dumps(row),flush=True)
 (ROOT/"receipt.json").write_text(json.dumps({"voice":"af_bella","model":"Kokoro-82M","version":"0.9.4","script":SCRIPT,"source":"founder-directed Nov 20 2026","clientApproved":False,"founderReviewOnly":True,"takes":rows},indent=2))
if __name__=="__main__":main()
