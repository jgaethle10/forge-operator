#!/usr/bin/env python3
"""Pacific V14: new original short-form Bella narration, owner-private audition."""
from pathlib import Path
import json,hashlib,random,sys,wave
root=Path("pacific-v14-bella-private")
LINES=[
 ("01","Car trouble never asks if you've got time."),
 ("02","A strange noise. A warning light. A day that suddenly goes sideways."),
 ("03","So we get in there. Find out what's happening. And get to work."),
 ("04","Brakes. Engines. Bodywork. The details you see, and the ones you don't."),
 ("05","At our Yakima shop, or right where you are."),
 ("06","Pacific. Let's get you moving.")
]
def main():
 import numpy as np,torch,soundfile as sf
 from kokoro import KPipeline
 root.mkdir(exist_ok=True)
 pipeline=KPipeline(lang_code='a')
 evidence=[]
 for n,(ident,phrase) in enumerate(LINES):
  torch.manual_seed(2600+n)
  np.random.seed(2600+n)
  chunks=[np.asarray(c.audio,dtype=np.float32) for c in pipeline(phrase,voice='af_bella',speed=1.02)]
  if not chunks: raise RuntimeError('voice audio missing:'+ident)
  samples=np.concatenate(chunks)
  out=root/(ident+'.wav')
  sf.write(out,samples,24000,subtype='PCM_16')
  with wave.open(str(out),'rb') as w: length=w.getnframes()/24000
  row={'id':ident,'phrase':phrase,'durationSec':round(length,3),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'source':'Kokoro native af_bella 0.9.4'}
  evidence.append(row)
  print(json.dumps(row))
 (root/'evidence.json').write_text(json.dumps({'project':'pacific-v14','privateReview':True,'publicationAuthority':False,'voice':'af_bella','model':'Kokoro-82M','reviewedByOwner':False,'lines':evidence},indent=2))
if __name__=='__main__':main()
