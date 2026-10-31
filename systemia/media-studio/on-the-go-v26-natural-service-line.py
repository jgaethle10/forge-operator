#!/usr/bin/env python3
"""On The Go V26: native Bella service-line re-performance, owner review.
Correct dragging on 'changes' and 'service'. No speech slicing, time stretch or pitch shifting.
"""
import hashlib, json, pathlib
import numpy as np, torch, soundfile as sf
from kokoro import KPipeline
root=pathlib.Path("v26-service-line")
root.mkdir(parents=True,exist_ok=True)
takes=[
  ("natural", "From oil changes and filters to brake service.",1.00),
  ("smooth", "From oil changes and filters, to brake service.",1.04),
  ("brisk", "From oil changes and filters to brake service.",1.10),
  ("connected", "From oil changes and filters... to brake service.",1.07),
  ("neutral", "From oil changes and filters, all the way to brake service.",1.09),
  ("upbeat", "From oil changes and filters to brake service!",1.05),
]
pipe=KPipeline(lang_code="a")
results=[]
for idx,(name,script,speed) in enumerate(takes):
 torch.manual_seed(2602+idx*53);np.random.seed(2602+idx*53)
 chunks=list(pipe(script,voice="af_bella",speed=speed))
 if not chunks:raise RuntimeError("EMPTY_AUDIO "+name)
 audio=np.concatenate([np.asarray(c.audio,dtype=np.float32) for c in chunks])
 phones=" ".join(str(getattr(c,"phonemes","")) for c in chunks)
 duration=len(audio)/24000
 if not np.isfinite(audio).all() or np.max(np.abs(audio))>1.0001:raise RuntimeError("INVALID_AUDIO "+name)
 if duration>6.5:raise RuntimeError("TOO_LONG "+name+" "+str(duration))
 wav=root/(name+".wav")
 sf.write(wav,audio,24000,subtype="PCM_16")
 results.append({"name":name,"script":script,"speed":speed,"seconds":round(duration,3),
 "phonemes":phones,"sha256":hashlib.sha256(wav.read_bytes()).hexdigest()})
(root/"evidence.json").write_text(json.dumps({
 "schema":"evercraft.commercial.onthego.service-diction.v26",
 "voice":"af_bella","engine":"kokoro-0.9.4","note":"complete service phrase native takes; not cut individual words",
 "owner_listening_approved":False,"client_approved":False,"takes":results},indent=2)+"\n")
print(json.dumps(results,indent=2))
