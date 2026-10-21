#!/usr/bin/env python3
"""Relay Voice 5 private commercial lines. Untouched Kokoro af_bella, full-text KPipeline.
No token editing, speech cloning, embedding blends, publish or rights claims.
"""
import hashlib,json,os,pathlib,wave
LINES=[
 ("a01","Everyone leaves the meeting feeling certain.",1.15),
 ("a02","Until the same date means two different things.",6.55),
 ("a03","One plan begins. Another waits for permits.",10.05),
 ("a04","Most mistakes don't announce themselves.",14.25),
 ("a05","Relay finds the difference while there's still time to fix it.",18.25),
 ("a06","One clear decision. Shared by everyone.",23.35),
 ("a07","Relay. Clarity before consequences.",26.55),
]
SEED=1701
def validate():
    assert len(LINES)==7
    assert [x[0] for x in LINES]==["a%02d"%i for i in range(1,8)]
    assert all(0<=start<31 for _,_,start in LINES)
    assert all('—' not in text and '–' not in text for _,text,_ in LINES)
    print("Relay private V05: pure af_bella, 7 unique scenes, natural G2P")
def make(outdir):
    validate()
    import torch,soundfile as sf,numpy as np
    from kokoro import KPipeline
    out=pathlib.Path(outdir);out.mkdir(parents=True,exist_ok=False)
    pipe=KPipeline(lang_code='a')
    lines=[]
    for index,(id,text,start) in enumerate(LINES):
        torch.manual_seed(SEED+index)
        np.random.seed(SEED+index)
        data=[np.asarray(x.audio,dtype=np.float32) for x in pipe(text,voice="af_bella",speed=1.0)]
        if not data:raise RuntimeError("empty output for "+id)
        sample=np.concatenate(data)
        path=out/(id+".wav")
        sf.write(path,sample,24000,subtype="PCM_16")
        with wave.open(str(path),'rb') as wavefile:
            duration=wavefile.getnframes()/wavefile.getframerate()
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        lines.append({"id":id,"text":text,"startSec":start,"durationSec":round(duration,3),
             "sampleRate":24000,"sha256":digest,"filename":path.name,
             "voice":"af_bella","naturalG2P":True,"noPhonemeOverrides":True})
    report={"schema":"evercraft.relay.voice05-private-audition.v1",
     "voiceId":"af_bella","voiceFamily":"Kokoro-82M","kokoroVersion":"0.9.4",
     "originalNativeVoice":True,"timbreBlends":False,"phonemeOverrides":False,
     "humanListeningApproved":False,"published":False,"commercialRightsVerified":False,
     "timingIsEditorialSuggestion":True,"modelWeightsIndependentlyPinned":False,
     "scriptLines":lines}
    (out/"evidence.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report,indent=2))
if __name__=="__main__":
    import sys
    if len(sys.argv)==2 and sys.argv[1]=="--verify-only":validate()
    elif len(sys.argv)==2:make(sys.argv[1])
    else:raise SystemExit("Usage: relay-voice05-private.py <out-dir>|--verify-only")
