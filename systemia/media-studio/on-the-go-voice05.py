#!/usr/bin/env python3
"""Private original-native Bella audition for On The Go Quick Lube.
Matches Relay Voice 5 production runtime, never reuses Relay narration.
No release, publish, human audition, or footage rights claims.
"""
import hashlib,json,pathlib,sys
SEED=1701
SR=24000
LINES=[
("v01","Your day is already busy.",0.45),
("v02","Why waste it waiting at a shop?",3.35),
("v03","On The Go Quick Lube brings service to you.",7.10),
("v04","Oil changes, filters, and more.",11.85),
("v05","Brake service, right where you are.",15.20),
("v06","Real hands. Years of experience.",19.30),
("v07","All on your schedule.",22.80),
("v08","On The Go Quick Lube. Let us come to you.",25.50)]
def verify():
 assert len(LINES)==8
 assert [x[0] for x in LINES]==[f"v{i:02d}" for i in range(1,9)]
 assert all(LINES[i][2]<LINES[i+1][2] for i in range(7))
 assert all("—" not in s and "–" not in s for _,s,_ in LINES)
 assert LINES[-1][2]<30
 print("PASS: native Bella identity, original customer lines, eight exclusive 30-second slots")
def generate(outdir):
 verify()
 import torch,numpy as np,soundfile as sf
 from kokoro import KPipeline
 out=pathlib.Path(outdir);out.mkdir(parents=True,exist_ok=False)
 pipe=KPipeline(lang_code="a")
 master=np.zeros(30*SR,dtype=np.float32)
 evidence=[]
 for i,(ident,words,start) in enumerate(LINES):
  torch.manual_seed(SEED+i);np.random.seed(SEED+i)
  chunks=[np.asarray(x.audio,dtype=np.float32) for x in pipe(words,voice="af_bella",speed=1.0)]
  if not chunks:raise RuntimeError("VOICE_EMPTY "+ident)
  samples=np.concatenate(chunks)
  dur=len(samples)/SR
  nextStart=LINES[i+1][2] if i+1<len(LINES) else 30.0
  if start+dur>nextStart-0.05:raise RuntimeError("VOICE_TIMING_FAILED_CLOSED "+ident)
  if not np.all(np.isfinite(samples)) or np.max(np.abs(samples))>1.001:
   raise RuntimeError("VOICE_SIGNAL_FAILED_CLOSED "+ident)
  path=out/(ident+".wav");sf.write(path,samples,SR,subtype="PCM_16")
  frame=round(start*SR);master[frame:frame+len(samples)]+=samples
  evidence.append({"id":ident,"text":words,"startSec":start,"durationSec":round(dur,3),
    "filename":path.name,"sha256":hashlib.sha256(path.read_bytes()).hexdigest()})
 masterfile=out/"onthego-bella-voice-only-30s.wav"
 sf.write(masterfile,master,SR,subtype="PCM_16")
 receipt={"schema":"evercraft.commercial.native-voice-audition.v1",
  "customer":"On The Go Quick Lube","voiceId":"af_bella","voiceFamily":"Kokoro-82M",
  "kokoroVersion":"0.9.4","originalNativeVoice":True,"naturalG2P":True,
  "phonemeOverrides":False,"pitchManipulation":False,"timbreBlends":False,
  "reusedRelaySpeech":False,"modelLicense":"Apache-2.0 per source model card",
  "modelRightsNoticeToPreserve":True,"humanListeningApproved":False,
  "customerFootageRightsVerified":False,"clientApproved":False,"published":False,
  "durationSec":30,"sampleRate":SR,"masterFile":masterfile.name,
  "masterSha256":hashlib.sha256(masterfile.read_bytes()).hexdigest(),
  "scriptLines":evidence}
 (out/"evidence.json").write_text(json.dumps(receipt,indent=2)+"\n")
 print(json.dumps(receipt,indent=2))
if __name__=="__main__":
 if len(sys.argv)==2 and sys.argv[1]=="--verify-only":verify()
 elif len(sys.argv)==2:generate(sys.argv[1])
 else:raise SystemExit("Usage: on-the-go-voice05.py <new-dir>|--verify-only")
