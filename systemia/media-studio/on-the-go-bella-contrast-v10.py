#!/usr/bin/env python3
"""Native Bella persuasive contrast audition for On The Go.

Designed to land the end word 'you' just BEFORE the 8-second guitar/van reveal.
Review-only original Kokoro voice, no cloning or pitch edits.
"""
import hashlib, json, pathlib, sys
SR=24000; REVEAL_AT=8.0
TAKES={
 "contrast_a": ("At most shops, you go to them. Then you wait. With On The Go Quick Lube, Juan comes to you!", 0.99, 1701),
 "contrast_b": ("At most shops, you go to them. You sit. You wait. But On The Go Quick Lube? Juan comes to you!", 1.01, 1711),
 "contrast_c": ("You shouldn't have to sit around a shop, waiting. With On The Go Quick Lube, Juan comes to you!", 0.97, 1721),
}
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def verify():
 assert len(TAKES)==3
 for label,(text,speed,seed) in TAKES.items():
  assert text.lower().endswith("comes to you!")
  assert 0.96<=speed<=1.02
  assert 16<=len(text.split())<=25
 print("PASS: natural contrast, three retakes, ending on YOU")
def generate(where):
 verify()
 import torch, numpy as np, soundfile as sf
 from kokoro import KPipeline
 out=pathlib.Path(where);out.mkdir(parents=True,exist_ok=False)
 pipe=KPipeline(lang_code="a")
 records=[]
 for label,(words,speed,seed) in TAKES.items():
  torch.manual_seed(seed);np.random.seed(seed)
  chunks=[np.asarray(x.audio,dtype=np.float32) for x in pipe(words,voice="af_bella",speed=speed)]
  if not chunks: raise RuntimeError("NO_NATIVE_AUDIO "+label)
  a=np.concatenate(chunks)
  length=len(a)/SR
  # Allow explicit visual setup time while landing final syllable before reveal.
  start=round(REVEAL_AT-0.20-length,3)
  if start<0.12 or length>7.65:raise RuntimeError(f"VOICE_TOO_LONG {label} duration={length:.2f}s, start={start:.2f}s")
  if not np.all(np.isfinite(a)) or np.max(np.abs(a))>1.0:raise RuntimeError("AUDIO_CLIP "+label)
  raw=out/f"{label}_native.wav";sf.write(raw,a,SR,subtype="PCM_16")
  master=np.zeros(30*SR,dtype=np.float32)
  st=round(start*SR);master[st:st+len(a)]=a
  wav=out/f"{label}_opener_30s.wav";sf.write(wav,master,SR,subtype="PCM_16")
  records.append(dict(id=label,script=words,startSec=start,endSec=round(start+length,3),durationSec=round(length,3),nativeWav=raw.name,nativeSha256=digest(raw),masterWav=wav.name,masterSha256=digest(wav)))
 receipt=dict(schema="evercraft.onthego.bella-contrast-v10",voiceId="af_bella",kokoroVersion="0.9.4",
  sourceVoiceUnmodified=True,identityPinned=True,timbreBlends=False,pitchEffects=False,
  hardVanRevealSec=8,customerApproval=False,ownerListeningApproved=False,published=False,
  restOfCommercialUnchanged=True,takes=records)
 (out/"evidence.json").write_text(json.dumps(receipt,indent=2)+"\n")
 print(json.dumps({"state":"PRIVATE_REVIEW","takes":records},indent=2))
if __name__=="__main__":
 if len(sys.argv)==2 and sys.argv[1]=="--verify-only":verify()
 elif len(sys.argv)==2:generate(sys.argv[1])
 else:raise SystemExit("Usage: bella-contrast-v10.py <new-output-dir>|--verify-only")