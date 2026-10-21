#!/usr/bin/env python3
"""V11 two-character dialogue audition. Story/acting test, not commercial master.
Own Voice Foundry pipeline orchestrates Kokoro-82M pretrained voices; NOT
independently trained model. No voice-cloning, paid generation or publish.
"""
import argparse,hashlib,json,pathlib,subprocess,sys
CUES=[
    ("agent-ready", "agent", "af_heart", 0.28, 2.72, "Your proposal is ready."),
    ("owner-reply", "owner", "am_michael", 2.96, 4.42, "Good. I'll approve it."),
    ("agent-sent", "agent", "af_heart", 4.65, 6.94, "I already sent it."),
    ("owner-stunned", "owner", "am_michael", 7.35, 10.74, "Sent? I said draft."),
    ("agent-permission", "agent", "af_heart", 11.18, 14.30, "Your permissions allowed it."),
    ("brand", "owner", "am_michael", 14.66, 17.92, "You own the outcome. Systemia University.")
]
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def verify():
    assert len(CUES)==6 and all(0<=s<e<=18 for _,_,_,s,e,_ in CUES)
    assert all(CUES[i][4]<CUES[i+1][3] for i in range(len(CUES)-1))
    assert {v for _,_,v,_,_,_ in CUES}=={"af_heart","am_michael"}
    assert CUES[3][-1]=="Sent? I said draft."
    print("V11 owned two-character six-cue performance plan valid")
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--verify-only",action="store_true")
    ap.add_argument("--out")
    a=ap.parse_args()
    verify()
    if a.verify_only:return
    if not a.out:raise ValueError("--out required")
    import numpy as np,soundfile as sf
    from kokoro import KPipeline
    out=pathlib.Path(a.out);out.mkdir(parents=True,exist_ok=False)
    engine=KPipeline(lang_code="a")
    report={"schema":"evercraft.voice-foundry.systemia.v11.directed-dialogue.v1",
        "status":"private_neural_audition_unapproved",
        "generator":"Evercraft Voice Foundry Kokoro pipeline",
        "underlyingModel":"hexgrad/Kokoro-82M",
        "modelWeightsPinned":False,
        "voiceModelRightsCleared":False,
        "voiceActingHumanApproved":False,
        "filmPublicationAuthorized":False,"publicRelease":False,
        "cues":[]}
    for id,role,voice,start,end,words in CUES:
        pieces=[np.asarray(x,dtype=np.float32) for _,_,x in engine(words,voice=voice,speed=1.0)]
        if not pieces:raise RuntimeError("no synthesis for "+id)
        segment=np.concatenate(pieces)
        # Keep complete model performances, with only dead silence trimmed.
        idx=np.flatnonzero(abs(segment)>.003)
        if not len(idx):raise RuntimeError("silent cue:"+id)
        segment=segment[max(0,idx[0]-2400):min(len(segment),idx[-1]+4800)]
        wave=out/(id+".wav");sf.write(wave,segment,24000,subtype="PCM_16")
        d=len(segment)/24000
        report["cues"].append({"id":id,"speaker":role,"voice":voice,"startSec":start,
            "endSec":end,"windowSec":end-start,"durationSec":round(d,3),
            "fitsSceneWithoutTimeStretch":d<=end-start+.05,
            "spokenWords":words,"file":wave.name,"sha256":sha(wave)})
    (out/"v11-voice-actor-receipt.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps({"rendered":len(report["cues"]),"allFit":all(c["fitsSceneWithoutTimeStretch"] for c in report["cues"]),
                      "cues":[(c["id"],c["durationSec"],c["windowSec"]) for c in report["cues"]]},indent=2))
if __name__=="__main__":main()
