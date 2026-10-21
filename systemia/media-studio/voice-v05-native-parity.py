#!/usr/bin/env python3
"""Recovery investigation: native Kokoro V05 versus UNMODIFIED token-based invocation.

No IPA edits or punctuation changes. Re-seed every rendering for a fair
diagnostic comparison; NEVER claim waveform parity or improved acting by default.
"""
import argparse
import hashlib
import html
import json
import pathlib
import re
import subprocess
import wave

VOICE="af_bella"
SEED=1701
SCENES=(
 ("tagline","This is Evercraft, and this is only the beginning."),
 ("brand","Evercraft is building the tools that make tomorrow possible."),
 ("promise","With Evercraft, the work gets done and the promise means something."),
)
PATHS=("native_first","native_repeat","tokens_unmodified")
def normalized_words(text):
 return re.findall(r"[^\W_]+(?:'[^\W_]+)?",text.casefold(),re.UNICODE)
def preflight():
 assert len(SCENES)==3 and len(PATHS)==3
 assert all(normalized_words(x).count("evercraft")==1 for _,x in SCENES)
 assert VOICE=="af_bella"
 assert SEED==1701
 assert PATHS[1]=="native_repeat" and PATHS[2]=="tokens_unmodified"
 print("V05 recovery preflight: nine private takes; same script, voice, seed, zero IPA mutations")
def sha_file(p):
 h=hashlib.sha256()
 with open(p,"rb") as f:
  for chunk in iter(lambda:f.read(1024*1024),b""):
   h.update(chunk)
 return h.hexdigest()
def pcm_sha(arr):
 return hashlib.sha256(arr.tobytes()).hexdigest()
def run(args):
 subprocess.run(args,check=True,timeout=100)
