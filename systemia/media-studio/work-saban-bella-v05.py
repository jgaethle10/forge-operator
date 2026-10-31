#!/usr/bin/env python3
"""Work Saban owned Bella V05 narrator. Private review, not publication."""
import hashlib, json, pathlib, sys
SR=24000
SEED=1701
DURATION=28.0
LINES=[
 ("b01","That sales report again?",0.45),
 ("b02","Meet Work Saban.",5.25),
 ("b03","Choose your CSV. It stays on your device.",8.7),
 ("b04","Work Saban calculates the totals, and checks them again.",13.78),
 ("b05","Download a report you can use.",18.7),
 ("b06","Work Saban, by Evercraft. Try the free reporter.",23.25),
]
def verify():
 assert all(0 <= s < DURATION for _,_,s in LINES)
 assert all(LINES[i][2] < LINES[i+1][2] for i in range(len(LINES)-1))
 assert all(len(t.strip())>8 for _,t,_ in LINES)
 assert len({n for n,_,_ in LINES})==len(LINES)
 print("PASS: Work Saban Bella voice timing inputs")
def render(outdir):
 verify()
 import numpy as np, soundfile as sf, torch
 from kokoro import KPipeline
 out=pathlib.Path(outdir)
 out.mkdir(parents=True,exist_ok=False)
 pipe=KPipeline(lang_code="a")
 master=np.zeros(int(DURATION*SR),dtype=np.float32)
 records=[]
 for i,(name,line,start) in enumerate(LINES):
  torch.manual_seed(SEED+i)
  np.random.seed(SEED+i)
  parts=[np.asarray(chunk.audio,dtype=np.float32) for chunk in pipe(line,voice="af_bella",speed=1.0)]
  if not parts: raise RuntimeError("EMPTY_VOICE_"+name)
  samples=np.concatenate(parts)
  dur=len(samples)/SR
  end_limit=LINES[i+1][2] if i+1<len(LINES) else DURATION
  if start+dur > end_limit-0.12:raise RuntimeError(f"TIMING_FAILED:{name}:duration={dur:.2f}:slot={end_limit-start:.2f}")
  if not np.all(np.isfinite(samples)) or np.max(np.abs(samples))>1.001:
   raise RuntimeError("SIGNAL_FAILED_"+name)
  # tiny fade against click, preserving native voice identity
  edge=min(len(samples)//5,int(.015*SR))
  if edge:
   samples[:edge]*=np.linspace(0,1,edge)
   samples[-edge:]*=np.linspace(1,0,edge)
  path=out/(name+".wav")
  sf.write(path,samples,SR,subtype="PCM_16")
  start_frame=round(start*SR)
  master[start_frame:start_frame+len(samples)]+=samples
  records.append(dict(id=name,text=line,startSec=start,durationSec=round(dur,3),filename=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
 master_path=out/"work-saban-bella-native-voice-28s.wav"
 sf.write(master_path,master,SR,subtype="PCM_16")
 meta=dict(schema="evercraft.work-saban.bella-voice.v1",project="Work Saban",voiceId="af_bella",voiceFamily="Kokoro-82M",kokoroVersion="0.9.4",originalNativeVoice=True,phonemeOverrides=False,pitchManipulation=False,timbreBlends=False, reusedOtherCommercialSpeech=False,syntheticSample=True,privateReview=True,humanListeningApproved=False,published=False,sampleRate=SR,durationSec=DURATION,masterFile=master_path.name,masterSha256=hashlib.sha256(master_path.read_bytes()).hexdigest(),lines=records)
 (out/"voice-receipt.json").write_text(json.dumps(meta,indent=2)+"\n")
 print(json.dumps(meta,indent=2))
if __name__=="__main__":
 if len(sys.argv)==2 and sys.argv[1]=="--verify-only":verify()
 elif len(sys.argv)==2:render(sys.argv[1])
 else:raise SystemExit("Usage: work-saban-bella-v05.py <new-output-dir>|--verify-only")
