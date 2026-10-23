#!/usr/bin/env python3
"""Private stage-two neural auditions: top three owner-favorite voices across scene types.

Factual limits: Kokoro weights are resolved at runtime and are not digest-pinned.
These are audio generations, not human acting, consent or publication certificates.
"""
import array
import hashlib
import html
import json
import math
import pathlib
import subprocess
import sys
import wave

VOICES=(("voice-02","af_heart"),("voice-05","af_bella"),("voice-06","am_michael"))
SCENES=(
 ("documentary","Documentary: discovery in the dark",
  "That night, the harbor went silent. No warning, no second chance. "
  "But somewhere beyond the breakwater, a small crew made a decision that would change everything.",
  "Quiet curiosity changing into earned gravity, not exaggerated announcer emphasis"),
 ("conversation","Conversation: intimate reassurance",
  "I know today didn't go the way you hoped. You don't have to pretend it did. "
  "I'm here, and we can figure out what comes next. One step at a time.",
  "Present and reassuring, phrases linked naturally without exaggerated sentiment"),
 ("commercial","Commercial: restrained confidence",
  "Good ideas don't need louder promises. They need people who show up, do the work, "
  "and get it right. That's how trust is built. And it's why Evercraft exists.",
  "Thoughtful assurance, warm human cadence and a sentence ending that resolves naturally"),
)
AXES=("sentence_final_naturalness","word_to_word_cadence","emotion_and_intention","identity_consistency")
def digest(file):
 h=hashlib.sha256()
 with open(file,"rb") as f:
  for chunk in iter(lambda:f.read(1048576),b""):h.update(chunk)
 return h.hexdigest()
def verify_plan():
 assert len(VOICES)==3 and len(SCENES)==3
 assert {v for _,v in VOICES}=={"af_heart","af_bella","am_michael"}
 assert len({x[0] for x in SCENES})==3
 assert all(20<=len(s.split())<=65 for _,_,s,_ in SCENES)
 print("9 controlled, same-script-per-scene takes; V02/V05/V06 only; 3 narrative styles")
def run(args):
 subprocess.run(args,check=True,timeout=140)
def metrics(file):
 with wave.open(str(file),"rb") as w:
  samples=array.array("h",w.readframes(w.getnframes()))
  duration=w.getnframes()/w.getframerate()
  sr=w.getframerate()
  if w.getnchannels()!=1 or w.getsampwidth()!=2 or not (3<duration<80):
   raise RuntimeError("invalid generated WAV")
  rms=math.sqrt(sum(float(n)*n for n in samples)/len(samples))/32768
  if rms<.005:raise RuntimeError("silent neural take")
 return dict(durationSec=round(duration,3),sampleRate=sr,rms=round(rms,5))
def render(directory):
 verify_plan()
 import numpy as np
 import soundfile as sf
 from kokoro import KPipeline
 out=pathlib.Path(directory)
 out.mkdir(parents=True,exist_ok=False)
 engine=KPipeline(lang_code="a")
 report={
  "schema":"evercraft.voice-foundry.top3.scene-shootout.v1",
  "status":"real_neural_audio_private_audition_only",
  "source":"https://huggingface.co/hexgrad/Kokoro-82M",
  "modelLicenseClaim":"Apache-2.0 published weights; verify voice/dataset/attribution separately",
  "modelCheckpointSha256":None,
  "modelActuallyPinned":False,
  "ownerStatedPreference":{"V02":"amazing","V05":"dope","V06":"best masculine-presenting","remainingCandidates":"none judged bad"},
  "scenes":[{"id":id,"title":title,"script":script,"directorBriefNotPassedToModel":brief}
   for id,title,script,brief in SCENES],
  "axes":list(AXES),
  "candidates":[],
  "editorialVoicePerformanceApproved":False,
  "humanListenerScoresCollected":False,
  "rightsConsentIndependentlyVerified":False,
  "commercialPublicationAuthorized":False,
 }
 for scene_id,scene_title,text,brief in SCENES:
  for anon,voice in VOICES:
   id=f"{scene_id}-{anon}"
   wav=out/(id+".wav")
   mp3=out/(id+".mp3")
   pieces=[np.asarray(audio,dtype=np.float32) for _,_,audio in engine(text,voice=voice,speed=1.0)]
   if not pieces:raise RuntimeError("no audio rendered for "+id)
   separator=np.zeros(2400,dtype=np.float32)
   samples=np.concatenate([x for i,p in enumerate(pieces) for x in ((separator,p) if i else (p,))])
   sf.write(wav,samples,24000,subtype="PCM_16")
   info=metrics(wav)
   run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-y","-i",str(wav),
    "-af","loudnorm=I=-16:TP=-1.5:LRA=11","-codec:a","libmp3lame","-q:a","3",str(mp3)])
   report["candidates"].append(dict(id=id,scene=scene_id,voiceReference=anon,
    voiceModelId=voice,chunkCount=len(pieces),stitchGapSec=.1 if len(pieces)>1 else 0,
    wavSha256=digest(wav),mp3Sha256=digest(mp3),wav=wav.name,mp3=mp3.name,**info))
 (out/"voice-scene-report.json").write_text(json.dumps(report,indent=2)+"\n")
 cards=[]
 for sid,title,script,brief in SCENES:
  audios=[]
  for vid,_ in VOICES:
   id=f"{sid}-{vid}"
   audios.append(f"<article><h3>{html.escape(vid)}</h3><audio controls preload='metadata' src='{id}.mp3'></audio></article>")
  cards.append("<section><h2>"+html.escape(title)+"</h2><p><b>Script:</b> "+
    html.escape(script)+"</p><p><b>Director's note, not transmitted to TTS:</b> "+
    html.escape(brief)+"</p>"+"".join(audios)+"</section>")
 page="""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evercraft Voice Foundry: favorite voices across scenes</title>
<style>body{background:#121823;color:#edf3ff;max-width:830px;margin:35px auto;padding:0 20px;font:16px/1.5 system-ui}section{border:1px solid #52617d;border-radius:15px;padding:20px;margin:24px 0}article{margin:13px 0;background:#202b3d;padding:12px 20px;border-radius:10px}audio{width:100%}p{color:#c2cce1}</style>
<h1>Voice Foundry | Second audition: performance across scenes</h1>
<p>Owner shortlisted 02 (favorite), 05 (runner-up) and 06 (masculine-presenting choice). All three read the exact same words within each scene at default speed. Compare endings, rhythm, interpretation, and consistent voice identity. Voice-model names are in the audit report. These are not licensed/published performances.</p>
"""+"".join(cards)+"""
<p><b>Limits:</b> Director's notes are reviewer prompts, not synthesis controls; the model does not receive stage directions. Original dry WAV files and level-matched listening MP3s are provided. Model checkpoint is not independently SHA-pinned. No rights or publication approvals.</p></html>"""
 (out/"index.html").write_text(page)
 print(json.dumps({"actualNeuralRenders":len(report["candidates"]), "status":report["status"]}))
if __name__=="__main__":
 if sys.argv[1:]==["--verify-only"]:verify_plan()
 elif len(sys.argv)==2:render(sys.argv[1])
 else:raise SystemExit("Usage: voice-top3-scene-auditions.py --verify-only OR <new-output-directory>")
