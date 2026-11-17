#!/usr/bin/env python3
"""Private illustrative engine footage acquisition for Pacific commercial.
Pexels contributor footage only; NEVER attribute subject to Pacific.
Commercial restrictions: no implied endorsement; no standalone resale.
"""
from pathlib import Path
from urllib.request import Request,urlopen
import json,hashlib,subprocess,os
OUT=Path("pacific_engine_candidate");OUT.mkdir(exist_ok=True)
source_page="https://www.pexels.com/video/close-up-of-car-engine-in-workshop-32329385/"
license_url="https://www.pexels.com/license/"
direct="https://videos.pexels.com/video-files/32329385/13790382_1920_1080_25fps.mp4"
page_download="https://www.pexels.com/download/video/32329385/"
result={"id":"pexels-32329385","source_page":source_page,"license":license_url,"licensing_state":"research_only_pending_specific_release_review","content_type":"illustrative_stock_footage_not_pacific","urls_attempted":[]}
raw=None
for url in [page_download,direct]:
    try:
        req=Request(url,headers={"User-Agent":"Mozilla/5.0","Accept":"video/mp4,*/*"})
        with urlopen(req,timeout=50) as res:
            mime=res.headers.get("Content-Type","")
            final=res.geturl()
            buf=res.read(80_000_001)
        if len(buf)>80_000_000 or len(buf)<100_000 or buf[4:8]!=b"ftyp":
            raise RuntimeError(f"not_expected_mp4 length={len(buf)} mime={mime} start={buf[:12]!r}")
        raw=buf
        result["download_url"]=final
        result["sha256_full_source"]=hashlib.sha256(buf).hexdigest()
        result["source_bytes"]=len(buf)
        result["urls_attempted"].append({"url":url,"status":"success"})
        break
    except Exception as exc:
        result["urls_attempted"].append({"url":url,"status":"failed","error":str(exc)[:400]})
if raw:
    raw_path=OUT/"source.mp4";raw_path.write_bytes(raw)
    probe=subprocess.run(["ffprobe","-v","error","-show_entries","stream=codec_name,width,height,avg_frame_rate,duration","-of","json",str(raw_path)],capture_output=True,text=True,check=True)
    result["metadata"]=json.loads(probe.stdout)
    cmd=["ffmpeg","-y","-hide_banner","-loglevel","error","-ss","0.2","-i",str(raw_path),"-t","5","-an","-vf","scale=1280:720:flags=lanczos,fps=25,format=yuv420p","-c:v","libx264","-preset","fast","-crf","19","-movflags","+faststart",str(OUT/"candidate_5s.mp4")]
    subprocess.run(cmd,check=True)
    subprocess.run(["ffmpeg","-y","-hide_banner","-loglevel","error","-ss","2.0","-i",str(OUT/"candidate_5s.mp4"),"-frames:v","1",str(OUT/"candidate_frame.jpg")],check=True)
    result["candidate_sha256"]=hashlib.sha256((OUT/"candidate_5s.mp4").read_bytes()).hexdigest()
    result["candidate_file"]="candidate_5s.mp4"
    print("ACQUIRED_ACTUAL_FOOTAGE",json.dumps(result)[:6000])
else:
    print("SOURCE_FETCH_BLOCKED",json.dumps(result)[:6000])
(OUT/"source_receipt.json").write_text(json.dumps(result,indent=2))
if raw is None: raise SystemExit(2)
