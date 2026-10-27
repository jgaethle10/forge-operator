#!/usr/bin/env python3
"""Private V18 Bella service phrase auditions. Never modify V17."""
import json, pathlib, hashlib, numpy as np, torch, soundfile as sf
from kokoro import KPipeline
out=pathlib.Path("v18-service-phrases");out.mkdir(exist_ok=True)
pipe=KPipeline(lang_code="a")
takes=[
 ("oil_natural","Oil changes.",1.0),
 ("oil_smooth","Oil changes!",0.96),
 ("brakes_natural","Brake service.",1.0),
 ("brakes_warm","Brake service!",0.96),
 ("paired_flow","Oil changes. Brake service.",1.0),
 ("brand_full_natural","On The Go Mobile Quick Lube.",1.0),
 ("brand_full_warm","On The Go Mobile Quick Lube.",0.96),
 ("brand_intro_full","On The Go Mobile Quick Lube comes to you.",0.99),
 ("brand_intro_clear","On The Go Mobile Quick Lube comes to you.",0.86),
 ("brand_full_clear","On The Go Mobile Quick Lube.",0.88),
 ("v20_opening_complete_a","If your day is already full, the last thing you need is another stop at the shop. That's why On The Go Mobile Quick Lube comes to YOU!",1.10),
 ("v20_opening_complete_b","If your day is already full, the last thing you need is another stop at the shop. That's why On The Go Mobile Quick Lube comes to you.",1.13),
 ("v20_closing_complete_a","On The Go Mobile Quick Lube.",1.07),
 ("v20_closing_complete_b","On The Go Mobile Quick Lube.",1.14),
]
results=[]
for i,(name,words,speed) in enumerate(takes):
 torch.manual_seed(1800+i)
 chunks=[np.asarray(c.audio,dtype=np.float32) for c in pipe(words,voice="af_bella",speed=speed)]
 if not chunks: raise RuntimeError("Empty synthesis: "+name)
 samples=np.concatenate(chunks)
 path=out/(name+".wav");sf.write(path,samples,24000)
 results.append(dict(name=name,words=words,seconds=round(len(samples)/24000,3),sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
(out/"evidence.json").write_text(json.dumps({"status":"private_audition_only","v17_untouched":True,"voice":"af_bella","takes":results},indent=2))
print(json.dumps(results,indent=2))
