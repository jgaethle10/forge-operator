#!/usr/bin/env python3
"""On The Go V13: original-words Bella emphasis audition, private only.
Same exact spoken words; only punctuation and performance differ.
"""
import hashlib,json,pathlib,sys
SRC="If your day is already full, the last thing you need is another stop at the shop. That's why On The Go Quick Lube comes to you."
VERSIONS={
 "A_you_exclamation":("If your day is already full, the last thing you need is another stop at the shop. That's why On The Go Quick Lube comes to YOU!",1.0,1701),
 "B_you_breath":("If your day is already full, the last thing you need is another stop at the shop. That's why On The Go Quick Lube comes to... YOU!",0.99,1823),
 "C_you_isolated":("If your day is already full, the last thing you need is another stop at the shop. That's why On The Go Quick Lube comes to",1.0,1901)
}
SR=24000
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify():
 import re
 def norm(s):return re.findall(r"[a-z']+",s.lower())
 for k,(v,_,_) in VERSIONS.items():
  assert norm(v)==norm(SRC) if k!="C_you_isolated" else norm(v)==norm(SRC)[:-1]
 print("PASS: lexical identity exact on two variants, isolated ending keeps original words")
def generate(folder):
 verify()
 import numpy as np,torch,soundfile as sf
 from kokoro import KPipeline
 root=pathlib.Path(folder);root.mkdir(parents=True,exist_ok=False)
 model=KPipeline(lang_code="a")
 proof=[]
 for name,(script,speed,seed) in VERSIONS.items():
  torch.manual_seed(seed);np.random.seed(seed)
  arr=[np.asarray(c.audio,dtype=np.float32) for c in model(script,voice="af_bella",speed=speed)]
  if not arr:raise RuntimeError("NATIVE_AUDIO_EMPTY "+name)
  a=np.concatenate(arr)
  p=root/(name+".wav");sf.write(p,a,SR,subtype="PCM_16")
  proof.append(dict(id=name,script=script,seconds=len(a)/SR,filename=p.name,sha256=sha(p)))
 # generate naturally stressed distinct 'YOU!' as a controlled ending candidate
 torch.manual_seed(2026);np.random.seed(2026)
 chunks=[np.asarray(c.audio,dtype=np.float32) for c in model("YOU!",voice="af_bella",speed=0.89)]
 if not chunks:raise RuntimeError("ENDING_EMPTY")
 a=np.concatenate(chunks)
 w=root/"D_separate_YOU.wav";sf.write(w,a,SR,subtype="PCM_16")
 proof.append(dict(id="D_separate_YOU",script="YOU!",seconds=len(a)/SR,filename=w.name,sha256=sha(w),notStandaloneCommercial=True))
 receipt=dict(schema="evercraft.onthego.native-you-emphasis.v13",sourceWords=SRC,voice="af_bella",version="Kokoro 0.9.4",
   pitchManipulation=False,noVoiceCloning=True,humanListeningApproved=False,clientApproved=False,published=False,options=proof)
 (root/"evidence.json").write_text(json.dumps(receipt,indent=2)+"\n")
 print(json.dumps(proof,indent=2))
if __name__=="__main__":
 if len(sys.argv)==2 and sys.argv[1]=="--verify-only":verify()
 elif len(sys.argv)==2:generate(sys.argv[1])
 else:raise SystemExit("Usage: on-the-go-native-you-v13.py <new-dir>|--verify-only")