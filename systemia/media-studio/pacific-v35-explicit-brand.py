#!/usr/bin/env python3
"""Pacific V35: expressly spoken brand bridge, native Bella.

Founder-private audio only. Client media and founder reference audio NEVER uploaded.
The separate quote cannot disappear as a side-effect of long-script synthesis.
"""
from pathlib import Path
import hashlib,json
import numpy as np, soundfile as sf, torch
from kokoro import KPipeline

ROOT=Path("pacific-v35-explicit-brand-private")
SCRIPT="Thankfully, Pacific can help."
def h(f): return hashlib.sha256(f.read_bytes()).hexdigest()
def main():
  ROOT.mkdir(exist_ok=True)
  p=KPipeline(lang_code="a")
  rows=[]
  for name,speed,seed in [
       ("bella_brand_warm",.94,3501),
       ("bella_brand_conversational",1.05,3502)]:
    torch.manual_seed(seed);np.random.seed(seed)
    parts=[np.asarray(x.audio,dtype=np.float32) for x in p(SCRIPT,voice="af_bella",speed=speed)]
    if not parts:raise RuntimeError("TTS_AUDIO_MISSING")
    audio=np.concatenate(parts)
    file=ROOT/(name+".wav")
    sf.write(file,audio,24000,subtype="PCM_16")
    row={"file":file.name,"text":SCRIPT,"voice":"af_bella","speed":speed,
         "seed":seed,"segment_count":len(parts),
         "duration_s":round(len(audio)/24000,3),"sha256":h(file)}
    rows.append(row)
    print("BRAND_VOICE",json.dumps(row),flush=True)
  (ROOT/"receipt.json").write_text(json.dumps({
    "schema":"evercraft.studio.pacific.v35.brand-introduction.v1",
    "script":SCRIPT,
    "critical_sequence":["We've all been there.",SCRIPT,
                         "Their crew takes a closer look"],
    "source_voice":"Native Kokoro 0.9.4 af_bella",
    "review_only":True,
    "uploaded_customer_or_founder_media":False,
    "client_contact":False,
    "takes":rows
  },indent=2)+"\n")
if __name__=="__main__":main()
