#!/usr/bin/env python3
"""Retiming of unmodified native Bella WAV takes to V3's actual repair shots.

Example: python on-the-go-align-voice.py generated-native-bella.zip aligned-bella.zip

This is editorial repositioning only: no speed, pitch, resynthesis or timbre edits.
Always preserve the original ZIP and the source digest.
"""
import hashlib,json,pathlib,sys,tempfile,zipfile
import numpy as np,soundfile as sf
TIME={"v01":0.45,"v02":3.35,"v03":7.10,"v06":11.85,
      "v04":15.20,"v05":19.30,"v07":22.80,"v08":25.50}
SR=24000
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
 if len(sys.argv)!=3:raise SystemExit("Usage: on-the-go-align-voice.py input-voice.zip output-aligned.zip")
 src,dst=map(pathlib.Path,sys.argv[1:])
 if not src.is_file() or dst.exists():raise RuntimeError("Missing source or would overwrite existing output")
 with tempfile.TemporaryDirectory() as tmp:
  p=pathlib.Path(tmp)
  with zipfile.ZipFile(src) as z:
   for f in z.infolist():
    n=pathlib.PurePosixPath(f.filename)
    if n.is_absolute() or ".." in n.parts:raise RuntimeError("Unsafe ZIP path")
   z.extractall(p)
  e=json.loads((p/"evidence.json").read_text())
  if e.get("voiceId")!="af_bella" or e.get("originalNativeVoice") is not True:
   raise RuntimeError("VOICE_IDENTITY_FAILED_CLOSED")
  old=p/e["masterFile"]
  if sha(old)!=e["masterSha256"]:raise RuntimeError("ORIGINAL_MASTER_DIGEST_FAIL")
  if {x["id"] for x in e["scriptLines"]}!=set(TIME):
   raise RuntimeError("VOICE_TAKE_COUNT_FAIL")
  signal=np.zeros(30*SR,dtype=np.float32)
  for line in e["scriptLines"]:
   wav=p/line["filename"]
   if sha(wav)!=line["sha256"]:raise RuntimeError("TAKE_DIGEST_FAIL")
   a,sr=sf.read(wav,dtype="float32")
   if sr!=SR or a.ndim!=1:raise RuntimeError("BAD_AUDIO_SHAPE")
   i=round(TIME[line["id"]]*SR)
   if i+len(a)>len(signal):raise RuntimeError("VOICE_OVERRUN")
   signal[i:i+len(a)]+=a
   line["previousStartSec"]=line["startSec"]
   line["startSec"]=TIME[line["id"]]
  if np.max(abs(signal))>1:raise RuntimeError("VOICE_CLIPPING")
  sf.write(old,signal,SR,subtype="PCM_16")
  e["originalMasterSha256"]=e["masterSha256"]
  e["masterSha256"]=sha(old)
  e["sourceVoiceArtifactSha256"]=sha(src)
  e["editorialTimingAlignedToFootage"]=True
  e["editorialTimingOnly"]=True
  e["voiceSignalUnmodified"]=True
  e["humanListeningApproved"]=False
  e["clientApproved"]=False
  e["published"]=False
  (p/"evidence.json").write_text(json.dumps(e,indent=2)+"\n")
  with zipfile.ZipFile(dst,"w",zipfile.ZIP_DEFLATED) as z:
   for f in sorted(p.iterdir()):z.write(f,arcname=f.name)
  print(json.dumps({"status":"ALIGNED_REVIEW_ONLY","sourceSha256":sha(src),
    "alignedSha256":sha(dst),"masterSha256":e["masterSha256"]},indent=2))
if __name__=="__main__":main()
