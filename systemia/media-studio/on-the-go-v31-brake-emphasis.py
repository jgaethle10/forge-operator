#!/usr/bin/env python3
"""V31: Bella/Heart A style, full phrase audition, stress BRAKE not SERVICE.
No pitch-up, no single-word edits, owner-private only.
"""
import hashlib,json,pathlib
import numpy as np,torch,soundfile as sf
from kokoro import KPipeline
out=pathlib.Path("v31-brake-emphasis")
out.mkdir(exist_ok=True)
P=[
("phonemic_1","From oil changes and filters to [brake](/bɹˈAk/) [service](/sɜɹvəs/).",1.03),
("phonemic_2","From oil changes and filters, to [brake](/bɹˈAk/) [service](/sɜɹvəs/)!",1.05),
("phonemic_3","From oil changes and filters to [brake](/bɹˈAk/) [service](/sɜɹvəs/).",1.075),
("phrase_stress_1","From oil changes and filters to [BRAKE](+2) service.",1.03),
("phrase_stress_2","From oil changes and filters... to [BRAKE](+2) service.",1.06),
("plain_1","From oil changes and filters to BRAKE service.",1.015),
("plain_2","From oil changes and filters, to brake service.",1.00)]
pipe=KPipeline(lang_code="a")
bella=pipe.load_voice("af_bella");heart=pipe.load_voice("af_heart")
voice=.78*bella+.22*heart
res=[]
for i,(name,words,speed) in enumerate(P):
 torch.manual_seed(3100+i*97);np.random.seed(3100+i*97)
 parts=list(pipe(words,voice=voice,speed=speed))
 if not parts:raise RuntimeError("EMPTY "+name)
 a=np.concatenate([np.asarray(p.audio,dtype=np.float32) for p in parts])
 phones=" ".join(str(p.phonemes) for p in parts)
 d=len(a)/24000
 if not 2.0<d<4.0:raise RuntimeError(f"UNUSABLE_DURATION {name} {d}")
 if not np.all(np.isfinite(a)) or np.max(np.abs(a))>1:raise RuntimeError("INVALID "+name)
 fp=out/(name+".wav");sf.write(fp,a,24000,subtype="PCM_16")
 res.append({"name":name,"input":words,"duration_sec":round(d,3),"speed":speed,"phonemes":phones,"wav":fp.name,"hash":hashlib.sha256(fp.read_bytes()).hexdigest()})
(out/"receipt.json").write_text(json.dumps({"voice":"78% af_bella + 22% af_heart, Kokoro 0.9.4","version":"v31","goal":"primary emphasis BRAKE, service unaccented", "no_pitch_shift":True,"not_client_approved":True,"takes":res},indent=2))
print(json.dumps(res,indent=2),flush=True)
