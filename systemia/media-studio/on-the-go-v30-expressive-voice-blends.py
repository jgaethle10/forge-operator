#!/usr/bin/env python3
"""On The Go V30: audibly distinctive BELLA-led warm/smiling performances.
Voice is Bella-dominant style interpolation, not stacked or time-shifted dialogue.
Private owner audition. V27/V29 masters remain untouched.
"""
import hashlib,json,pathlib
import numpy as np, torch, soundfile as sf
from kokoro import KPipeline
OUT=pathlib.Path("v30-bella-expressive");OUT.mkdir(parents=True,exist_ok=True)
M="[Mobile](/mˈoʊbəl/)"
SCRIPTS={
 "opening":f"If your day is full, the last thing you need is another stop at the shop. That's why On The Go {M} Quick Lube comes to [you](+2)!",
 "service":"From oil changes and filters to brake service!",
 "closing":f"On The Go {M} Quick Lube. Let us come to you!",
}
SCRIPTS_B={
 "opening":f"If your day is full, the last thing you need is another stop at the shop! That's why On The Go {M} Quick Lube comes to [you](+2)!",
 "service":"From oil changes and filters to brake service!",
 "closing":f"On The Go {M} Quick Lube. Let us come to YOU!",
}
SETS=[
 ("A_smiling_bella",0.22,1.07,SCRIPTS),
 ("B_spark_bella",0.40,1.095,SCRIPTS_B),
]
pipe=KPipeline(lang_code="a")
bella=pipe.load_voice("af_bella")
heart=pipe.load_voice("af_heart")
assert bella.shape==heart.shape
manifest=[]
for version,mix,speed,scripts in SETS:
 voice=(1-mix)*bella+mix*heart
 for idx,part in enumerate(("opening","service","closing")):
  torch.manual_seed(30002+idx*50+(0 if version.startswith("A") else 1001))
  np.random.seed(30002+idx*50+(0 if version.startswith("A") else 1001))
  raw=list(pipe(scripts[part],voice=voice,speed=speed))
  if not raw:raise RuntimeError("EMPTY_AUDIO "+version+" "+part)
  y=np.concatenate([np.asarray(e.audio,dtype=np.float32) for e in raw])
  phones=" ".join(str(getattr(e,"phonemes","")) for e in raw)
  if part in ("opening","closing") and "mˈoʊbəl" not in phones:raise RuntimeError("BRAND_PHONEMES_MISSING "+version+part)
  if part=="opening" and "jˈu" not in phones:raise RuntimeError("YOU_STRESS_MISSING "+version)
  if not np.isfinite(y).all() or np.max(np.abs(y))>1.001:raise RuntimeError("BAD_AUDIO "+version+part)
  duration=len(y)/24000
  if duration > (8.3 if part=="opening" else 5.2):raise RuntimeError("OVERLONG "+version+part+" "+str(duration))
  f=OUT/(version+"_"+part+".wav")
  sf.write(f,y,24000,subtype="PCM_16")
  manifest.append(dict(option=version,part=part,bella_weight=round(1-mix,2),heart_weight=mix,
    speed=speed,script=scripts[part],seconds=round(duration,3),phonemes=phones,
    file=f.name,sha256=hashlib.sha256(f.read_bytes()).hexdigest()))
(OUT/"manifest.json").write_text(json.dumps({"schema":"evercraft.onthego.bella-expressive.v30",
    "status":"private owner audition, NOT client-ready",
    "voice_source":"Kokoro 0.9.4, af_bella foundation with af_heart style-vector interpolation",
    "note":"Voice timbre changes on a single generated waveform, not double voices or reverb",
    "customer_approved":False,"owner_listening_approved":False,"published":False,"takes":manifest},indent=2)+"\n")
print(json.dumps(manifest,indent=2),flush=True)
