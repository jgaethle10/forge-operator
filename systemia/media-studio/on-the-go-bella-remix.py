#!/usr/bin/env python3
"""Voice-locked, review-only On The Go commercial remix.

Run after private Bella artifact generation:
 python systemia/media-studio/on-the-go-bella-remix.py \
  --voice-zip onthego-native-bella-voice05-private.zip \
  --picture V3.mp4 --music-bed V1_music_only.mp4 --output V4_review.mp4

Never use a scratch/default narrator as fallback. Never publish automatically.
"""
import argparse,hashlib,json,pathlib,subprocess,tempfile,wave,zipfile

def sha(path):
 return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
def run(args):
 return subprocess.run(args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
def main():
 p=argparse.ArgumentParser()
 for key in ("voice-zip","picture","music-bed","output"):
  p.add_argument("--"+key,required=True)
 p=p.parse_args()
 voicezip=pathlib.Path(p.voice_zip).resolve()
 pic=pathlib.Path(p.picture).resolve()
 music=pathlib.Path(p.music_bed).resolve()
 out=pathlib.Path(p.output).resolve()
 if any(not x.is_file() for x in [voicezip,pic,music]):
  raise RuntimeError("Missing required input; refusing fallback narrator")
 if out.exists(): raise RuntimeError("Output already exists; refusing overwrite")
 with tempfile.TemporaryDirectory() as td:
  root=pathlib.Path(td)
  with zipfile.ZipFile(voicezip) as z:
   for info in z.infolist():
    name=pathlib.PurePosixPath(info.filename)
    if name.is_absolute() or ".." in name.parts:
     raise RuntimeError("Unsafe archive entry")
   z.extractall(root)
  receipts=list(root.rglob("evidence.json"))
  if len(receipts)!=1:raise RuntimeError("Missing/ambiguous voice evidence")
  r=json.loads(receipts[0].read_text())
  req={"voiceId":"af_bella","voiceFamily":"Kokoro-82M",
       "kokoroVersion":"0.9.4","originalNativeVoice":True,
       "reusedRelaySpeech":False,"humanListeningApproved":False,
       "clientApproved":False,"published":False}
  for k,v in req.items():
   if r.get(k)!=v:raise RuntimeError("VOICE_LOCK_FAIL: "+k)
  if len(r.get("scriptLines",[]))!=8:raise RuntimeError("VOICE_COUNT_FAIL")
  base=receipts[0].parent
  for line in r["scriptLines"]:
   f=base/line["filename"]
   if not f.is_file() or sha(f)!=line["sha256"]:
    raise RuntimeError("VOICE_DIGEST_FAIL: "+line["filename"])
  voice=base/r["masterFile"]
  if not voice.is_file() or sha(voice)!=r["masterSha256"]:
   raise RuntimeError("VOICE_MASTER_FAIL")
  with wave.open(str(voice),"rb") as f:
   if f.getframerate()!=24000 or f.getnframes()!=720000:
    raise RuntimeError("VOICE_DURATION_FAIL")
  # Voice-first mix: music is never the primary element.
  filt=("[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.19[bed];"
        "[2:a]aresample=48000,aformat=channel_layouts=stereo,"
        "highpass=f=90,lowpass=f=12500,"
        "acompressor=threshold=0.13:ratio=2.2:attack=12:release=150:makeup=1.15,"
        "volume=1.3[voice];"
        "[bed][voice]amix=inputs=2:duration=first:normalize=0,"
        "alimiter=limit=0.90,aresample=48000[out]")
  ff=["ffmpeg","-hide_banner","-loglevel","error","-n","-i",str(pic),
      "-i",str(music),"-i",str(voice),"-filter_complex",filt,
      "-map","0:v:0","-map","[out]","-c:v","copy",
      "-c:a","aac","-b:a","192k","-ar","48000","-ac","2",
      "-movflags","+faststart","-t","30",str(out)]
  try:
   run(ff)
   meta=json.loads(run(["ffprobe","-v","error","-show_entries",
            "format=duration,size","-show_entries",
            "stream=codec_name,codec_type,width,height","-of","json",str(out)]).stdout)
   if abs(float(meta["format"]["duration"])-30)>0.1:
    raise RuntimeError("OUTPUT_DURATION_FAIL")
   if not any(s.get("codec_type")=="audio" and s.get("codec_name")=="aac" for s in meta["streams"]):
    raise RuntimeError("OUTPUT_AUDIO_FAIL")
   if not any(s.get("codec_type")=="video" and s.get("width")==720 and s.get("height")==1280 for s in meta["streams"]):
    raise RuntimeError("OUTPUT_VIDEO_FAIL")
   run(["ffmpeg","-v","error","-i",str(out),"-f","null","-"])
  except Exception:
   out.unlink(missing_ok=True)
   raise
  proof={"schema":"evercraft.commercial.voice-locked-review.v1",
     "output":out.name,"outputSha256":sha(out),
     "voiceFamily":r["voiceFamily"],"voiceId":r["voiceId"],
     "voiceMasterSha256":r["masterSha256"],
     "voiceArtifactSha256":sha(voicezip),
     "pictureSourceSha256":sha(pic),"musicSourceSha256":sha(music),
     "humanListeningApproved":False,"clientApproved":False,
     "publishReady":False,"durationSec":float(meta["format"]["duration"])}
  out.with_suffix(".evidence.json").write_text(json.dumps(proof,indent=2)+"\n")
  print(json.dumps({"status":"TECHNICALLY_VERIFIED_REVIEW_ONLY","out":str(out),"sha256":sha(out)},indent=2))
if __name__=="__main__":main()
