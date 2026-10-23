#!/usr/bin/env python3
"""RC20 controlled, authentic Kokoro performance audition: 3 scenes x 4 cast variants.
No phoneme surgery, cloning, publication, or human-audible quality claims.
"""
import argparse
import hashlib
import html
import json
import math
import pathlib
import re
import subprocess
import wave

SEED = 1701
VOICES = (
    ("B", "af_bella", 0.0, "Existing V05 Bella"),
    ("H", "af_heart", 1.0, "Existing V02 Heart"),
    ("M", "heart_near_85", .85, "Research-only 85 percent Heart embedding"),
    ("V", "am_michael", None, "Existing V06 masculine audition voice"),
)
SCENES = (
    ("documentary", "The first prototype didn't change the world. It barely worked. But nobody in the room was laughing. They heard something in that machine that sounded like possibility. They called it Evercraft.",
     "Discovery turning into earned conviction, not a trailer announcer"),
    ("commercial", "When a tool finally understands what you're trying to do, you can feel the difference. The ideas move. The work moves. And suddenly, Evercraft isn't just a name. It's what comes next.",
     "Quiet confidence, natural flow, no artificial selling emphasis"),
    ("conversation", "I was going to tell you it couldn't be done. Then I saw what Evercraft built. And now? Now I have about a hundred questions. Starting with, how?",
     "Spontaneous curiosity and a real conversational question"),
)
MODEL_SOURCE = "https://huggingface.co/hexgrad/Kokoro-82M"

def sha(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):
            h.update(chunk)
    return h.hexdigest()

def words(value):
    return re.findall(r"[^\W_]+(?:'[^\W_]+)?",value.casefold(),re.UNICODE)

def verify():
    assert len(SCENES)==3 and len(VOICES)==4
    assert set(v[0] for v in VOICES)=={"B","H","M","V"}
    assert len({s[0] for s in SCENES})==3
    assert [v[2] for v in VOICES]==[0.0,1.0,.85,None]
    assert SEED==1701
    for slug,script,direction in SCENES:
        assert words(script).count("evercraft")==1,slug
        assert 20<len(words(script))<75
        assert len(direction)>10
    print("RC20 12 neural takes validated: 3 distinct scripts, 4 voices, exact words per scene, no IPA edits")

def wav_properties(path):
    with wave.open(str(path),"rb") as w:
        n=w.getnframes()
        sr=w.getframerate()
        if not (w.getnchannels()==1 and w.getsampwidth()==2 and sr==24000 and 3<n/sr<55):
            raise RuntimeError("Unexpected sample format/duration: "+str(path))
    return {"durationSeconds":round(n/sr,3),"frames":n,"sampleRate":sr}

