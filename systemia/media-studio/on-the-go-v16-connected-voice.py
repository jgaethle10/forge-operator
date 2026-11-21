#!/usr/bin/env python3
"""On The Go V16: original uninterrupted Bella opening with genuine native stress.
No spliced word, no post-hoc pitch shifting, no changed spoken words.
"""
import hashlib,json,pathlib,sys
SOURCE="If your day is already full, the last thing you need is another stop at the shop. That's why On The Go Quick Lube comes to you."
OPTIONS={
 "stress_plus_two": SOURCE.replace("comes to you.","comes to [you](+2)!"),
 "phoneme_primary": SOURCE.replace("comes to you.","comes to [you](/jˈu/)!"),
 "baseline_exclaim": SOURCE.replace("comes to you.","comes to YOU!"),
 "stress_plus_one": SOURCE.replace("comes to you.","comes to [you](+1)!"),
}
SR=24000; START=0.10; MAX_END=7.93
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def preflight():
 import re
 def norm(s):
  s=re.sub(r"\[you\]\([^)]*\)","you",s)
  return re.findall(r"[a-z']+",s.lower())
 for k,v in OPTIONS.items():
  assert norm(v)==norm(SOURCE), (k,norm(v))
 assert len(OPTIONS)==4
 print("PASS: same exact words, four single-utterance phonemic stress conditions")
def synth(where):
 preflight()
 import torch,numpy as np,soundfile as sf
 from kokoro import KPipeline
 out=pathlib.Path(where);out.mkdir(parents=True,exist_ok=False)
 pipe=KPipeline(lang_code="a")
 evidence=[]
 for i,(label,words) in enumerate(OPTIONS.items()):
  torch.manual_seed(1701+i*13);np.random.seed(1701+i*13)
  results=list(pipe(words,voice="af_bella",speed=1.08))
  if len(results)==0:raise RuntimeError("TTS_EMPTY "+label)
  samples=np.concatenate([np.asarray(r.audio,dtype=np.float32) for r in results])
  end=START+len(samples)/SR
  if end>MAX_END:raise RuntimeError(f"VOICE_TOO_LONG {label}: {end:.3f}; do not crop YO(U)")
  if not np.all(np.isfinite(samples)) or np.max(np.abs(samples))>1.001:
    raise RuntimeError("INVALID_AUDIO "+label)
  p=out/f"{label}_native.wav";sf.write(p,samples,SR,subtype="PCM_16")
  master=np.zeros(30*SR,dtype=np.float32)
  i0=round(START*SR)
  master[i0:i0+len(samples)]=samples
  m=out/f"{label}_30s.wav";sf.write(m,master,SR,subtype="PCM_16")
  phonemes=" ".join(str(getattr(r,"phonemes","")) for r in results)
  evidence.append(dict(id=label,input=words,nativeFile=p.name,masterFile=m.name,nativeHash=sha(p),
    masterHash=sha(m),durationSec=round(len(samples)/SR,3),startSec=START,endSec=round(end,3),
    phonemes=phonemes,independentYOUClip=False))
 receipt=dict(schema="evercraft.voice-foundry.continuous-emphasis.v16",
  canonicalWords=SOURCE,voiceId="af_bella",kokoroVersion="0.9.4",modelSpeed=1.08,
  connectedSingleReading=True,pitchShift=False,independentWordEdits=False,
  clientApproved=False,ownerListeningApproved=False,published=False,takes=evidence)
 (out/"evidence.json").write_text(json.dumps(receipt,indent=2)+"\n")
 print(json.dumps({"status":"NATIVE_SINGLE_READING_AUDITIONS","takes":evidence},indent=2))
if __name__=="__main__":
 if len(sys.argv)==2 and sys.argv[1]=="--verify-only":preflight()
 elif len(sys.argv)==2:synth(sys.argv[1])
 else:raise SystemExit("Usage: on-the-go-v16-connected-voice.py <new-dir>|--verify-only")