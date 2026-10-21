#!/usr/bin/env python3
"""V05 Evercraft performance lab: isolate brand stress vs craft vowel independently."""
import argparse
import copy
import hashlib
import html
import json
import pathlib
import re
import subprocess
import wave
EXPECTED="ˌɛvəɹkɹˈæft"
VOICENAME="af_bella"
SCENES=(
 ("tagline","This is Evercraft, and this is only the beginning."),
 ("brand","Evercraft is building the tools that make tomorrow possible."),
 ("promise","With Evercraft, the work gets done and the promise means something."),
)
VARIANTS=(
 ("model_original",EXPECTED,"Unmodified control: primary emphasis on CRAFT."),
 ("ever_primary","ˈɛvəɹkɹˌæft","Primary stress on EVER; secondary stress on craft. Original /æ/ vowel unchanged."),
 ("ever_relaxed","ˈɛvəɹkɹæft","Primary stress on EVER; no marked stress on craft. Original /æ/ vowel unchanged."),
 ("open_a_only","ˌɛvəɹkɹˈɑft","Original word stress; only /æ/ changed to /ɑ/."),
)
def words(text):
 return re.findall(r"[^\W_]+(?:'[^\W_]+)?",text.casefold(),re.UNICODE)
def verify():
 assert len(SCENES)==3 and len(VARIANTS)==4
 assert all(words(t).count("evercraft")==1 for _,t in SCENES)
 originals=[p for _,p,_ in VARIANTS]
 assert len(set(originals))==4,"Every candidate should have a genuinely different phonemic condition"
 for p in originals:
  assert p.replace("ˈ","").replace("ˌ","").replace("ɑ","æ")==EXPECTED.replace("ˈ","").replace("ˌ",""),"No consonant or unrelated vowel changes"
 assert all(p.count("ˈ")==1 for p in originals)
 print("12 controlled takes; isolated /æ/ vs /ɑ/ vowel and independent brand-name stress conditions")
def digest(file):
 h=hashlib.sha256()
 with open(file,"rb") as f:
  for block in iter(lambda:f.read(1048576),b""):h.update(block)
 return h.hexdigest()
def amended(pipe,text,phonemes):
 resolved,tokens=pipe.g2p(text)
 if not isinstance(tokens,list):raise RuntimeError("No token list; cannot safely alter G2P")
 found=[t for t in tokens if re.sub(r"[^a-z]","",str(t.text).lower())=="evercraft"]
 if len(found)!=1:raise RuntimeError("Expected exactly one Evercraft token")
 observed=str(found[0].phonemes)
 if observed!=EXPECTED:
  raise RuntimeError("Changed G2P baseline! actual="+repr(observed)+", expected="+repr(EXPECTED))
 copied=copy.deepcopy(tokens)
 for token in copied:
  if re.sub(r"[^a-z]","",str(token.text).lower())=="evercraft":token.phonemes=phonemes
 return copied,observed
def run(args):
 subprocess.run(args,check=True,timeout=100)
def render(dir):
 verify()
 import numpy as np
 import soundfile as sf
 from kokoro import KPipeline
 out=pathlib.Path(dir)
 out.mkdir(parents=True,exist_ok=False)
 engine=KPipeline(lang_code="a")
 receipt={
  "schema":"evercraft.voice-foundry.v05-brand-stress-vowel-study.v1",
  "status":"private_unapproved_phonetic_performance_experiment",
  "ownerRank":"V05 af_bella is current first choice",
  "question":"Is the robotic craft vowel actually caused by overemphasis of CRAFT rather than wrong vowel quality?",
  "originalModelIPA":EXPECTED,
  "conditions":{id:{"phonemes":p,"hypothesis":desc} for id,p,desc in VARIANTS},
  "phonemeChangesPreciselyAudited":True,
  "sameWordsAndVoiceInEveryTake":True,
  "modelWeightsSHA256IndependentlyVerified":False,
  "humanPronunciationQualityAccepted":False,
  "commercialVoiceRightsVerified":False,
  "publicationAuthorityGranted":False,
  "recordings":[]
 }
 for scene,script in SCENES:
  for name,ipa,comment in VARIANTS:
   candidate=f"{scene}-{name}"
   tokens,original=amended(engine,script,ipa)
   clips=[np.asarray(o.audio,dtype=np.float32) for o in engine.generate_from_tokens(tokens,voice=VOICENAME,speed=1.)]
   if not clips:raise RuntimeError("No neural speech from Kokoro "+candidate)
   joined=np.concatenate([part for i,clip in enumerate(clips) for part in ((np.zeros(2400,dtype=np.float32),clip) if i else (clip,))])
   wav=out/(candidate+".wav");mp3=out/(candidate+".mp3")
   sf.write(wav,joined,24000,subtype="PCM_16")
   with wave.open(str(wav),"rb") as w:
    duration=w.getnframes()/w.getframerate()
    if not 1.5<duration<35 or w.getsampwidth()!=2 or w.getnchannels()!=1:
     raise RuntimeError("Invalid audio duration or format "+candidate)
   run(["ffmpeg","-nostdin","-v","error","-y","-i",str(wav),"-af","loudnorm=I=-16:TP=-1.5:LRA=11",
      "-codec:a","libmp3lame","-q:a","3",str(mp3)])
   receipt["recordings"].append({
    "id":candidate,"scene":scene,"variation":name,"voice":"af_bella",
    "spokenText":script,"modelOriginalIPA":original,"modifiedIPA":ipa,
    "wavSha256":digest(wav),"mp3Sha256":digest(mp3),"durationSec":round(duration,3)
   })
 (out/"evidence.json").write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+"\n")
 scenes=[]
 for scene,script in SCENES:
  audios="".join("<article><h3>"+name.replace("_"," ").title()+"</h3><audio controls preload='metadata' src='"+
                  scene+"-"+name+".mp3'></audio></article>" for name,_,_ in VARIANTS)
  scenes.append("<section><h2>"+html.escape(scene.title())+"</h2><p>"+html.escape(script)+"</p>"+audios+"</section>")
 page="""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>V05 Evercraft pronunciation</title>
<style>body{background:#121a29;color:#edf4ff;max-width:820px;margin:32px auto;padding:0 20px;font:16px/1.5 system-ui}section{padding:20px;border:1px solid #596a82;border-radius:16px;margin:20px 0}article{padding:10px 20px;margin:10px 0;background:#233049;border-radius:10px}audio{display:block;width:100%}p{color:#b9c8de}</style>
<h1>V05 | Evercraft word-articulation lab</h1>
<p>V05 is the founder's first choice. We discovered Kokoro makes CRAFT the strongest syllable in Evercraft. Compare the original with two versions that emphasize EVER instead, and a separate /ɑ/ vowel change. Every audio uses V05 and the same written sentence. These aren't pre-approved improvements.</p>"""+ "".join(scenes)+"""
<p>Original source phonemes: ˌɛvəɹkɹˈæft. All candidate IPA sequences appear in evidence.json; check with a qualified human before promoting any brand lexicon to production. Dry WAVs and level-adjusted MP3s. No rights or quality approved automatically.</p></html>"""
 (out/"index.html").write_text(page)
 print(json.dumps({"generated":len(receipt["recordings"]),"originalIPA":EXPECTED,"status":receipt["status"]},ensure_ascii=False))
if __name__=="__main__":
 p=argparse.ArgumentParser()
 p.add_argument("output_dir",nargs="?")
 p.add_argument("--verify-only",action="store_true")
 args=p.parse_args()
 if args.verify_only:verify()
 elif args.output_dir:render(args.output_dir)
 else:p.error("provide new output directory or --verify-only")
