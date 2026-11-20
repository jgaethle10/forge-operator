#!/usr/bin/env python3
"""Pacific V20: one continuous native Bella performance, without stitched slogan fragments.
PRIVATE FOUNDER REVIEW. No client sending or publishing.
"""
import hashlib,json,pathlib,random,wave
import numpy as np
import torch
import soundfile as sf
from kokoro import KPipeline
ROOT=pathlib.Path("pacific-v20-private"); ROOT.mkdir(exist_ok=True)
SCRIPT=("You've got places to be. Your car has other plans. "
"When that happens, Pacific's crew takes a closer look, figures out what's wrong, and gets to work. "
"From engines to bodywork, they pay attention to the details. "
"Bring it by their Yakima shop, or ask about mobile service. "
"Pacific Service Center. Keeping Yakima moving.")
pipeline=KPipeline(lang_code="a")
receipt={"script":SCRIPT,"voice":"af_bella","model":"Kokoro-82M","runtime":"kokoro==0.9.4",
"approach":"Single continuous script and native performance, no interline montage stitching","private_review":True,"client_approved":False,"speeds":[]}
for i,speed in enumerate([0.97,1.02]):
    torch.manual_seed(20261119+i)
    np.random.seed(20261119+i)
    segments=[np.asarray(x.audio,dtype=np.float32) for x in pipeline(SCRIPT,voice="af_bella",speed=speed)]
    if not segments: raise RuntimeError("No Kokoro audio")
    audio=np.concatenate(segments)
    fname=f"pacific_v20_bella_speed_{speed:.2f}.wav"
    dest=ROOT/fname
    sf.write(dest,audio,24000,subtype="PCM_16")
    with wave.open(str(dest),"rb") as w:
        assert w.getframerate()==24000 and w.getnchannels()==1
        dur=w.getnframes()/w.getframerate()
    row={"speed":speed,"filename":fname,"duration_seconds":round(dur,3),
    "sha256":hashlib.sha256(dest.read_bytes()).hexdigest(),"segment_count":len(segments)}
    print(json.dumps(row),flush=True)
    receipt["speeds"].append(row)
(ROOT/"narration_evidence.json").write_text(json.dumps(receipt,indent=2)+"\n")
