#!/usr/bin/env python3
"""RC23: original founder-preferred commercial #1 versus two small copy changes.
Private real Kokoro audition. Never alter or overwrite the RC22 audio control.
"""
import argparse
import hashlib
import html
import json
import pathlib
import re
import subprocess
import wave

SEED = 1701
SCRIPTS = (
    ("O", "Ever had an idea you couldn't wait to build? Then you open your laptop. Six tabs. Three workarounds. And somehow, you haven't even started. We know that feeling. It's why we're building Evercraft. More time making. Less time getting ready."),
    ("F", "Ever had an idea you couldn't wait to build? You open your laptop, and suddenly you're solving everything except the thing you wanted to make. Six tabs. Three workarounds. No progress. We know that feeling. That's why we're building Evercraft. Let's get back to making."),
    ("M", "It starts with an idea. The kind you can't stop thinking about. Then come the tabs, the setup, the little things that eat your whole afternoon. We know. We've lived it. So we're building Evercraft. For the work you actually came here to do."),
)
VOICES = (
    ("B", "af_bella", 0.0),
    ("H", "af_heart", 1.0),
    ("N", "heart_near_85", .85),
)
ORIGINAL_RC22 = "https://github.com/jgaethle10/forge-operator/actions/runs/39545754923"
def words(t):
    return re.findall(r"[^\W_]+(?:'[^\W_]+)?",t.casefold(),re.UNICODE)
def sha(p):
    h=hashlib.sha256()
    with open(p,"rb") as f:
        for part in iter(lambda:f.read(1048576),b""):
            h.update(part)
    return h.hexdigest()
def validate():
    assert len(SCRIPTS)==3 and len(VOICES)==3
    assert [code for code,_ in SCRIPTS]==["O","F","M"]
    assert [c for c,_,_ in VOICES]==["B","H","N"]
    assert [x[2] for x in VOICES]==[0.0,1.0,.85]
    assert SEED==1701
    for name,t in SCRIPTS:
        assert words(t).count("evercraft")==1,name
        assert 34<=len(words(t))<=54,(name,len(words(t)))
        assert "Evercraft" in t
    assert SCRIPTS[0][1].startswith("Ever had an idea you couldn't wait to build?")
    assert SCRIPTS[0][1].endswith("More time making. Less time getting ready.")
    print("RC23 passed preflight: original script exactly protected, two rewrites, 3 voices, 9 planned real neural takes")
def run(folder):
    validate()
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline
    out=pathlib.Path(folder)
    out.mkdir(parents=True,exist_ok=False)
    pipeline=KPipeline(lang_code="a")
    bella=pipeline.load_voice("af_bella").cpu().float()
    heart=pipeline.load_voice("af_heart").cpu().float()
    if bella.shape!=heart.shape or not torch.isfinite(bella).all() or not torch.isfinite(heart).all():
        raise RuntimeError("Voice reference vectors mismatch")
    near=torch.lerp(bella,heart,.85).contiguous()
    report={
       "schema":"evercraft.voice-foundry.rc23-copy-refinement.v1",
       "status":"private_founder_script_one_favorite_tentative",
       "founderFeedback":"First RC22 three-copy comparison is favorite (tentative); exact original retained",
       "sourceRC22":ORIGINAL_RC22,
       "scripts":[{"id":c,"script":t,"words":len(words(t))} for c,t in SCRIPTS],
       "model":"kokoro==0.9.4 via full-text KPipeline",
       "fixedSeed":SEED,
       "voices":[{"id":c,"voice":v,"heartWeight":w} for c,v,w in VOICES],
       "originalRC22WavBitwiseParityWillBeComparedSeparately":True,
       "allAudioGeneratedByNeuralModel":True,
       "originalAudioModified":False,
       "phonemeOverrides":False,
       "brandPronunciationImprovementProven":False,
       "audiencePreferenceMeasured":False,
       "customerClaimsIndependentlyVerified":False,
       "underlyingVoiceModelCommercialRightsVerified":False,
       "commercialReleaseApproved":False,
       "takes":[]
    }
    for sid,text in SCRIPTS:
        _,tokens=pipeline.g2p(text)
        brand=[str(t.phonemes) for t in tokens if re.sub("[^a-z]","",str(t.text).lower())=="evercraft"]
        if len(brand)!=1:
            raise RuntimeError("Unexpected Evercraft token for "+sid)
        for c,voice,weight in VOICES:
            label=sid+"-"+c
            torch.manual_seed(SEED)
            np.random.seed(SEED)
            pieces=[np.asarray(p.audio,dtype=np.float32) for p in pipeline(text,
                 voice=near if c=="N" else voice,speed=1.0)]
            if not pieces:
                raise RuntimeError("Empty neural take "+label)
            audio=np.concatenate([p for i,segment in enumerate(pieces)
                    for p in ((np.zeros(1800,dtype=np.float32),segment) if i else (segment,))])
            if not np.isfinite(audio).all() or not .004<float(np.sqrt(np.mean(audio*audio))):
                raise RuntimeError("Invalid acoustic output for "+label)
            wav=out/(label+".wav")
            mp3=out/(label+".mp3")
            sf.write(wav,audio,24000,subtype="PCM_16")
            with wave.open(str(wav),"rb") as w:
                if (w.getnchannels(),w.getsampwidth(),w.getframerate())!=(1,2,24000) or not 3<w.getnframes()/24000<40:
                    raise RuntimeError("Bad WAV "+label)
                duration=w.getnframes()/24000
            subprocess.run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-y",
              "-i",str(wav),"-af","loudnorm=I=-16:TP=-1.5:LRA=11",
              "-codec:a","libmp3lame","-q:a","3",str(mp3)],check=True,timeout=100)
            if mp3.stat().st_size<1200:
                raise RuntimeError("Empty preview "+label)
            report["takes"].append({"id":label,"scriptId":sid,"voiceId":c,
             "voice":voice,"heartWeight":weight,"g2pOriginalBrand":brand[0],
             "chunkCount":len(pieces),"durationSec":round(duration,3),
             "wavSha256":sha(wav),"mp3Sha256":sha(mp3)})
    if len(report["takes"])!=9:
        raise RuntimeError("Incomplete RC23 neural rendering")
    (out/"evidence.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
    sections=[]
    for sid,text in SCRIPTS:
        clips="".join('<article><h3>Voice '+html.escape(c)+'</h3><audio controls src="'+sid+"-"+c+'.mp3"></audio></article>' for c,_,_ in VOICES)
        sections.append('<section><h2>Draft '+sid+'</h2><p>'+html.escape(text)+'</p>'+clips+'</section>')
    page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evercraft RC23 Copy Refinement</title><style>body{max-width:800px;margin:30px auto;padding:15px;background:#141b2b;color:#eef3ff;font:16px/1.6 system-ui}section{padding:20px;margin:22px 0;border:1px solid #596a88;border-radius:14px}article{padding:10px;background:#253147;margin:10px 0}audio{width:100%}p{color:#cbd8ed}</style><h1>RC23 | Is your favorite script already the best?</h1><p>Draft O is the exact original RC22 script #1. F and M are careful alternatives. No version is approved for advertisement or matched to a verified product demonstration. Judge hook, emotion, belief, naturalness, and call to action separately.</p>'''+''.join(sections)+'</html>'
    (out/"LISTEN.html").write_text(page)
    print(json.dumps({"rendered":len(report["takes"]),"status":report["status"]}))
if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("out",nargs="?")
    p.add_argument("--verify-only",action="store_true")
    a=p.parse_args()
    if a.verify_only:validate()
    elif a.out:run(a.out)
    else:p.error("Supply output directory or --verify-only")
