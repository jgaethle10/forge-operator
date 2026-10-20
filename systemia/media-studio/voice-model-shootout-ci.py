#!/usr/bin/env python3
"""Private same-script neural architecture shootout: Piper vs Kokoro."""
import argparse
import hashlib
import html
import json
import math
import pathlib
import subprocess
import wave

SCRIPT = "This is Evercraft, and this is only the beginning."
MODEL_CARD = "https://huggingface.co/hexgrad/Kokoro-82M"
PIPER_CARD = "https://huggingface.co/rhasspy/piper-voices/tree/v1.0.0/en/en_US/libritts/high"
TAKES = (
    ("V01", "piper", 14),
    ("V02", "kokoro", "af_heart"),
    ("V03", "kokoro", "am_adam"),
    ("V04", "piper", 217),
    ("V05", "kokoro", "af_bella"),
    ("V06", "kokoro", "am_michael"),
)
def digest(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for buf in iter(lambda:f.read(1048576),b""):
            h.update(buf)
    return h.hexdigest()

def verify_plan():
    assert len({r[0] for r in TAKES})==len(TAKES)
    assert sum(t[1]=="piper" for t in TAKES)==2
    assert sum(t[1]=="kokoro" for t in TAKES)==4
    assert SCRIPT=="This is Evercraft, and this is only the beginning."
    print("Six voice takes, two architectures, same exact final sentence, no external upload")

def run(args, inp=None):
    subprocess.run(args,input=inp,text=True,check=True,timeout=150)

def quality(path):
    with wave.open(str(path),"rb") as f:
        frames=f.getnframes()
        rate=f.getframerate()
        duration=frames/rate
        channels=f.getnchannels()
    if not (1.5<duration<15 and channels==1 and rate>=16000):
        raise RuntimeError("Invalid generated audio length or format")
    return {"durationSec":round(duration,3),"sampleRate":rate}

def render(piper_model,piper_config,output_dir):
    verify_plan()
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline
    model=pathlib.Path(piper_model)
    config=pathlib.Path(piper_config)
    if not model.is_file() or not config.is_file():
        raise RuntimeError("Pinned Piper baseline absent")
    destination=pathlib.Path(output_dir)
    destination.mkdir(parents=True,exist_ok=False)
    pipeline=None
    result={
        "schema":"evercraft.voice-foundry.architecture-shootout.v1",
        "status":"private_neural_audition_unverified",
        "originalWords":SCRIPT,"modelPiperSha256":digest(model),
        "modelKokoro":"hexgrad/Kokoro-82M; runtime-loaded; checkpoint SHA not independently pinned",
        "rights":"Kokoro Apache-2.0 model weights; Piper model/data licensing and attribution separately reviewed for evaluation only",
        "scoreAxes":["sentence_final_naturalness","word_to_word_cadence","semantic_stress","overall_human_likeness"],
        "speechContentActuallyRecognized":False,
        "humanListeningPerformed":False,
        "voiceActorConsentIndependentlyVerified":False,
        "commercialPublicationAuthorized":False,
        "candidates":[]
    }
    for label,engine,voice in TAKES:
        wav=destination/(label+".wav")
        mp3=destination/(label+".mp3")
        if engine=="piper":
            run(["piper","--model",str(model),"--config",str(config),
                 "--speaker",str(voice),"--output_file",str(wav)],SCRIPT+"\n")
        else:
            if pipeline is None:
                pipeline=KPipeline(lang_code="a")
            output=[]
            for _,_,audio in pipeline(SCRIPT,voice=voice,speed=1.0):
                output.append(np.asarray(audio,dtype=np.float32))
            if not output:
                raise RuntimeError("Kokoro returned no audio: "+str(voice))
            # Most short sentences yield one segment. Any stitching is declared.
            chunks=[]
            for i,audio in enumerate(output):
                if i: chunks.append(np.zeros(2400,dtype=np.float32))
                chunks.append(audio)
            sf.write(wav,np.concatenate(chunks),24000,subtype="PCM_16")
        info=quality(wav)
        run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-y",
             "-i",str(wav),"-af","loudnorm=I=-16:TP=-1.5:LRA=11",
             "-codec:a","libmp3lame","-q:a","3",str(mp3)])
        result["candidates"].append({
            "blindId":label,"engine":engine,"engineVoice":str(voice),
            "segmentStitchCount":(len(output)-1 if engine=="kokoro" else 0),
            "wavSha256":digest(wav),"mp3Sha256":digest(mp3),
            "mp3Presentation":"level-matched through ffmpeg loudnorm for blind playback; dry WAV retained",
            **info
        })
    (destination/"provenance.json").write_text(json.dumps(result,indent=2)+"\n")
    blocks="".join("<section><h2>"+label+"</h2><audio controls preload='metadata' src='"+label+
         ".mp3'></audio><fieldset><legend>Listener ratings (1 to 5)</legend>"+
         "".join("<label>"+html.escape(axis.replace("_"," ").title())+
                 " <input type='range' min='1' max='5' value='3' step='1' data-item='"+label+
                 "' data-axis='"+axis+"'></label>" for axis in result["scoreAxes"])+
         "</fieldset></section>" for label,_,_ in TAKES)
    page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evercraft Blind Voice Shootout</title>
<style>body{margin:30px auto;max-width:800px;padding:0 20px;background:#111927;color:#eff3fc;font:16px/1.5 system-ui}section{padding:16px 22px;border:1px solid #68728a;border-radius:15px;margin:20px 0}audio{width:100%}label{display:flex;justify-content:space-between;gap:15px;margin:8px 0}fieldset{border:0;padding:0}button{font:inherit;padding:12px 20px;border-radius:9px;background:#c8e1ff;color:#102137;border:0}p{color:#ccd5e4}</style>
<h1>Voice Foundry | Blind Model Shootout</h1>
<p>Six real neural takes, same words. Compare the robotic sentence ending, uneven word cadence, intended emphasis and human likeness. Names hidden until after ratings. Playback MP3s were only level-matched; dry WAVs are retained. No voice is approved for release.</p>
<p><strong>Script:</strong> '''+html.escape(SCRIPT)+'''</p>'''+blocks+'''
<button id="export">Export my listening scores</button>
<p>Ratings are local, self-reported and unauthenticated. Neither this room nor its results establish rights, accent identity or release approval.</p>
<script>document.getElementById('export').onclick=()=>{let result={schema:'evercraft.voice-foundry.architecture-listening-draft.v1',status:'unverified_human_draft',publicationAuthorityGranted:false,scores:{}};for(const slider of document.querySelectorAll('input[data-item]')){let id=slider.dataset.item;(result.scores[id]??={})[slider.dataset.axis]=Number(slider.value)}let a=document.createElement('a'),blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'});a.href=URL.createObjectURL(blob);a.download='voice-shootout-listening-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)};</script></html>'''
    (destination/"index.html").write_text(page)
    print(json.dumps({"status":result["status"],"generated":len(result["candidates"]),"models":["Piper","Kokoro"]}))

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("piper_model",nargs="?")
    ap.add_argument("piper_config",nargs="?")
    ap.add_argument("out_dir",nargs="?")
    ap.add_argument("--verify-only",action="store_true")
    args=ap.parse_args()
    if args.verify_only:verify_plan()
    elif all([args.piper_model,args.piper_config,args.out_dir]):render(args.piper_model,args.piper_config,args.out_dir)
    else:ap.error("Provide model, config and a new output folder")
