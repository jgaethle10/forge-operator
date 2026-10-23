#!/usr/bin/env python3
"""RC22 commercial copy contest: real, controlled Kokoro neural reads; private casting only."""
import argparse
import hashlib
import html
import json
import pathlib
import re
import subprocess
import wave

SEED = 1701
CAMPAIGNS = (
    ("problem", "Ever had an idea you couldn't wait to build? Then you open your laptop. Six tabs. Three workarounds. And somehow, you haven't even started. We know that feeling. It's why we're building Evercraft. More time making. Less time getting ready.",
     "Problem-led brand position; the multiple-tool pain is a dramatized situation, not a validated product feature."),
    ("studio", "You can hear when somebody's just reading the words. And you can hear when they mean them. The difference isn't louder music. It's a story with something to say, told by a voice you believe. Evercraft. Let's make something worth hearing.",
     "Offer the commercial-production craft, not invented customer outcomes. Requires commercial-rights clearance before advertising."),
    ("moment", "The best part of building something? That quiet second when it finally works. No announcement. No crowd. Just a look across the room that says, we did it. That's the feeling we're chasing at Evercraft. And we're nowhere near finished.",
     "Founder emotion, grounded in aspiration, never presented as customer testimony."),
)
VOICES = (("B","af_bella",0.0),("H","af_heart",1.0),("M","heart_near_85",.85),("V","am_michael",None))
DIALOGUE = (
    ("one", "You get it working?"),
    ("two", "I think so."),
    ("one", "Don't say I think so."),
    ("two", "All right. Watch."),
    ("one", "Oh. That's different."),
    ("two", "Yeah. It is."),
    ("tag", "Evercraft. For the moment it finally clicks."),
)
PAIRS = (
    ("pair1", {"one":"am_michael","two":"af_heart","tag":"heart_near_85"}),
    ("pair2", {"one":"af_heart","two":"am_michael","tag":"af_bella"}),
)

def words(value):
    return re.findall(r"[^\W_]+(?:'[^\W_]+)?",value.casefold(),re.UNICODE)

