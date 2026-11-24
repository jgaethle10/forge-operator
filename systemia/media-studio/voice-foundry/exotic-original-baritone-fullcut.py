#!/usr/bin/env python3
"""Original, non-impersonating mature baritone for Exotic Chiles.
Public ad copy only. Every take is tracked by model, voice, script, hash.
NO impersonation training / reference audio / client source media.
"""
import json,sys,hashlib,pathlib
SCRIPT=[
 ("grow","Ricky grows exotic peppers, smokes them, and grinds them into his own seasoning. But that's only the beginning."),
 ("guac","His famous guacamole brings the flavor front and center. Big, fresh, and with a serious kick."),
 ("range","Smoked cheeses, spicy candies, and super hot drops. There's more heat to discover."),
 ("brand","Exotic Chiles. Grown. Smoked. Crafted."),
]
VOICE_OPTIONS=[
 ("deep", "am_onyx", .92),
 ("warm", "am_adam", .93),
]
def preflight():
 assert len(SCRIPT)==4
 assert all("Ricky" not in line or k=="grow" for k,line in SCRIPT)
 assert SCRIPT[-1][1]=="Exotic Chiles. Grown. Smoked. Crafted."
 assert len(set(k for k,v in SCRIPT))==4
 assert len(set(v for _,v,_ in VOICE_OPTIONS))==2
 print("PASS: 4 cue-locked story phrases, 2 ORIGINAL adult male narrator identities")
def generate(root):
 import torch,numpy as np,soundfile as sf
 from kokoro import KPipeline
 preflight();root=pathlib.Path(root);root.mkdir(parents=True,exist_ok=False)
 pipe=KPipeline(lang_code='a')
 records=[]
 for j,(option,voice,speed) in enumerate(VOICE_OPTIONS):
  for i,(key,words) in enumerate(SCRIPT):
   seed=10271+37*i+101*j
   torch.manual_seed(seed);np.random.seed(seed)
   parts=[np.asarray(chunk.audio,dtype=np.float32) for chunk in pipe(words,voice=voice,speed=speed)]
   if not parts:raise RuntimeError("empty native Kokoro generation")
   dest=root/f"{option}_{key}.wav"
   sf.write(dest,np.concatenate(parts),24000,subtype='PCM_16')
   inf=sf.info(dest)
   assert 1.0<inf.duration<14, (dest,inf.duration)
   records.append({"option":option,"voice":voice,"speed":speed,"cue":key,"script":words,
       "durationSec":round(inf.duration,3),"filename":dest.name,"sha256":hashlib.sha256(dest.read_bytes()).hexdigest(),"seed":seed})
 meta={"schema":"evercraft.fallen.original-baritone-narrator.v1","engine":"Kokoro","version":"0.9.4",
       "records":records,"sourceReferenceCloningUsed":False,"celebrityOrCharacterClone":False,
       "MexicanAccentVerified":False,"humanCreativeReviewApproved":False,"customerSendApproved":False}
 (root/"receipt.json").write_text(json.dumps(meta,indent=2)+"\n")
 print("PASS:",len(records),"authentic native WAVs with hashes")
if __name__=="__main__":
 if len(sys.argv)!=2:raise SystemExit("Usage: script --verify-only | outputdir")
 if sys.argv[1]=='--verify-only':preflight()
 else:generate(sys.argv[1])
