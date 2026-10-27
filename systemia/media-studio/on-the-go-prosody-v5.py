#!/usr/bin/env python3
"""On The Go Voice Foundry V5: conversational Bella A/B auditions.
Uses native Kokoro af_bella, no cloning, blending, or pitch filters.
The previous V4 eight standalone sentences caused repeated prosody resets.
Three connected paragraph takes are synthesized per audition instead.
Review only: no publication or client sign-off.
"""
import hashlib
import json
import pathlib
import sys

SAMPLE_RATE=24000
SEED=1701
SCRIPTS={
  "A_warm_conversational": {
    "speed":1.0,
    "blocks":[
      (0.50,"If your day is already full, the last thing you need is another stop at the shop. That's why On The Go Quick Lube comes to you."),
      (11.50,"From oil changes and filters to brake service, Juan brings the work to where you are, so you can get on with your day."),
      (24.10,"On The Go Quick Lube. Let us come to you.")
    ]
  },
  "B_easy_confident": {
    "speed":1.02,
    "blocks":[
      (0.50,"Your car needs maintenance. Your day doesn't need another interruption. With On The Go Quick Lube, the service comes right to you."),
      (11.50,"Oil changes, filters, brake service. It's hands-on work by Juan, while you get on with the rest of your day."),
      (24.10,"On The Go Quick Lube. Your vehicle, your schedule.")
    ]
  }
}
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def verify():
    assert set(SCRIPTS)=={"A_warm_conversational","B_easy_confident"}
    for label, spec in SCRIPTS.items():
        starts=[float(b[0]) for b in spec["blocks"]]
        assert len(starts)==3 and starts[0]==0.5 and starts[1]==11.5 and starts[2]==24.1
        assert all(starts[i]<starts[i+1] for i in range(len(starts)-1))
        assert all(len(t)>15 and '—' not in t for _,t in spec["blocks"])
        assert 0.9<=spec["speed"]<=1.05
    print("PASS: two native Bella performances, three connected blocks each, no pitch effects")
def generate(outdir):
    verify()
    import numpy as np
    import torch
    import soundfile as sf
    from kokoro import KPipeline
    root=pathlib.Path(outdir)
    root.mkdir(parents=True,exist_ok=False)
    pipe=KPipeline(lang_code="a")
    auditions=[]
    for ai,(name,config) in enumerate(SCRIPTS.items()):
        master=np.zeros(30*SAMPLE_RATE,dtype=np.float32)
        blocks=[]
        for i,(start,words) in enumerate(config["blocks"]):
            torch.manual_seed(SEED+ai*31+i)
            np.random.seed(SEED+ai*31+i)
            audio=np.concatenate([np.asarray(x.audio,dtype=np.float32)
                for x in pipe(words,voice="af_bella",speed=config["speed"])])
            dur=len(audio)/SAMPLE_RATE
            next_start=config["blocks"][i+1][0] if i<2 else 30.0
            if start+dur>next_start-0.08:
                raise RuntimeError(f"VOICE_TIMING_FAILED_CLOSED: {name} block {i} duration {dur:.3f}s exceeds slot {next_start-start:.3f}s")
            if not np.all(np.isfinite(audio)) or np.max(np.abs(audio))>1.001:
                raise RuntimeError(f"BAD_NATIVE_WAVEFORM: {name} block {i}")
            rawpath=root/f"{name}_paragraph_{i+1}.wav"
            sf.write(rawpath,audio,SAMPLE_RATE,subtype="PCM_16")
            index=round(start*SAMPLE_RATE)
            master[index:index+len(audio)]+=audio
            blocks.append({"paragraph":i+1,"text":words,"startSec":start,
                "durationSec":round(dur,3),"sha256":sha(rawpath),
                "file":rawpath.name,"nextCutoffSec":next_start})
        if np.max(np.abs(master))>1:
            raise RuntimeError("MIX_CLIPPING_FAILED_CLOSED "+name)
        path=root/f"{name}_30s.wav"
        sf.write(path,master,SAMPLE_RATE,subtype="PCM_16")
        auditions.append({"id":name,"voiceId":"af_bella",
            "voiceFamily":"Kokoro-82M","kokoroVersion":"0.9.4",
            "nativeSpeech":True,"voiceBlends":False,"pitchManipulation":False,
            "speechSpeed":config["speed"],"recordingMethod":"three connected paragraph reads",
            "audioFile":path.name,"masterSha256":sha(path),"paragraphs":blocks})
    receipt={"schema":"evercraft.voice-foundry.prosody-ab-audition.v1",
        "customer":"On The Go Quick Lube","previousVersionIssue":"eight independent sentence starts cause repeated inflection resets",
        "model":"Kokoro-82M","modelVersion":"0.9.4","nativeVoiceId":"af_bella",
        "rightsAndSourceNoticeRequired":True,"humanListeningApproved":False,
        "clientApproved":False,"published":False,"durationSec":30,
        "audioSampleRate":SAMPLE_RATE,"auditions":auditions}
    (root/"evidence.json").write_text(json.dumps(receipt,indent=2)+"\n")
    print(json.dumps({"status":"GENERATED_NOT_LISTENING_APPROVED",
        "variants":[{"id":a["id"],"blocks":[{"durationSec":b["durationSec"],"startSec":b["startSec"]} for b in a["paragraphs"]]} for a in auditions]},indent=2))
if __name__=="__main__":
    if len(sys.argv)==2 and sys.argv[1]=="--verify-only":verify()
    elif len(sys.argv)==2:generate(sys.argv[1])
    else:raise SystemExit("Usage: on-the-go-prosody-v5.py <output-dir> | --verify-only")
