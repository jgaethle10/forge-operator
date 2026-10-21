#!/usr/bin/env python3
"""RC24: founder-guided opening intention experiment; original RC22 immutable."""
import argparse, hashlib, html, json, pathlib, subprocess, wave

SEED=1701
BRIDGE="Then you open your laptop. Six tabs. Three workarounds. And somehow, you haven't even started."
HOOK="Ever had an idea you couldn't wait to build?"
CONDITIONS=(
 ("A",HOOK,1.00,"Original hook, original rate"),
 ("B",HOOK,.94,"Original words, more relaxed pacing"),
 ("C","Ever had an idea you just couldn't wait to build?",1.00,"A more spontaneous just"),
 ("D","You ever have an idea you just couldn't wait to build?",1.00,"Conversation, not public address"),
 ("E","You know that moment when an idea hits and you can't wait to build it?",1.00,"Start inside anticipation"),
 ("F","You know that feeling? You've got an idea, and you just have to build it.",1.00,"Grounded excitement instead of rhetorical question"),
)
VOICES=(("H","af_heart",1.0),("N","heart_near_85",.85),("B","af_bella",0.0))
def sha(path):
 h=hashlib.sha256()
 with open(path,"rb") as f:
  for chunk in iter(lambda:f.read(1048576),b""):h.update(chunk)
 return h.hexdigest()
def preflight():
 assert len(CONDITIONS)==6 and len(VOICES)==3
 assert [x[0] for x in CONDITIONS]==list("ABCDEF")
 assert [x[0] for x in VOICES]==["H","N","B"]
 assert [x[2] for x in VOICES]==[1.,.85,0.]
 assert CONDITIONS[0][1]==CONDITIONS[1][1]==HOOK
 assert CONDITIONS[0][2]==1 and CONDITIONS[1][2]==.94
 assert all(.9<=x[2]<=1.05 for x in CONDITIONS)
 assert BRIDGE=="Then you open your laptop. Six tabs. Three workarounds. And somehow, you haven't even started."
 assert SEED==1701
 print("RC24 18 opening auditions validated: exact hook reference, same bridge, no altered phonemes")
def validate_wav(p):
 with wave.open(str(p),"rb") as w:
  frames=w.getnframes()
  if (w.getnchannels(),w.getsampwidth(),w.getframerate())!=(1,2,24000) or not 3<frames/24000<24:
   raise RuntimeError("Unexpected PCM sound "+p.name)
 return {"durationSec":round(frames/24000,3),"sampleRate":24000,"frames":frames}
def run(directory):
 preflight()
 import numpy as np, torch, soundfile as sf
 from kokoro import KPipeline
 dest=pathlib.Path(directory)
 dest.mkdir(parents=True,exist_ok=False)
 pipe=KPipeline(lang_code="a")
 bella=pipe.load_voice("af_bella").cpu().float()
 heart=pipe.load_voice("af_heart").cpu().float()
 if bella.shape!=heart.shape or not torch.isfinite(bella).all() or not torch.isfinite(heart).all():
  raise RuntimeError("Voice embedding issue")
 near=torch.lerp(bella,heart,.85).contiguous()
 evidence={"schema":"evercraft.voice-foundry.rc24-opening-intention.v1",
   "status":"private_unapproved_listening",
   "founderFeedback":"The original Ever had an idea opening has a rough unnatural buildup; should feel different",
   "model":"Kokoro-82M kokoro==0.9.4",
   "modelWeightsDigestIndependentlyPinned":False,
   "commercialVoiceRightsVerified":False,
   "audibleHumanImprovementApproved":False,
   "commercialReleaseAuthorized":False,
   "originalRC22AudioModified":False,
   "noVoiceCloneOrReferenceAudio":True,"phonemeEdits":False,
   "randomSeed":SEED,"originalHook":HOOK,"sharedBridge":BRIDGE,
   "conditions":[{"id":l,"hook":h,"speed":speed,"intent":note} for l,h,speed,note in CONDITIONS],
   "voices":[{"id":c,"voice":name,"heartWeight":w} for c,name,w in VOICES],"takes":[]}
 for label,hook,speed,_ in CONDITIONS:
  script=hook+" "+BRIDGE
  for code,name,weight in VOICES:
   torch.manual_seed(SEED)
   np.random.seed(SEED)
   voice=near if code=="N" else name
   chunks=[np.asarray(c.audio,dtype=np.float32) for c in pipe(script,voice=voice,speed=speed)]
   if not chunks:raise RuntimeError("Missing real Kokoro speech")
   samples=np.concatenate([p for i,a in enumerate(chunks) for p in ((np.zeros(2400,dtype=np.float32),a) if i else (a,))])
   if not np.isfinite(samples).all() or np.sqrt(np.mean(samples*samples))<.003:
    raise RuntimeError("Silent or nonfinite neural output")
   stem=label+"-"+code
   wav=dest/(stem+".wav"); mp3=dest/(stem+".mp3")
   sf.write(wav,samples,24000,subtype="PCM_16")
   info=validate_wav(wav)
   subprocess.run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-y","-i",str(wav),
     "-af","loudnorm=I=-16:TP=-1.5:LRA=11","-codec:a","libmp3lame","-q:a","3",str(mp3)],
      check=True,timeout=100)
   if mp3.stat().st_size<1000:raise RuntimeError("Missing MP3")
   evidence["takes"].append({"id":stem,"condition":label,"voiceCode":code,"script":script,
      "speed":speed,"heartWeight":weight,"wavSha256":sha(wav),"mp3Sha256":sha(mp3),
      "chunkCount":len(chunks),**info})
 if len(evidence["takes"])!=18:raise RuntimeError("Incomplete auditions")
 (dest/"evidence.json").write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+"\n")
 sections=[]
 for label,hook,_,note in CONDITIONS:
  audios="".join('<article><b>Voice '+code+'</b><audio controls preload="metadata" src="'+label+"-"+code+'.mp3"></audio></article>' for code,_,_ in VOICES)
  sections.append('<section><h2>Take '+label+'</h2><p>'+html.escape(hook)+'</p><small>'+html.escape(note)+'</small>'+audios+'</section>')
 page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <title>RC24 First Line</title><style>body{max-width:800px;margin:24px auto;padding:18px;background:#12192a;color:#f2f6ff;font:16px/1.5 system-ui}section{border:1px solid #536483;border-radius:13px;margin:20px 0;padding:20px}article{background:#29344a;padding:13px;border-radius:9px;margin:10px 0}audio{width:100%;display:block}p,small{color:#bfcde6}</style><h1>RC24: An idea should feel exciting</h1><p>Founder identified unnatural buildup in original line. Compare anticipation on the idea versus a rehearsed pitch. Every take shares the same next lines. A/B share exact words but use different speed. The original RC22 WAV is preserved separately. Private listening only.</p>'''+''.join(sections)+'</html>'
 (dest/"LISTEN.html").write_text(page)
 print(json.dumps({"rendered":len(evidence["takes"]),"status":evidence["status"]}))
if __name__=="__main__":
 p=argparse.ArgumentParser()
 p.add_argument("out",nargs="?")
 p.add_argument("--verify-only",action="store_true")
 a=p.parse_args()
 if a.verify_only:preflight()
 elif a.out:run(a.out)
 else:p.error("Provide --verify-only or a new output dir")
