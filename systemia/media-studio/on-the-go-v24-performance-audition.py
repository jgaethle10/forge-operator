#!/usr/bin/env python3
"""Native continuous Bella US-Mobile performance auditions. Private review only."""
import hashlib,json,pathlib,sys
import numpy as np,torch,soundfile as sf
from kokoro import KPipeline
ROOT=pathlib.Path("v18-service-phrases")
ROOT.mkdir(exist_ok=True)
TAKES=[
 ("a_natural_connection",
  "Your day is busy enough without another stop. That's why On The Go [Mobile](/mˌoʊbəl/) Quick Lube comes to [you](+1)!",0.98),
 ("b_warm_emphasis",
  "Your day is busy enough without another stop. That's why On The Go [Mobile](/mˈoʊbəl/) Quick Lube comes to [you](+2)!",1.01),
 ("c_no_split",
  "Your day is busy enough. On The Go [Mobile](/mˌoʊbəl/) Quick Lube comes to [you](/jˈu/)!",0.94),
 ("d_plain_performance",
  "Why wait around at the shop? On The Go [Mobile](/mˌoʊbəl/) Quick Lube comes to YOU!",0.96),
 ("e_conversational",
  "You've got enough on your plate. That's why On The Go [Mobile](/mˌoʊbəl/) Quick Lube comes to [you](+1).",0.97),
 ("f_simple_with_you",
  "Your day is full enough. That's why On The Go [Mobile](/mˈoʊbəl/) Quick Lube comes to YOU!",0.94),
]
pipe=KPipeline(lang_code="a")
evidence=[]
for i,(label,words,speed) in enumerate(TAKES):
 torch.manual_seed(24100+i*101);np.random.seed(24100+i*101)
 results=list(pipe(words,voice="af_bella",speed=speed))
 if not results:raise RuntimeError("VOICE_GENERATION_EMPTY "+label)
 samples=np.concatenate([np.asarray(r.audio,dtype=np.float32) for r in results])
 phonemes=" ".join(str(getattr(r,"phonemes","")) for r in results)
 if not ("mˈoʊbəl" in phonemes or "mˌoʊbəl" in phonemes):raise RuntimeError("WRONG_MOBILE_PRONUNCIATION "+label+" "+phonemes)
 if len(samples)/24000>7.25:raise RuntimeError("TOO_LONG_FOR_RELAXED_OPENING "+label)
 if not np.isfinite(samples).all() or np.max(np.abs(samples))>1:raise RuntimeError("INVALID_VOICE "+label)
 p=ROOT/(label+".wav");sf.write(p,samples,24000,subtype="PCM_16")
 evidence.append({"name":label,"words":words,"speed":speed,"seconds":len(samples)/24000,
                  "phonemes":phonemes,"file":p.name,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()})
(ROOT/"evidence.json").write_text(json.dumps({"schema":"evercraft.on-the-go.bella-connected-phrase.v24",
"voice":"af_bella","expected_company":"On The Go Mobile Quick Lube",
"native_continuous_sentence":True,"no_spliced_you":True,"no_stretch_or_pitch_shift":True,
"customer_approved":False,"listening_approved":False,"takes":evidence},indent=2))
print(json.dumps(evidence,indent=2))