def render(folder):
    verify()
    import numpy as np
    import torch
    import soundfile as sf
    from kokoro import KPipeline

    dest=pathlib.Path(folder)
    dest.mkdir(parents=True,exist_ok=False)
    model=KPipeline(lang_code="a")
    bella=model.load_voice("af_bella").cpu().float()
    heart=model.load_voice("af_heart").cpu().float()
    if bella.shape!=heart.shape or not torch.isfinite(bella).all() or not torch.isfinite(heart).all():
        raise RuntimeError("Voice vectors incompatible")
    blend=torch.lerp(bella,heart,.85).contiguous()

    report={
        "schema":"evercraft.voice-foundry.rc20-performance.v1",
        "status":"private_actor_performance_listening_not_approved",
        "founderFeedback":"Founder loved RC19 audition overall; no specific RC19 voice variant approved as winner",
        "originalControlsRemainUntouched":True,
        "model":"Kokoro 82M via kokoro==0.9.4",
        "modelSource":MODEL_SOURCE,
        "modelWeightsIndependentlyPinned":False,
        "modelVoiceDataAndConsentIndependentlyVerified":False,
        "publicationAuthorized":False,
        "neuralArtisticQualityHumanApproved":False,
        "phonemeTokensManuallyChanged":False,
        "noVoiceCloningOrRecordedReference":True,
        "controlledSeedBeforeEveryTake":SEED,
        "voiceChoices":[{"code":letter,"voice":name,"heartWeight":amount,"notes":note} for letter,name,amount,note in VOICES],
        "scenes":[{"id":sid,"script":script,"directorBriefForHumanOnly":direction} for sid,script,direction in SCENES],
        "takes":[]
    }
    for scene_id,script,brief in SCENES:
        # These original phonemes are documentary evidence only, never injected or changed.
        _,original_tokens=model.g2p(script)
        names=[str(t.phonemes) for t in original_tokens
            if re.sub("[^a-z]","",str(t.text).casefold())=="evercraft"]
        if len(names)!=1:
            raise RuntimeError("Expected exactly one natural Evercraft token")
        for label,identity,weight,_ in VOICES:
            voice=blend if label=="M" else identity
            torch.manual_seed(SEED)
            np.random.seed(SEED)
            pieces=[np.asarray(g.audio,dtype=np.float32)
                    for g in model(script,voice=voice,speed=1.0)]
            if not pieces:
                raise RuntimeError("Kokoro generated no audio for "+scene_id+"/"+label)
            all_audio=np.concatenate([p for i,part in enumerate(pieces)
                for p in ((np.zeros(2400,dtype=np.float32),part) if i else (part,))])
            if not np.isfinite(all_audio).all():
                raise RuntimeError("Nonfinite waveform")
            rms=float(np.sqrt(np.mean(all_audio*all_audio)))
            peak=float(np.max(np.abs(all_audio)))
            if rms<=.004 or peak<=.02 or peak>1.05:
                raise RuntimeError("Waveform quality hold "+scene_id+"/"+label)
            wav=dest/(scene_id+"-"+label+".wav")
            mp3=dest/(scene_id+"-"+label+".mp3")
            sf.write(wav,all_audio,24000,subtype="PCM_16")
            properties=wav_properties(wav)
            subprocess.run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-y",
                "-i",str(wav),"-af","loudnorm=I=-16:TP=-1.5:LRA=11",
                "-codec:a","libmp3lame","-q:a","3",str(mp3)],check=True,timeout=120)
            if mp3.stat().st_size<1200:
                raise RuntimeError("Empty MP3 preview")
            report["takes"].append({
                "id":scene_id+"-"+label,"scene":scene_id,"voiceCode":label,
                "text":script,"normalG2pBrandPhonemes":names[0],
                "wavSha256":sha(wav),"mp3Sha256":sha(mp3),
                "rms":round(rms,6),"peak":round(peak,6),
                "chunkCount":len(pieces),**properties
            })
    (dest/"evidence.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
    sections=[]
    for sid,script,brief in SCENES:
        audio="".join('<article><h3>Take '+label+'</h3><audio controls preload="metadata" src="'+sid+"-"+label+'.mp3"></audio></article>'
                      for label,_,_,_ in VOICES)
        sections.append('<section><h2>'+html.escape(sid.title())+'</h2><p><b>Scene:</b> '+html.escape(script)+
            '</p><p>Director note for listening only: '+html.escape(brief)+'</p>'+audio+'</section>')
    page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evercraft Voice Foundry RC20 | Performance Audition</title>
<style>body{font:16px/1.5 system-ui;color:#ebf2ff;background:#101a2b;max-width:820px;margin:28px auto;padding:12px}
section{border:1px solid #65748d;padding:20px;margin:20px 0;border-radius:14px}article{padding:12px;margin:10px 0;background:#222f44;border-radius:10px}
audio{display:block;width:100%}p{color:#c3d0e3}</style><h1>RC20 | Does the voice understand the scene?</h1>
<p>Three situations, four cast alternatives per situation. The written script and fixed seed stay the same within each scene.
Directions are NOT sent to Kokoro. Listen for an earned feeling, natural question endings, the word Evercraft, and whether you believe the speaker. No casting, rights or publication approval is implied.</p>'''+''.join(sections)+'''<p>Original dry PCM WAVs, matched playback MP3s, and model evidence are included.
Check evidence.json for cast identities and limitations. Not for public release.</p></html>'''
    (dest/"LISTEN.html").write_text(page)
    print(json.dumps({"realNeuralTakes":len(report["takes"]),"status":report["status"]}))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("out",nargs="?")
    p.add_argument("--verify-only",action="store_true")
    args=p.parse_args()
    if args.verify_only:verify()
    elif args.out:render(args.out)
    else:p.error("Provide --verify-only or a new output directory")
