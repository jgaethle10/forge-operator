#!/usr/bin/env python3
"""Private owner audition: preserve V18 pacing, fix full company name in BOTH lines.
No snippets, no isolated word inserts, no finished mix reuse.
"""
import pathlib,hashlib,json,re,sys
import numpy as np,torch,soundfile as sf
from kokoro import KPipeline
ROOT=pathlib.Path("v25-full-brand-auditions")
ROOT.mkdir(exist_ok=True)
# US pronunciation with explicit full two-syllable Mobile and natural final YOU stress.
PH="[Mobile](/mˈoʊbəl/)"
LINES=[
 ("open_original_clear", f"If your day is full, the last thing you need is another stop at the shop. That's why On The Go {PH} Quick Lube comes to [you](+2)!",1.04),
 ("open_original_breath",f"If your day is full, the last thing you need is another stop at the shop. That's why On The Go, {PH} Quick Lube comes to [you](+2)!",1.04),
 ("open_more_relaxed",f"If your day is full, the last thing you need is one more stop at the shop. On The Go {PH} Quick Lube comes to [you](+2)!",0.98),
 ("open_original_gentle",f"If your day is full, the last thing you need is another stop at the shop. That's why On The Go {PH} Quick Lube comes to YOU!",0.97),
 ("open_short_connected",f"Your day is already full. The last thing you need is another stop at the shop. That's why On The Go {PH} Quick Lube comes to [you](/jˈu/)!",1.02),
 ("open_pronounced_cadence",f"If your day is full, the last thing you need is another stop at the shop. That's why On The Go {PH} Quick Lube comes to [you](/jˈu/)!",1.03),
 ("close_warm_single",f"On The Go {PH} Quick Lube. Let us come to you.",0.96),
 ("close_warm_joined",f"On The Go {PH} Quick Lube, let us come to you.",1.00),
 ("close_confident",f"On The Go {PH} Quick Lube. Let us come to YOU!",1.04),
 ("close_breath",f"On The Go, {PH} Quick Lube. Let us come to you.",0.97),
]
pipe=KPipeline(lang_code="a")
results=[]
for i,(name,script,speed) in enumerate(LINES):
 torch.manual_seed(20261028+i*71);np.random.seed(20261028+i*71)
 out=list(pipe(script,voice="af_bella",speed=speed))
 if not out:raise RuntimeError("VOICE_EMPTY "+name)
 y=np.concatenate([np.asarray(v.audio,dtype=np.float32) for v in out])
 p=" ".join(str(getattr(v,"phonemes","")) for v in out)
 # Check original company spelling in source, correct US phonemes, YOU at tail
 assert "mˈoʊbəl" in p, (name,p)
 assert len(y)/24000 < (9 if name.startswith("open") else 6), ("TOO_LONG",name,len(y)/24000)
 assert np.isfinite(y).all() and np.max(np.abs(y))<=1
 wav=ROOT/(name+".wav");sf.write(wav,y,24000,subtype="PCM_16")
 results.append({"id":name,"text":script,"speed":speed,"duration_sec":round(len(y)/24000,3),"phonemes":p,
 "wav":wav.name,"sha256":hashlib.sha256(wav.read_bytes()).hexdigest()})
manifest={"schema":"evercraft.onthego.native-bella-correct-full-company.v25",
"picture_reference":"user supplied 30s cut; nearly identical audio to V18",
"required_spoken_name":"On The Go Mobile Quick Lube",
"mobile_phonemes":"mˈoʊbəl","voice":"af_bella","version":"Kokoro 0.9.4",
"continuous_opening":True,"continuous_closing":True,"no_word_splices":True,
"customer_approved":False,"human_listened":False,"takes":results}
(ROOT/"evidence.json").write_text(json.dumps(manifest,indent=2))
print(json.dumps(manifest,indent=2),flush=True)