def render(output):
 preflight()
 import numpy as np
 import soundfile as sf
 import torch
 from kokoro import KPipeline
 folder=pathlib.Path(output)
 folder.mkdir(parents=True,exist_ok=False)
 pipe=KPipeline(lang_code="a")
 report={
  "schema":"evercraft.voice-foundry.v05-generation-path-parity.v1",
  "status":"private_debug_only_not_a_pronunciation_fix",
  "originalSuccessfulPath":"KPipeline(text,voice='af_bella',speed=1.0)",
  "failedExperimentPath":"KPipeline.generate_from_tokens(g2p(text).tokens,voice='af_bella',speed=1.0)",
  "testingGoal":"Separate API-path effects and run-to-run variability from lexical edits.",
  "scriptTextChanged":False,
  "phonemeTokensAltered":False,
  "speakerIdentityAltered":False,
  "seedPerTake":SEED,
  "modelWeightsIndependentlyPinned":False,
  "humanNaturalnessVerified":False,
  "publicationAuthorityGranted":False,
  "scenes":[],
  "takes":[]
 }
 for scene,text in SCENES:
  parsed=pipe.g2p(text)
  if not isinstance(parsed,tuple) or len(parsed)!=2 or not isinstance(parsed[1],list):
   raise RuntimeError("Unexpected Kokoro g2p API; stop.")
  tokens=parsed[1]
  matches=[token for token in tokens if re.sub(r"[^a-z]","",str(token.text).lower())=="evercraft"]
  if len(matches)!=1:
   raise RuntimeError("Expected one Evercraft token, observed "+repr([(str(t.text),str(t.phonemes)) for t in tokens]))
  original_ipa=str(matches[0].phonemes)
  # Auditable non-mutating token snapshot with all words.
  token_digest=hashlib.sha256(json.dumps([
   {"text":str(t.text),"phonemes":str(t.phonemes)} for t in tokens
  ],ensure_ascii=False,sort_keys=True).encode()).hexdigest()
  report["scenes"].append({"scene":scene,"script":text,
   "evercraftOriginalIPA":original_ipa,
   "sourceG2PTokensSha256":token_digest,"tokenCount":len(tokens)})
  for kind in PATHS:
   torch.manual_seed(SEED)
   np.random.seed(SEED)
   if kind.startswith("native"):
    parts=[np.asarray(a,dtype=np.float32) for _,_,a in pipe(text,voice=VOICE,speed=1.0)]
   else:
    # Preserve exact phonemes; do not write to the token objects.
    parts=[np.asarray(x.audio,dtype=np.float32) for x in pipe.generate_from_tokens(tokens,voice=VOICE,speed=1.0)]
   if not parts:raise RuntimeError("Kokoro returned no audio for "+scene+" "+kind)
   audio=np.concatenate([block for i,p in enumerate(parts)
      for block in ((np.zeros(2400,dtype=np.float32),p) if i else (p,))])
   candidate=scene+"-"+kind
   wav=folder/(candidate+".wav")
   mp3=folder/(candidate+".mp3")
   sf.write(wav,audio,24000,subtype="PCM_16")
   with wave.open(str(wav),"rb") as w:
    duration=w.getnframes()/w.getframerate()
    if w.getnchannels()!=1 or w.getsampwidth()!=2 or not 2<duration<24:
     raise RuntimeError("Invalid audio produced for "+candidate)
   run(["ffmpeg","-nostdin","-v","error","-y","-i",str(wav),"-af",
       "loudnorm=I=-16:TP=-1.5:LRA=11","-codec:a","libmp3lame","-q:a","3",str(mp3)])
   report["takes"].append({
    "id":candidate,"scene":scene,"generationPath":kind,"voice":VOICE,
    "script":text,"seed":SEED,"g2pTokensSha256":token_digest,
    "unchangedEvercraftIPA":original_ipa,"wavSha256":sha_file(wav),
    "mp3Sha256":sha_file(mp3),"floatSourceSha256":pcm_sha(audio),
    "rawSamples":len(audio),"durationSec":round(duration,3),
    "segments":len(parts),"normalizedOnlyOnMP3":True
   })
 pairs=[]
 for scene,_ in SCENES:
  indexed={x["generationPath"]:x for x in report["takes"] if x["scene"]==scene}
  fst=indexed["native_first"];rep=indexed["native_repeat"];tok=indexed["tokens_unmodified"]
  pairs.append({
   "scene":scene,
   "nativeRepeatedIdentically":fst["floatSourceSha256"]==rep["floatSourceSha256"],
   "tokenRouteIdenticalToNative":fst["floatSourceSha256"]==tok["floatSourceSha256"],
   "nativeDurationSec":fst["durationSec"],
   "passThroughTokensDurationSec":tok["durationSec"],
   "durationDifferenceSec":round(tok["durationSec"]-fst["durationSec"],3),
   "interpretation":"A difference is measurable source/output-path variance, NOT automatically evidence of degraded naturalness."
  })
 report["pairedFindings"]=pairs
 report["sourcePathParityDemonstrated"]=all(p["tokenRouteIdenticalToNative"] for p in pairs)
 (folder/"path-parity-evidence.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
 blocks=[]
 for scene,script in SCENES:
  players="".join("<article><b>"+kind.replace("_"," ").title()+"</b><audio controls preload='metadata' src='"+scene+"-"+kind+".mp3'></audio></article>" for kind in PATHS)
  blocks.append("<section><h2>"+scene.title()+"</h2><p>"+html.escape(script)+"</p>"+players+"</section>")
 page="""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>V05 source restoration lab</title>
<style>body{background:#101b29;color:#f3f6ff;max-width:850px;margin:34px auto;padding:0 20px;font:16px/1.5 system-ui}section{border:1px solid #60708c;border-radius:15px;padding:18px;margin:22px 0}article{background:#243247;border-radius:10px;padding:12px;margin:12px 0}audio{display:block;width:100%}p{color:#baccdc}</style>
<h1>Evercraft Voice Foundry | Restore Bella</h1>
<p>V05 af_bella was loved in the first Kokoro shootout, but later phoneme experiments sounded wrong. Here we compare the original **native text pipeline** twice against **unchanged phoneme tokens**. Every take has the same script, speaker, seed and original pronunciation. No vowel, consonant, stress or punctuation edits.</p>
<p>Listen for word connections, tone, and whether the end of the thought feels natural. A different waveform alone is not proof of better or worse performance.</p>"""+"".join(blocks)+"""
<p>The last path is a diagnostic only. Our production/default choice remains the original native pipeline pending human review. All source WAV hashes and evidence are in path-parity-evidence.json. No licensing or commercial publication approval.</p></html>"""
 (folder/"index.html").write_text(page)
 print(json.dumps({"generated":len(report["takes"]),"parity":pairs,"approval":"NONE"},ensure_ascii=False))
if __name__=="__main__":
 p=argparse.ArgumentParser()
 p.add_argument("output_dir",nargs="?")
 p.add_argument("--verify-only",action="store_true")
 args=p.parse_args()
 if args.verify_only:preflight()
 elif args.output_dir:render(args.output_dir)
 else:p.error("Provide a new output directory or --verify-only")
