#!/usr/bin/env python3
"""Pacific V33: founder-recording-paced native Bella phrase auditions.

Private founder review. This generates original native af_bella takes of TWO
phrases without receiving or uploading the founder's reference video or
customer footage. Punctuation not used as a proxy for precise timing.
The local editor sets explicit silence after the speech waveform is measured.
"""
from pathlib import Path
import hashlib,json
import numpy as np
import soundfile as sf
import torch
from kokoro import KPipeline

OUT=Path("pacific-v33-native-phrases")
PHRASES=[
 ("other_plans", "But your car might have other plans."),
 ("weve_all", "We've all been there."),
]
TAKES=[
 ("natural",1.17,3311),
 ("brisk",1.30,3312),
]
def main():
 OUT.mkdir(parents=True,exist_ok=True)
 p=KPipeline(lang_code="a")
 rows=[]
 for label,speed,base_seed in TAKES:
  for ix,(key,line) in enumerate(PHRASES):
   seed=base_seed+ix
   np.random.seed(seed);torch.manual_seed(seed)
   samples=[np.asarray(x.audio,dtype=np.float32)
            for x in p(line,voice='af_bella',speed=speed)]
   if not samples:raise RuntimeError('No native Bella audio for '+key)
   audio=np.concatenate(samples)
   file=OUT/(f'{label}_{key}.wav')
   sf.write(file,audio,24000,subtype='PCM_16')
   row={"file":file.name,"voice":"af_bella","speed":speed,"seed":seed,
        "text":line,"duration":round(len(audio)/24000,3),
        "segments":len(samples),
        "sha256":hashlib.sha256(file.read_bytes()).hexdigest()}
   print(json.dumps(row),flush=True)
   rows.append(row)
 (OUT/'receipt.json').write_text(json.dumps({
  "schema":"evercraft.pacific.v33.native-phrases.private.v1",
  "voice":"af_bella","runtime":"Kokoro 0.9.4",
  "reference":"Founder's private IMG_7247.mov, not uploaded",
  "purpose":"Native pace + intentional phrase breaks, no waveform time stretching",
  "not_final_video":True,"client_approved":False,"public_release":False,
  "takes":rows},indent=2)+'\n')
if __name__=="__main__":main()
