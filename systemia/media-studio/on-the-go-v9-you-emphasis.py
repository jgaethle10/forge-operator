#!/usr/bin/env python3
"""Two targeted Bella opening retakes for V8A. Leave remaining passages untouched."""
import hashlib,json,pathlib,sys
BASE="If your day is already full, the last thing you need is another stop at the shop. That's why On The Go Quick Lube comes to "
TAKES={"A_inviting_emphasis":BASE+"you!",
       "B_direct_emphasis":BASE+"YOU."}
SR=24000
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify():
 assert len(TAKES)==2
 for name,words in TAKES.items():
  assert words.lower().replace("!","").replace(".","").endswith("comes to you")
  assert len(words.split())<37
 print("PASS two surgical Bella opener rewrites",list(TAKES))
def synth(outdir):
 verify()
 import numpy as np,soundfile as sf,torch
 from kokoro import KPipeline
 p=pathlib.Path(outdir);p.mkdir(parents=True,exist_ok=False)
 engine=KPipeline(lang_code='a')
 results=[]
 for i,(name,words) in enumerate(TAKES.items()):
  torch.manual_seed(1701+i);np.random.seed(1701+i)
  a=np.concatenate([np.asarray(chunk.audio,dtype=np.float32) for chunk in engine(words,voice='af_bella',speed=1.0)])
  duration=len(a)/SR
  if not 7.0<duration<10.50: raise RuntimeError(f"OPENER_TIMING_FAILED {name} {duration}")
  if not np.all(np.isfinite(a)) or np.max(np.abs(a))>1.:raise RuntimeError("INVALID_NATIVE_SIGNAL")
  out=p/f"{name}.wav";sf.write(out,a,SR,subtype="PCM_16")
  results.append(dict(id=name,script=words,startSec=0.5,durationSec=round(duration,3),file=out.name,sha256=sha(out)))
 receipt=dict(schema="evercraft.onthego.bella.opening-emphasis-v9",voiceId="af_bella",modelVersion="0.9.4",
   originalVoice=True,onlyOpeningReplaced=True,restOfV8ASoundtrackMustRemain=True,
   ownerApproval=False,customerApproval=False,published=False,readings=results)
 (p/"evidence.json").write_text(json.dumps(receipt,indent=2)+"\n")
 print(json.dumps(results,indent=2))
if __name__=="__main__":
 if len(sys.argv)==2 and sys.argv[1]=="--verify-only":verify()
 elif len(sys.argv)==2:synth(sys.argv[1])
 else:raise SystemExit("Usage: on-the-go-v9-you-emphasis.py <output-dir> | --verify-only")
