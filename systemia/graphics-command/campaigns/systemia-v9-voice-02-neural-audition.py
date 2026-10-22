#!/usr/bin/env python3
"""Founder-private Systemia University V9 narrated VOICE FOUNDRY audition.

Real Kokoro-82M synthesis, same user-preferred Voice 02 / af_heart identity as
the earlier three-voice neural shootout. Text is specific to V9 scenes.
No fabricated cast approvals, no provider spend, no publication.
"""
import hashlib,json,pathlib,sys,subprocess

VOICE_ID="af_heart"
CUES=[
  ("access",.42,3.10,"You gave it access."),
  ("instruction",3.49,6.41,"You told it to work."),
  ("question",7.01,10.84,"Then someone asks, who approved this?"),
  ("agent",11.12,14.36,"The agent doesn't answer."),
  ("human",14.61,17.84,"You do. Systemia University."),
]
SAMPLE_RATE=24000
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def verify():
  assert len(CUES)==5 and VOICE_ID=="af_heart"
  assert CUES[-1][2]<=18 and all(a<b<18 for _,a,b,_ in CUES)
  assert all(CUES[i][2]<CUES[i+1][1] for i in range(len(CUES)-1))
  assert CUES[2][3].endswith("who approved this?")
  print("Voice 02 founder-preferred Kokoro V9 narration cue plan OK")
def render(folder):
  verify()
  import numpy as np
  import soundfile as sf
  from kokoro import KPipeline
  out=pathlib.Path(folder);out.mkdir(parents=True,exist_ok=False)
  model=KPipeline(lang_code="a")
  report={"schema":"evercraft.voice-foundry.systemia-v9-narration-audition.v1",
    "project":"systemia-university-i-said-draft-v9","stageDurationSec":18,
    "source":"https://huggingface.co/hexgrad/Kokoro-82M",
    "voice":"V02","modelVoiceId":VOICE_ID,"ownerPreference":"V02 amazing",
    "modelWeightsDigestPinned":False,"voiceRightsIndependentlyVerified":False,
    "humanAuditionApproved":False,"publicationAuthorized":False,"providerCallsPaid":False,
    "performanceQualityHumanApproved":False,"cues":[]}
  for key,start,end,script in CUES:
    audio=[np.asarray(samples,dtype=np.float32) for _,_,samples in model(script,voice=VOICE_ID,speed=1.0)]
    if not audio:raise RuntimeError("Kokoro returned no audio:"+key)
    signal=np.concatenate(audio)
    # Trim only pre/post-speech low-level silence; never splice the spoken words.
    threshold=max(.002,float(np.sqrt(np.mean(signal**2)))*.07)
    idx=np.flatnonzero(np.abs(signal)>threshold)
    if len(idx)==0:raise RuntimeError("silent_audio:"+key)
    a=max(0,idx[0]-int(.10*SAMPLE_RATE))
    b=min(len(signal),idx[-1]+int(.23*SAMPLE_RATE))
    signal=signal[a:b]
    duration=len(signal)/SAMPLE_RATE
    wav=out/(key+"-voice-02.wav")
    sf.write(wav,signal,SAMPLE_RATE,subtype="PCM_16")
    report["cues"].append({"id":key,"script":script,"startSec":start,"endSec":end,
      "durationSec":round(duration,3),"windowSec":round(end-start,3),
      "withinEditorialWindow":duration<=end-start+.05,
      "sha256":sha(wav),"asset":wav.name})
  (out/"v9-voice-foundry-audition-receipt.json").write_text(json.dumps(report,indent=2)+"\n")
  print(json.dumps(report,indent=2))
  if not all(c["withinEditorialWindow"] for c in report["cues"]):
    print("WARNING: Some voice cues do not fit shot window. NOT admission-ready.")
if __name__=="__main__":
  if sys.argv[1:]==["--verify-only"]:verify()
  elif len(sys.argv)==2:render(sys.argv[1])
  else:raise SystemExit("Usage: ... --verify-only | <empty-new-output-directory>")