def digest(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for x in iter(lambda:f.read(1048576),b""):
            h.update(x)
    return h.hexdigest()

def validate():
    assert SEED==1701 and len(CAMPAIGNS)==3 and len(VOICES)==4 and len(PAIRS)==2
    assert len({c[0] for c in CAMPAIGNS})==3
    assert [v[2] for v in VOICES]==[0.0,1.0,.85,None]
    assert len({x[0] for x in VOICES})==4
    for slug,text,brief in CAMPAIGNS:
        assert words(text).count("evercraft")==1,slug
        assert 35<=len(words(text))<=65,slug
        assert len(brief)>30
    assert sum(words(line).count("evercraft") for _,line in DIALOGUE)==1
    assert len({x[0] for x in PAIRS})==2 and len(DIALOGUE)==7
    assert {speaker for speaker,_ in DIALOGUE}=={"one","two","tag"}
    print("RC22 preflight OK: three original campaign scripts, four voices each, two true duet casts; 14 takes")

def format_check(wav_path):
    with wave.open(str(wav_path),"rb") as w:
        sr=w.getframerate()
        frames=w.getnframes()
        if (w.getnchannels(),w.getsampwidth(),sr)!=(1,2,24000) or not 2<frames/sr<55:
            raise RuntimeError("Unexpected PCM source "+wav_path.name)
    return {"sampleRate":sr,"frames":frames,"durationSec":round(frames/sr,3)}

def render(folder):
    validate()
    import numpy as np
    import torch
    import soundfile as sf
    from kokoro import KPipeline
    path=pathlib.Path(folder)
    path.mkdir(parents=True,exist_ok=False)
    pipe=KPipeline(lang_code="a")
    bella=pipe.load_voice("af_bella").cpu().float()
    heart=pipe.load_voice("af_heart").cpu().float()
    if bella.shape!=heart.shape or not torch.isfinite(bella).all() or not torch.isfinite(heart).all():
        raise RuntimeError("Unusable source voice vectors")
    blend=torch.lerp(bella,heart,.85).contiguous()
    def voice_obj(name):
        return blend if name=="heart_near_85" else name
    report={
        "schema":"evercraft.voice-foundry.rc22-commercial-copy-contest.v1",
        "status":"private_audition_no_copy_or_voice_winner_selected",
        "originalRC20ScriptRetainedInPriorArtifacts":True,
        "founderConcern":"Founder questioned whether the previous abstract commercial script was best",
        "model":"Kokoro-82M via kokoro==0.9.4",
        "modelWeightsIndependentlyPinned":False,
        "voiceAndModelCommercialRightsIndependentlyVerified":False,
        "customerTestimonialsInvented":False,
        "productCapabilitiesClaimedWithoutDemonstration":False,
        "actorConsentIndependentlyVerified":False,
        "advertisingPublicationAuthorized":False,
        "founderScriptApproved":False,
        "factualProductDemoAttached":False,
        "phonemeOverrides":False,
        "voiceCloneAudioProvided":False,
        "seed":SEED,
        "scripts":[{"id":slug,"text":txt,"creativeBriefNotSentToModel":brief} for slug,txt,brief in CAMPAIGNS],
        "dialogue":[{"speaker":s,"line":line} for s,line in DIALOGUE],
        "takes":[]
    }
    def speak(text,voice,seed):
        torch.manual_seed(seed)
        np.random.seed(seed)
        parts=[np.asarray(o.audio,dtype=np.float32) for o in pipe(text,voice=voice,speed=1.0)]
        if not parts:
            raise RuntimeError("No real neural samples: "+text[:30])
        result=np.concatenate([x for i,p in enumerate(parts)
            for x in ((np.zeros(1800,dtype=np.float32),p) if i else (p,))])
        if not np.isfinite(result).all():
            raise RuntimeError("Nonfinite neural waveform")
        return result
    def output(name,audio,source,variant,text,metadata):
        if not .003<float(np.sqrt(np.mean(audio*audio))) or not 0.01<float(np.max(np.abs(audio)))<1.2:
            raise RuntimeError("Unexpected waveform energy: "+name)
        wav=path/(name+".wav")
        mp3=path/(name+".mp3")
        sf.write(wav,audio,24000,subtype="PCM_16")
        fmt=format_check(wav)
        subprocess.run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-y",
            "-i",str(wav),"-af","loudnorm=I=-16:TP=-1.5:LRA=11",
            "-c:a","libmp3lame","-q:a","3",str(mp3)],check=True,timeout=90)
        if mp3.stat().st_size<1200:
            raise RuntimeError("Empty MP3")
        report["takes"].append({"id":name,"campaign":source,"variant":variant,"text":text,
            "wavSha256":digest(wav),"mp3Sha256":digest(mp3),**fmt,**metadata})
    for slug,txt,_ in CAMPAIGNS:
        _,tokens=pipe.g2p(txt)
        brand=[str(t.phonemes) for t in tokens
            if re.sub("[^a-z]","",str(t.text).lower())=="evercraft"]
        if len(brand)!=1:
            raise RuntimeError("Unexpected brand token for "+slug)
        for code,voice,weight in VOICES:
            name=slug+"-"+code
            arr=speak(txt,voice_obj(voice),SEED)
            output(name,arr,slug,code,txt,{"heartWeight":weight,"unmodifiedG2pBrand":brand[0],
                    "manualVoiceSwitches":0,"sameScriptWithinCampaign":True})
    for pair_name,cast in PAIRS:
        arrs=[]
        for i,(speaker,line) in enumerate(DIALOGUE):
            segment=speak(line,voice_obj(cast[speaker]),SEED+i)
            arrs.append(segment)
            if i<len(DIALOGUE)-1:
                arrs.append(np.zeros(int(24000*(.22 if i in (0,2,3,5) else .38)),dtype=np.float32))
        all_audio=np.concatenate(arrs)
        output("dialogue-"+pair_name,all_audio,"dialogue",pair_name,
               " ".join(line for _,line in DIALOGUE),
               {"casting":cast,"manualVoiceSwitches":len(DIALOGUE)-1,
                "everySpokenSegmentGeneratedByKokoro":True,
                "pausesBetweenCompleteUtterancesOnly":True,
                "sameScriptWithinCampaign":True})
    if len(report["takes"])!=14:
        raise RuntimeError("Missing expected neural performances")
    (path/"evidence.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
    blocks=[]
    for slug,txt,_ in CAMPAIGNS:
        audios="".join('<article><h3>'+code+'</h3><audio controls preload="metadata" src="'+slug+"-"+code+'.mp3"></audio></article>' for code,_,_ in VOICES)
        blocks.append("<section><h2>"+html.escape(slug.title())+"</h2><p>"+html.escape(txt)+"</p>"+audios+"</section>")
    blocks.append("<section><h2>Real two-voice dialogue</h2>"+
                  "".join('<p><strong>'+s+'</strong>: '+html.escape(t)+"</p>" for s,t in DIALOGUE)+
                  "".join('<article><h3>'+p+'</h3><audio controls preload="metadata" src="dialogue-'+p+'.mp3"></audio></article>' for p,_ in PAIRS)+"</section>")
    page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evercraft RC22 | Script Is the Product</title><style>body{max-width:820px;margin:32px auto;padding:15px;background:#101827;color:#eef3ff;font:16px/1.6 system-ui}section{padding:20px;margin:18px 0;border:1px solid #65748d;border-radius:13px}article{background:#263348;padding:10px 15px;margin:9px 0;border-radius:8px}audio{width:100%}p{color:#cbd6e8}</style>
<h1>RC22 | Do the words earn the voice?</h1>
<p>Three ad concepts, with four identical-script voice readings each, plus a genuine multi-voice dialogue with two casts. Founder has not selected a script. Nobody can infer audience response from generated audio alone. This is strictly a private review, with no factual demo or voice-rights release.</p>'''+''.join(blocks)+'''<p>All WAVs and MP3s have SHA receipts in evidence.json. Human review decides whether any script is worth producing visually. No recorded actor audio or manual phoneme surgery.</p></html>'''
    (path/"LISTEN.html").write_text(page)
    print(json.dumps({"realNeuralTakes":len(report["takes"]),"status":report["status"]}))

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("out",nargs="?")
    parser.add_argument("--verify-only",action="store_true")
    args=parser.parse_args()
    if args.verify_only:validate()
    elif args.out:render(args.out)
    else:parser.error("Use --verify-only or supply an output directory")
