#!/usr/bin/env python3
"""Juan's requested V29: subtly brighter, warmer, more enthusiastic native Bella.
Produce *complete* spoken lines only. Preserve client-reviewed V27 art, music,
wording, US MOH-buhl pronunciation; no word slicing or pitch/time manipulation.
Owner review; never publish or send.
"""
import hashlib,json,pathlib
import numpy as np, torch, soundfile as sf
from kokoro import KPipeline
ROOT=pathlib.Path("v29-bella-bright"); ROOT.mkdir(exist_ok=True)
M="[Mobile](/mˈoʊbəl/)"
TAKES=[
 # Same wording that the owner/client already liked, with natural rhythmic variants.
 ("opening_smile",f"If your day is full, the last thing you need is another stop at the shop. That's why On The Go {M} Quick Lube comes to [you](+2)!",1.065,9029),
 ("opening_warm",f"If your day is full, the last thing you need is another stop at the shop. That's why On The Go {M} Quick Lube comes to YOU!",1.045,9129),
 ("opening_lively",f"If your day is full, the last thing you need is another stop at the shop. That's why On The Go {M} Quick Lube comes to [you](/jˈu/)!",1.09,9229),
 ("service_smile","From oil changes and filters to brake service!",1.055,9329),
 ("service_conversational","From oil changes and filters to brake service.",1.035,9429),
 ("service_bright","From oil changes and filters, to brake service!",1.085,9529),
 ("closing_smile",f"On The Go {M} Quick Lube. Let us come to [you](+1)!",1.04,9629),
 ("closing_warm",f"On The Go {M} Quick Lube. Let us come to you!",1.06,9729),
 ("closing_bright",f"On The Go {M} Quick Lube! Let us come to you.",1.08,9829),
]
pipe=KPipeline(lang_code="a")
receipt=[]
for name,script,speed,seed in TAKES:
 torch.manual_seed(seed); np.random.seed(seed)
 chunks=list(pipe(script,voice="af_bella",speed=speed))
 if not chunks:raise RuntimeError("EMPTY "+name)
 a=np.concatenate([np.asarray(c.audio,dtype=np.float32) for c in chunks])
 p=" ".join(str(getattr(c,"phonemes","")) for c in chunks)
 if name.startswith(("opening","closing")) and "mˈoʊbəl" not in p:raise RuntimeError("WRONG_BRAND_PHONEMES "+name+" "+p)
 if name.startswith("opening") and not ("jˈu" in p):raise RuntimeError("YOU_STRESS_MISSING "+name+" "+p)
 d=len(a)/24000
 limits={"opening":(6.2,8.2),"service":(1.8,3.1),"closing":(2.3,4.0)}
 lo,hi=next(v for k,v in limits.items() if name.startswith(k))
 if not lo<d<hi:raise RuntimeError("BAD_DURATION "+name+" "+str(d))
 if not np.isfinite(a).all() or np.max(np.abs(a))>1.00001:raise RuntimeError("INVALID_AUDIO "+name)
 f=ROOT/(name+".wav");sf.write(f,a,24000,subtype="PCM_16")
 receipt.append({"id":name,"script":script,"speed":speed,"duration":round(d,3),"phonemes":p,"file":f.name,
 "sha256":hashlib.sha256(f.read_bytes()).hexdigest()})
(ROOT/"receipt.json").write_text(json.dumps({"schema":"evercraft.onthego.bella.smile.v29",
"purpose":"Client requested warmer happier more enthusiastic professional voice",
"original_voice_id":"af_bella","kokoro":"0.9.4","native_single_utterance":True,
"no_word_splicing":True,"source_name":"On The Go Mobile Quick Lube",
"customer_approved":False,"owner_listening_approved":False,"published":False,
"takes":receipt},indent=2)+"\n")
print(json.dumps(receipt,indent=2),flush=True)
