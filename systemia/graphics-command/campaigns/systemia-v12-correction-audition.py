#!/usr/bin/env python3
"""V12 corrective dialogue continuation for Systemia University commercial.
Separate unapproved Voice Foundry Kokoro auditions. No model rights implied.
"""
import argparse,hashlib,json,pathlib
CUES=[
 ("human-correction","owner","am_michael","Then nothing goes out without my approval."),
 ("agent-confirm","agent","af_heart","Understood. Waiting for your approval."),
]
def validate():
 assert len(CUES)==2 and {x[1] for x in CUES}=={"owner","agent"}
 assert CUES[0][-1].endswith("approval.")
 print("Original V12 correction dialogue: two complete new takes.")
def main():
 a=argparse.ArgumentParser();a.add_argument("--verify-only",action="store_true");a.add_argument("--out");z=a.parse_args();validate()
 if z.verify_only:return
 if not z.out:raise ValueError("--out required")
 import numpy as np,soundfile as sf
 from kokoro import KPipeline
 root=pathlib.Path(z.out);root.mkdir(parents=True,exist_ok=False)
 pipe=KPipeline(lang_code="a")
 result={"schema":"evercraft.voice-foundry.systemia.v12.ending-audition.v1","underlyingModel":"hexgrad/Kokoro-82M","modelPinned":False,"humanAuditionApproved":False,"rightsVerified":False,"publicationAuthorized":False,"cues":[]}
 for id,role,voice,text in CUES:
  parts=[np.asarray(w,dtype=np.float32) for _,_,w in pipe(text,voice=voice,speed=1.)]
  if not parts:raise RuntimeError("no audio")
  wave=np.concatenate(parts)
  good=np.flatnonzero(abs(wave)>.0025)
  if not len(good):raise RuntimeError("silence")
  wave=wave[max(0,good[0]-2000):min(len(wave),good[-1]+4800)]
  path=root/(id+".wav");sf.write(path,wave,24000,subtype="PCM_16")
  result["cues"].append({"id":id,"speaker":role,"voice":voice,"text":text,"durationSec":round(len(wave)/24000,4),"file":path.name,"sha256":hashlib.sha256(path.read_bytes()).hexdigest()})
 (root/"review-receipt.json").write_text(json.dumps(result,indent=2)+"\n")
 print(json.dumps(result,indent=2))
if __name__=="__main__":main()
