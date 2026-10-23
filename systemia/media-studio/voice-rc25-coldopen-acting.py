#!/usr/bin/env python3
"""RC25: opening-first acting and casting research, deliberately changing the setup, not 'fixing' phonemes."""
import argparse, hashlib, html, json, pathlib, subprocess, wave
SEED=1701
BRIDGE="Then you open your laptop. Six tabs. Three workarounds. And somehow, you haven't even started."
HOOKS=(
 ("A","Ever had an idea you couldn't wait to build?","Exact original words, tested through a different model"),
 ("B","You get this idea, and suddenly you can see the whole thing in your head. You just want to start.","Begin inside the imaginative rush, not an announcer's question"),
 ("C","It's that moment when an idea hits and you think, wait, I could actually make this.","Private, half-spoken realization rather than a rhetorical invitation"),
)
DIALOGUE=(
 ("one","Hold on. I've got an idea."),
 ("two","Okay. Tell me."),
 ("one","I think I can actually make this work."),
)
ENGINES=("kokoro","chatterbox")
def sha(p):
 h=hashlib.sha256()
 with open(p,"rb") as f:
  for x in iter(lambda:f.read(1048576),b""):h.update(x)
 return h.hexdigest()
def validate():
 assert len(HOOKS)==3 and len(DIALOGUE)==3
 assert [x[0] for x in HOOKS]==["A","B","C"]
 assert HOOKS[0][1]=="Ever had an idea you couldn't wait to build?"
 assert all("Evercraft" not in h for _,h,_ in HOOKS)
 assert "Six tabs. Three workarounds." in BRIDGE
 assert len({x[1] for x in HOOKS})==3
 assert set(x[0] for x in DIALOGUE)=={"one","two"}
 assert SEED==1701 and ENGINES==("kokoro","chatterbox")
 print("RC25 preflight passed: 3 distinct openings, one shared frustration beat, genuine exchange, original control unchanged")
def wavinfo(p):
 with wave.open(str(p),"rb") as w:
  sr=w.getframerate();n=w.getnframes()
  if w.getnchannels()!=1 or w.getsampwidth()!=2 or not 16000<=sr<=48000 or not 2.0<n/sr<40:
   raise RuntimeError("Invalid neural source WAV "+p.name)
 return {"sampleRate":sr,"frames":n,"durationSec":round(n/sr,3)}
