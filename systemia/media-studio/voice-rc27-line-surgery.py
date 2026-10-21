#!/usr/bin/env python3
"""RC27 founder-directed cut of redundant feeling line from two RC26 finalist full-script auditions.
Only two creative solutions; source controls never overwritten. No voice cloning.
"""
import argparse, hashlib, html, json, pathlib, re, subprocess, wave

SEED=1701
SCRIPTS=(
 ("feeling",
  "I love that moment when an idea clicks. You can almost see what it could become. You just want to start. Then you open your laptop. Six tabs. Three workarounds. And somehow, you haven't even started. That's why we're building Evercraft. More time making. Less time getting ready.",
  "Let the first line be a genuine personal observation, not a rhetorical question."),
 ("visual_first",
  "Six tabs. Three workarounds. And somehow, you haven't even started. All you wanted was to make something. That's why we're building Evercraft. More time making. Less time getting ready.",
  "Start with a silent visual moment of inspiration; voice enters only when tabs start multiplying."),
)
VOICES=(("heart","af_heart",1.0),("nearheart","blend_85_heart",.85))
SOURCE_RUN="https://github.com/jgaethle10/forge-operator/actions/runs/39545754923"
def sha(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for data in iter(lambda:f.read(1048576),b""):h.update(data)
    return h.hexdigest()
def words(s):
    return re.findall(r"[^\W_]+(?:'[^\W_]+)?",s.casefold(),re.UNICODE)
def verify():
    assert len(SCRIPTS)==2 and len(VOICES)==2
    assert [s[0] for s in SCRIPTS]==["feeling","visual_first"]
    assert [s[0] for s in VOICES]==["heart","nearheart"]
    assert [s[2] for s in VOICES]==[1.,.85]
    assert SEED==1701
    assert all(words(s).count("evercraft")==1 for _,s,_ in SCRIPTS)
    assert all("Six tabs. Three workarounds." in s for _,s,_ in SCRIPTS)
    assert all("We know that feeling" not in s for _,s,_ in SCRIPTS)
    assert all("That's why we're building Evercraft." in s for _,s,_ in SCRIPTS)
    assert all(s.endswith("More time making. Less time getting ready.") for _,s,_ in SCRIPTS)
    assert all(20<len(words(s))<75 for _,s,_ in SCRIPTS)
    assert SCRIPTS[1][1].startswith("Six tabs. Three workarounds.")
    assert SOURCE_RUN.endswith("39545754923")
    print("RC27 ready: 2 scripts x 2 approved-direction female casting choices, 4 real source takes; originals immutable")
def validate_wav(f):
    with wave.open(str(f),"rb") as w:
        sr=w.getframerate();n=w.getnframes()
        if (w.getnchannels(),w.getsampwidth(),sr)!=(1,2,24000) or not 5<n/sr<36:
            raise RuntimeError("Invalid neural WAV "+f.name)
        return {"frames":n,"sampleRate":sr,"durationSec":round(n/sr,3)}
def render(folder):
    verify()
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline
    out=pathlib.Path(folder);out.mkdir(parents=True,exist_ok=False)
    torch.set_num_threads(2)
    pipe=KPipeline(lang_code="a")
    bella=pipe.load_voice("af_bella").cpu().float()
    heart=pipe.load_voice("af_heart").cpu().float()
    if bella.shape!=heart.shape or not torch.isfinite(bella).all() or not torch.isfinite(heart).all():
        raise RuntimeError("Invalid voice embeddings")
    near=torch.lerp(bella,heart,.85).contiguous()
    evidence={
       "schema":"evercraft.voice-foundry.rc27-female-scene-first.v1",
       "status":"private_script_and_acting_audition_not_approved",
       "founderFeedback":"Founder approves RC26 takes 2 and 3 direction, but rejects the line We know that feeling; remove only that line and join smoothly to the reason to build",
       "originalRC22Control":SOURCE_RUN,
       "model":"kokoro==0.9.4 default pipeline",
       "modelWeightsDigestPinned":False,
       "modelAndVoiceCommercialRightsVerified":False,
       "humanActingNaturalnessVerified":False,
       "noReferenceVoiceCloning":True,
       "manualPhonemeEdits":False,
       "originalRC22AudioModified":False,
       "marketingClaimsDemonstrated":False,
       "founderApprovedFinalAd":False,
       "commercialPublicationAuthorized":False,
       "fixedSeed":SEED,
       "creativeAlternatives":[{"id":sid,"script":s,"directorNoteNotSentToModel":note} for sid,s,note in SCRIPTS],
       "takes":[]
    }
    for sid,script,brief in SCRIPTS:
        _,tokens=pipe.g2p(script)
        brand=[str(t.phonemes) for t in tokens if re.sub("[^a-z]","",str(t.text).lower())=="evercraft"]
        if len(brand)!=1:raise RuntimeError("Brand G2P token ambiguity")
        for name,_,weight in VOICES:
            torch.manual_seed(SEED);np.random.seed(SEED)
            vec="af_heart" if name=="heart" else near
            segments=[np.asarray(piece.audio,dtype=np.float32) for piece in pipe(script,voice=vec,speed=1)]
            if not segments:raise RuntimeError("Empty neural synthesis")
            audio=np.concatenate([p for i,part in enumerate(segments)
                for p in ((np.zeros(2400,dtype=np.float32),part) if i else (part,))])
            if not np.isfinite(audio).all() or np.sqrt(np.mean(audio*audio))<.003 or np.max(np.abs(audio))>1.2:
                raise RuntimeError("Invalid neural waveform")
            code=sid+"-"+name
            wav=out/(code+".wav");mp3=out/(code+".mp3")
            sf.write(wav,audio,24000,subtype="PCM_16")
            fmt=validate_wav(wav)
            subprocess.run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-y",
                "-i",str(wav),"-af","loudnorm=I=-16:TP=-1.5:LRA=11",
                "-codec:a","libmp3lame","-q:a","3",str(mp3)],check=True,timeout=100)
            if mp3.stat().st_size<1100:raise RuntimeError("Missing MP3")
            evidence["takes"].append({"id":code,"scene":sid,"cast":name,"heartWeight":weight,
                "fullScript":script,"naturalBrandPhonemes":brand[0],"neuralChunkCount":len(segments),
                "wavSha256":sha(wav),"mp3Sha256":sha(mp3),**fmt})
    if len(evidence["takes"])!=4:raise RuntimeError("Incomplete source auditions")
    (out/"evidence.json").write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+"\n")
    cards="".join('<section><h2>'+html.escape(sid)+"</h2><p>"+html.escape(script)+"</p>"+
        "".join('<article>'+name+'<audio controls preload="metadata" src="'+sid+"-"+name+'.mp3"></audio></article>' for name,_,_ in VOICES)+
        "</section>" for sid,script,_ in SCRIPTS)
    page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Evercraft RC27 First Seconds</title><style>body{max-width:800px;margin:30px auto;padding:15px;background:#121a29;color:#eff3ff;font:16px/1.5 system-ui}section{border:1px solid #596985;border-radius:13px;margin:20px 0;padding:16px}article{background:#27364b;margin:10px 0;padding:12px;border-radius:9px}audio{width:100%;display:block}p{color:#c8d3e5}</style><h1>RC27 | Let the idea happen</h1><p>Two solutions, the familiar female voice only. Feeling starts with an observation, visual_first begins AFTER the silent idea visualization. No Chatterbox, no cloned voices, no forced acting markup or unnatural internal splices. These are private experiments, not finished ads.</p>'''+cards+"</html>"
    (out/"LISTEN.html").write_text(page)
    print(json.dumps({"realNeuralTakes":len(evidence["takes"]),"status":evidence["status"]}))
if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("output",nargs="?");p.add_argument("--verify-only",action="store_true")
    a=p.parse_args()
    if a.verify_only:verify()
    elif a.output:render(a.output)
    else:p.error("Use --verify-only or a fresh output folder")
