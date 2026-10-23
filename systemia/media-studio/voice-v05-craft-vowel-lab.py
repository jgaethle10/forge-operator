#!/usr/bin/env python3
"""Evercraft: isolate the vowel inside 'craft' using af_bella, never overwrite approved pronunciation.

Vowel candidates change ONLY the vowel immediately before /ft/ in 'Evercraft'.
They are exploratory phonetic alternates, not automatically more correct.
"""
import argparse
import copy
import hashlib
import html
import json
import pathlib
import re
import subprocess
import wave

VOICE="af_bella"
SCENES=(
 ("tagline","This is Evercraft, and this is only the beginning."),
 ("brand","Evercraft is building the tools that make tomorrow possible."),
 ("promise","With Evercraft, the work gets done and the promise means something."),
)
VARIANTS=(("original",None),("short_a","æ"),("open_ah","ɑ"))
VOCAB_VOWEL=r"[æɑɐa]"
def words(text):
 return re.findall(r"[^\W_]+(?:'[^\W_]+)?",text.casefold(),re.UNICODE)
def validate():
 assert len(SCENES)==3 and len(VARIANTS)==3
 assert all(words(line).count("evercraft")==1 for _,line in SCENES)
 assert all("evercraft" in line.lower() for _,line in SCENES)
 assert {v for _,v in VARIANTS if v is not None}=={"æ","ɑ"}
 print("Evercraft V05 word-vowel lab: three scripts, three vowel conditions; all lexical stress unchanged")
def digest(path):
 h=hashlib.sha256()
 with open(path,"rb") as f:
  for part in iter(lambda:f.read(1048576),b""):h.update(part)
 return h.hexdigest()
def amended_tokens(pipeline,text,wanted):
 phonemes,tokens=pipeline.g2p(text)
 if not isinstance(tokens,list):raise RuntimeError("Kokoro G2P token list unavailable")
 selected=[t for t in tokens if re.sub(r"[^a-z]","",str(t.text).lower())=="evercraft"]
 if len(selected)!=1:
  raise RuntimeError("Expected exactly one Evercraft token; observed "+repr([(str(t.text),str(t.phonemes)) for t in tokens]))
 token=selected[0]
 original=str(token.phonemes or "")
 # Only alter /a/ class directly before final /ft/. Never move IPA stress.
 match=re.search(r"("+VOCAB_VOWEL+r")(?=ː?ft(?:\b|$))",original)
 if not match:
  raise RuntimeError("Cannot safely isolate the vowel of craft: "+repr(original))
 current=match.group(1)
 candidate=(original[:match.start(1)]+wanted+original[match.end(1):]) if wanted else original
 without_vowel=lambda x:x[:match.start(1)]+x[match.start(1)+1:]
 if without_vowel(candidate)!=without_vowel(original):
  raise RuntimeError("Consonants or stress would change; rejecting")
 if original.count("ˈ")!=candidate.count("ˈ") or original.count("ˌ")!=candidate.count("ˌ"):
  raise RuntimeError("Lexical stress markers would change; rejecting")
 altered=copy.deepcopy(tokens)
 for token_copy in altered:
  if re.sub(r"[^a-z]","",str(token_copy.text).lower())=="evercraft":
   token_copy.phonemes=candidate
 return altered,{"original":original,"candidate":candidate,
   "originalVowel":current,"candidateVowel":wanted or current,
   "changed":candidate!=original,"stressMarkersPreserved":True,
   "otherPhonemeCharactersPreserved":True}
def run(args):
 subprocess.run(args,check=True,timeout=100)
