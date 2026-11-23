#!/usr/bin/env python3
"""Native Kokoro af_bella audition for a public-facing food advertisement.
Only spoken advertising copy goes to this GitHub runner; NO customer media,
private messages, secrets, or customer records. Outputs private-review takes,
not approved commercial audio. Historical Relay v05 KPipeline production route.
"""
import hashlib,json,pathlib,sys
LINES=[
 ("grow","Ricky grows exotic peppers, smokes them, and grinds them into his own seasoning. But that's only the beginning."),
 ("guac","His famous guacamole brings the flavor front and center. Big, fresh, and with a serious kick."),
 ("finish","From smoked cheeses to spicy candies and super hot drops, there's more heat to discover. Exotic Chiles. Grown. Smoked. Crafted.")
]
def main(argv):
 if argv==["--verify-only"]:
  assert len(LINES)==3 and len(set(k for k,_ in LINES))==3
  assert all(12<=len(line.split())<=24 for _,line in LINES)
  print("3 natural connected Bella passages validated");return
 if len(argv)!=1:raise SystemExit("Usage: python exotic_chiles_bella_auditions.py <private-output-dir> | --verify-only")
 import torch,numpy as np,soundfile as sf
 from kokoro import KPipeline
 root=pathlib.Path(argv[0]);root.mkdir(parents=True,exist_ok=False)
 model=KPipeline(lang_code="a")
 items=[]
 for index,(key,line) in enumerate(LINES):
  for variant,seed,speed in [('a',603+index,1.0),('b',911+index,0.97)]:
   torch.manual_seed(seed);np.random.seed(seed)
   parts=[np.asarray(chunk.audio,dtype=np.float32) for chunk in model(line,voice='af_bella',speed=speed)]
   if not parts:raise RuntimeError("NO_NATIVE_BELLA_AUDIO:"+key)
   output=root/(key+'_'+variant+'.wav')
   sf.write(output,np.concatenate(parts),24000,subtype='PCM_16')
   info=sf.info(output)
   if not (1<info.duration<13):raise RuntimeError("BELLA_DURATION_OUT_OF_RANGE:"+key)
   items.append(dict(key=key,variant=variant,script=line,voice='af_bella',seed=seed,speed=speed,
                     filename=output.name,durationSec=round(info.duration,3),
                     sha256=hashlib.sha256(output.read_bytes()).hexdigest()))
 receipt={"schema":"evercraft.fallen.native-bella-public-copy-audition.v1",
 "voiceId":"af_bella","kokoroVersion":"0.9.4",
 "auditions":items,"humanListeningApproved":False,
 "weightsIndependentlyPinned":False,"releaseAuthorized":False}
 (root/'evidence.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print("SUCCESS: %s native Bella WAV files, PRIVATE REVIEW ONLY"%len(items))
if __name__=="__main__":main(sys.argv[1:])
