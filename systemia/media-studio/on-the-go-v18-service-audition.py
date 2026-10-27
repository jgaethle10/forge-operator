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
