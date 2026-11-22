#!/usr/bin/env python3
"""Founder-only Pacific V27 connected voice + original CC0 music acquisition.

No private Pacific footage or customer data enters the workflow.
"""
from pathlib import Path
import hashlib,json,urllib.request
import numpy as np
import soundfile as sf
import torch
from kokoro import KPipeline

OUT=Path("pacific-v27-private-voice-and-music")
VOICE="af_bella"
SCRIPT=(
"You probably have places to be, but your car has other plans. "
"We've all been there... Thankfully, Pacific can help. "
"Their crew takes a closer look, figures out what's wrong, and gets to work. "
"From engines to bodywork, it's about getting you moving again. "
"Stop by their Yakima shop, or ask about mobile service. "
"Pacific Service Center. Keeping Yakima moving."
)
TRACKS=[
 ("classic_holizna", "https://nullrights.com/download/juyr5onpuc",
  "https://freemusicarchive.org/music/holiznacc0/rock-montage/classic/"),
]
def sha(f):return hashlib.sha256(f.read_bytes()).hexdigest()
def main():
    OUT.mkdir(parents=True,exist_ok=True)
    p=KPipeline(lang_code="a")
    takes=[]
    for name,speed,seed in [
      ("v27_warm_connected",0.97,2711),
      ("v27_conversational_connected",1.00,2712),
    ]:
      np.random.seed(seed);torch.manual_seed(seed)
      clips=[np.asarray(c.audio,dtype=np.float32) for c in p(SCRIPT,voice=VOICE,speed=speed)]
      if not clips:raise RuntimeError("No Bella audio")
      audio=np.concatenate(clips)
      f=OUT/(name+".wav");sf.write(f,audio,24000,subtype="PCM_16")
      takes.append({"file":f.name,"speed":speed,"seed":seed,"segments":len(clips),
                    "duration":round(len(audio)/24000,3),"sha256":sha(f)})
      print("VOICE",takes[-1],flush=True)
    music=[]
    for name,url,source in TRACKS:
      try:
        req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (Evercraft media rights audit)"})
        with urllib.request.urlopen(req,timeout=50) as resp:
          raw=resp.read(18_000_001)
        if len(raw)<100000 or len(raw)>18000000 or not(raw[:3]==b"ID3" or raw[:1]==b"\xff"):
          raise RuntimeError("Unexpected download signature or size")
        f=OUT/(name+".mp3");f.write_bytes(raw)
        music.append({"file":f.name,"license":"CC0 1.0","source":source,"sha256":sha(f)})
        print("MUSIC",music[-1],flush=True)
      except Exception as e:
        music.append({"source":source,"error":str(e)[:300]})
        print("MUSIC_SOURCE_UNAVAILABLE",str(e)[:250],flush=True)
    receipt={"schema":"evercraft.pacific.v27.private.vo-and-score.v1",
             "voice":"af_bella","runtime":"Kokoro 0.9.4",
             "spokenScript":SCRIPT,"reviewOnly":True,
             "founderApproved":False,"clientApproved":False,
             "customerMediaSent":False,"takes":takes,"music":music}
    (OUT/"receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
if __name__=="__main__":main()