def render(path):
 validate()
 import numpy as np
 import soundfile as sf
 from kokoro import KPipeline
 out=pathlib.Path(path)
 out.mkdir(parents=True,exist_ok=False)
 pipe=KPipeline(lang_code="a")
 report={
  "schema":"evercraft.voice-foundry.v05-craft-vowel-audition.v1",
  "status":"private_experimental_pronunciation_audition_not_approved",
  "leadVoice":"V05 af_bella",
  "founderFeedback":"V05 now preferred; slight synthetic vowel in 'craft' of Evercraft",
  "vowelConditions":{
   "original":"Unmodified Kokoro output; preserve original recommendation as control",
   "short_a":"American /æ/ as in the vowel often heard in 'cat' or American 'craft'; not universally correct across dialects",
   "open_ah":"Back /ɑ/ as in 'father' in many US dialects; may be unnatural for some pronunciations of craft"
  },
  "modelCheckpointDigestPinned":False,
  "wordScriptIdenticalAcrossConditions":True,
  "lexicalStressIntentionallyUnchanged":True,
  "objectiveVowelNaturalnessVerified":False,
  "humanPronunciationReviewerApproved":False,
  "voiceCommercialRightsIndependentlyVerified":False,
  "publicationAuthorityGranted":False,
  "candidates":[]
 }
 for scene,script in SCENES:
  for variant,vowel in VARIANTS:
   tokens,audit=amended_tokens(pipe,script,vowel)
   id=f"{scene}-{variant}"
   wav=out/(id+".wav");mp3=out/(id+".mp3")
   # One G2P token path for all trials; no false comparison of whole-script vs token API.
   clips=[np.asarray(step.audio,dtype=np.float32)
       for step in pipe.generate_from_tokens(tokens,voice=VOICE,speed=1.0)]
   if not clips:raise RuntimeError("Neural engine returned no audio for "+id)
   separated=[x for i,clip in enumerate(clips) for x in ((np.zeros(2400,dtype=np.float32),clip) if i else (clip,))]
   sf.write(wav,np.concatenate(separated),24000,subtype="PCM_16")
   with wave.open(str(wav),"rb") as w:
    duration=w.getnframes()/w.getframerate()
    if w.getnchannels()!=1 or w.getsampwidth()!=2 or not (2<duration<30):
     raise RuntimeError("Invalid real audio format/duration")
   run(["ffmpeg","-nostdin","-v","error","-y","-i",str(wav),
        "-af","loudnorm=I=-16:TP=-1.5:LRA=11",
        "-codec:a","libmp3lame","-q:a","3",str(mp3)])
   report["candidates"].append({
    "id":id,"scene":scene,"spokenScript":script,"voice":VOICE,
    "condition":variant,"ipaEvidence":audit,"wavSha256":digest(wav),
    "mp3Sha256":digest(mp3),"durationSec":round(duration,3),
    "sourceG2PUsedForAllVariants":True
   })
 (out/"vowel-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
 scenes_html=[]
 for scene,script in SCENES:
  players="".join("<article><strong>"+name.replace("_"," ").title()+
   "</strong><audio controls preload='metadata' src='"+scene+"-"+name+
   ".mp3'></audio></article>" for name,_ in VARIANTS)
  scenes_html.append("<section><h2>"+html.escape(scene.title())+"</h2><p>"+html.escape(script)+"</p>"+players+"</section>")
 document="""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evercraft V05 Vowel Lab</title>
<style>body{background:#121926;color:#eff5ff;max-width:820px;margin:28px auto;padding:0 20px;font:16px/1.5 system-ui}section{border:1px solid #626f85;padding:20px;border-radius:16px;margin:20px 0}article{padding:12px 18px;background:#223047;margin:10px 0;border-radius:10px}audio{display:block;width:100%}p{color:#b7c6df}</style>
<h1>Voice Foundry | V05 Craft Vowel Lab</h1>
<p>V05 remains the lead. Compare the default pronunciation with two alternate vowel sounds in the same exact word, across three different contexts. **These are candidates, not improvements until you listen.** No change to word order, identity, consonants, lexical stress or final production approval.</p>"""+"".join(scenes_html)+"""
<p>Model checkpoint SHA is not pinned; generated files are SHA-256 fingerprinted. The two alternate vowel targets can be wrong for a given accent. Qualified human pronunciation review remains required. Source machine-readable phonemes: vowel-report.json.</p></html>"""
 (out/"index.html").write_text(document)
 print(json.dumps({"realNeuralTakes":len(report["candidates"]),"status":report["status"],
   "initialVowel":report["candidates"][0]["ipaEvidence"]["originalVowel"],
   "initialPhonemes":report["candidates"][0]["ipaEvidence"]["original"]},ensure_ascii=False))
if __name__=="__main__":
 arg=argparse.ArgumentParser()
 arg.add_argument("out",nargs="?")
 arg.add_argument("--verify-only",action="store_true")
 params=arg.parse_args()
 if params.verify_only:validate()
 elif params.out:render(params.out)
 else:arg.error("Provide --verify-only or a fresh output directory")