def render(folder,engine):
 validate()
 if engine not in ENGINES:raise RuntimeError("Unsupported engine "+str(engine))
 import numpy as np
 import soundfile as sf
 import torch
 out=pathlib.Path(folder);out.mkdir(parents=True,exist_ok=False)
 torch.set_num_threads(2)
 manifest={"schema":"evercraft.voice-foundry.rc25-in-the-moment-coldopen.v1",
  "engine":engine,"status":"private_unapproved_casting_and_script_audition",
  "founderFeedback":"RC24 opening still not natural; investigate emotion and acting rather than more tempo/phoneme edits",
  "originalRC22AndRC24AudioModified":False,
  "modelAndVoiceRightsIndependentlyVerified":False,
  "speakerIdentityContinuityAcrossEnginesEstablished":False,
  "humanNaturalnessImprovementVerified":False,
  "publicationAuthorized":False,
  "noCloningReferenceAudio":True,
  "noManualPhonemeEdits":True,
  "modelWeightsPinnedByDigest":False,
  "seed":SEED,"sharedBridge":BRIDGE,
  "hooks":[{"id":code,"hook":h,"directorNoteNotSentToModel":note} for code,h,note in HOOKS],
  "takes":[]}
 if engine=="kokoro":
  from kokoro import KPipeline
  pipe=KPipeline(lang_code="a")
  bella=pipe.load_voice("af_bella").cpu().float()
  heart=pipe.load_voice("af_heart").cpu().float()
  if bella.shape!=heart.shape or not torch.isfinite(bella).all() or not torch.isfinite(heart).all():
   raise RuntimeError("Unexpected voice packs")
  blend=torch.lerp(bella,heart,.85).contiguous()
  casting=(("H","af_heart"),("N",blend))
  def speak(text,voice,seed):
   torch.manual_seed(seed);np.random.seed(seed)
   parts=[np.asarray(a.audio,dtype=np.float32) for a in pipe(text,voice=voice,speed=1)]
   if not parts:raise RuntimeError("Kokoro generated no audio")
   return np.concatenate([a for i,p in enumerate(parts) for a in ((np.zeros(1800,dtype=np.float32),p) if i else (p,))])
  sr=24000
 else:
  from chatterbox.tts import ChatterboxTTS
  chatter=ChatterboxTTS.from_pretrained(device="cpu")
  sr=chatter.sr
  casting=(("neutral",(.5,.5)),("expressive",(.75,.3)))
  def speak(text,settings,seed):
   torch.manual_seed(seed);np.random.seed(seed)
   exaggerated,cfg=settings
   with torch.inference_mode():
    return chatter.generate(text,exaggeration=exaggerated,cfg_weight=cfg).detach().cpu().float().numpy().reshape(-1)
 def emit(key,audio,mode,text,extra):
  if not np.isfinite(audio).all() or float(np.sqrt(np.mean(audio*audio)))<.003 or float(np.max(np.abs(audio)))>1.2:
   raise RuntimeError("Invalid neural take "+key)
  wav=out/(key+".wav");mp3=out/(key+".mp3")
  sf.write(wav,audio,sr,subtype="PCM_16")
  info=wavinfo(wav)
  subprocess.run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-y","-i",str(wav),
   "-af","loudnorm=I=-16:TP=-1.5:LRA=11","-codec:a","libmp3lame","-q:a","3",str(mp3)],check=True,timeout=90)
  if mp3.stat().st_size<1200:raise RuntimeError("Empty preview "+key)
  manifest["takes"].append({"id":key,"mode":mode,"script":text,"wavSha256":sha(wav),"mp3Sha256":sha(mp3),**extra,**info})
 for code,hook,_ in HOOKS:
  for variant,voice in casting:
   full=hook+" "+BRIDGE
   audio=speak(full,voice,SEED)
   emit(code+"-"+variant,audio,"spoken_narration",full,{"hook":code,"cast":variant})
 if engine=="kokoro":
  # Multi-actor conversation truly rendered in separate identities, then full-utterance joined.
  segments=[]
  for i,(speaker,line) in enumerate(DIALOGUE):
   voice="am_michael" if speaker=="one" else "af_heart"
   segments.append(speak(line,voice,SEED+i))
   segments.append(np.zeros(round(sr*(.28 if i==0 else .18)),dtype=np.float32))
  segments.append(speak(BRIDGE,"af_heart",SEED+len(DIALOGUE)))
  result=np.concatenate(segments)
  text=" ".join(line for _,line in DIALOGUE)+" "+BRIDGE
  emit("D-duet",result,"actual_alternating_neural_voices",text,{
   "cast":"am_michael_plus_af_heart","stagedFictionNotCustomerTestimony":True,
   "pausesBetweenCompleteLinesOnly":True})
 wanted=7 if engine=="kokoro" else 6
 if len(manifest["takes"])!=wanted:raise RuntimeError("Incomplete neural experiment")
 (out/"evidence.json").write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+"\n")
 clips="".join('<section><h3>'+html.escape(t["id"])+'</h3><p>'+html.escape(t["script"])+'</p><audio controls src="'+t["id"]+'.mp3"></audio></section>' for t in manifest["takes"])
 page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evercraft RC25 In the Moment</title><style>body{max-width:860px;margin:20px auto;padding:20px;background:#121b29;color:#f2f5fe;font:16px/1.5 system-ui}section{border:1px solid #596a82;margin:15px 0;padding:18px;border-radius:14px;background:#243148}audio{width:100%}p{color:#cdd8eb}</style><h1>RC25 | Start inside the idea</h1><p>Founder rejected the announcer-like ramp of RC24. This private set tests different opening structures. Chatterbox voice is NOT the same as Kokoro Heart. No recording has been approved as more natural; licensing and final ad release remain open.</p>'''+clips+"</html>"
 (out/"LISTEN.html").write_text(page)
 print(json.dumps({"engine":engine,"rendered":len(manifest["takes"]),"status":manifest["status"]}))
if __name__=="__main__":
 p=argparse.ArgumentParser()
 p.add_argument("out",nargs="?")
 p.add_argument("--engine",choices=ENGINES)
 p.add_argument("--verify-only",action="store_true")
 a=p.parse_args()
 if a.verify_only:validate()
 elif a.out and a.engine:render(a.out,a.engine)
 else:p.error("Provide --verify-only or both output folder and --engine")
