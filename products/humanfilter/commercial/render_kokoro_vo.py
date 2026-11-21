#!/usr/bin/env python3
"""Generate a new five-beat Kokoro af_bella VO for HumanFilter; never pass off as user's custom Bella clone.
Uses Apache-2.0 Kokoro weights, MIT inference library. No private voice samples.
"""
import os,hashlib,json,pathlib,numpy as np,soundfile as sf
from kokoro_onnx import Kokoro

OUT=pathlib.Path(os.environ.get("HF_VOICE_OUT","artifacts/humanfilter-rc3/voice"));OUT.mkdir(parents=True,exist_ok=True)
MODEL=os.environ.get("HF_KOKORO_MODEL","/tmp/hf-models/kokoro-v1.0.int8.onnx")
VOICES=os.environ.get("HF_KOKORO_VOICES","/tmp/hf-models/voices-v1.0.bin")
# Restrained, unexaggerated direction. Exact truthful product functionality.
BEATS=[
  ("01-hook",0.35,3.65,"What if your feed listened to you?",1.05),
  ("02-filter",4.15,11.50,"HumanFilter softens posts with recognizable A.I. labels, right where you scroll.",1.09),
  ("03-control",12.45,18.55,"Go stricter. Add your own keywords. You decide.",1.07),
  ("04-reveal",19.45,23.75,"Want something back? Just show it once.",1.06),
  ("05-cta",24.40,29.70,"HumanFilter. Keep the feed yours. Try the free desktop beta.",1.08),
]
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def main():
  kokoro=Kokoro(MODEL,VOICES)
  master=np.zeros(int(30*48000),dtype=np.float32); entries=[]
  for name,start,stop,script,speed in BEATS:
    audio,sr=kokoro.create(script,voice="af_bella",speed=speed,lang="en-us")
    audio=np.array(audio,dtype=np.float32).flatten()
    if not np.isfinite(audio).all():raise ValueError("Nonfinite Kokoro audio")
    duration=len(audio)/sr; available=stop-start
    if duration>available:
      raise RuntimeError(f"VOICE_TOO_LONG:{name}:{duration:.3f}>{available:.3f} ; re-direct script, not large tempo stretch")
    from scipy.signal import resample_poly
    import math
    common=math.gcd(int(sr),48000)
    audio=resample_poly(audio,48000//common,sr//common).astype(np.float32)
    fade=min(int(.025*48000),len(audio)//8)
    if fade>0:
      audio[:fade]*=np.linspace(0,1,fade,dtype=np.float32)
      audio[-fade:]*=np.linspace(1,0,fade,dtype=np.float32)
    st=int(start*48000);master[st:st+len(audio)]+=audio
    local=OUT/f"{name}.wav";sf.write(local,audio,48000,subtype="PCM_16")
    entries.append({"beat":name,"script":script,"start_seconds":start,"length_seconds":round(duration,3),"end_seconds":round(start+duration,3),"hash_sha256":sha(local),"voice_id":"Kokoro af_bella (open model), not verified custom Bella"})
    print(f"VOICE_GENERATED:{name}:{duration:.2f}s",flush=True)
  peak=max(np.max(np.abs(master)),1e-9); master=master*min(0.86/peak,1)
  dest=OUT/"humanfilter_kokoro_af_bella_30s.wav"
  sf.write(dest,master,48000,subtype="PCM_16")
  receipt={"schema":"evercraft.humanfilter.original-vo.v1","source":"Kokoro Apache-2.0 open model, local CPU","voice":"af_bella","user_custom_Bella_fingerprint_verified":False,"no_voice_cloning":True,"timing_seconds":30,"narration":entries,"master_sha256":sha(dest),"commercial_release_approved":False}
  (OUT/"narration-receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
  print(json.dumps({"status":"VOICE_RENDERED","sha256":receipt["master_sha256"],"beats":len(entries)}),flush=True)
if __name__=="__main__":main()
