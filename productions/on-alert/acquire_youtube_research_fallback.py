#!/usr/bin/env python3
"""Fallback archival acquisition from explicitly known original-film YouTube video pages.
Internal research only. Never interpret a download as footage rights clearance.
The source may itself be digitally altered; verify against a historical master.
"""
import json, pathlib, subprocess, os, sys, datetime
out=pathlib.Path("out/on-alert-alt-research");out.mkdir(parents=True,exist_ok=True)
sources=[
  {"year":1965,"id":"mQ8GOaZ0cKY","title":"Minuteman In The West (1965)","attribution":"USAF/DoD film; YouTube transfer and alterations not verified"},
  {"year":1962,"id":"37rMUjJcjgA","title":"Minutemen Missile And Mission (1962)","attribution":"DoD/Thiokol presentation credit visible; copyright/provenance requires research"}
]
report={"purpose":"internal review footage source fallback; do not publish","ts":datetime.datetime.now(datetime.timezone.utc).isoformat(),"results":[]}
for obj in sources:
  x=dict(obj,status="blocked")
  report["results"].append(x)
  try:
    template=str(out/(str(obj["year"])+".%(ext)s"))
    url="https://www.youtube.com/watch?v="+obj["id"]
    command=["yt-dlp","--no-playlist","--no-progress","--socket-timeout","15","--retries","1","--fragment-retries","1",
      "--max-filesize","100M","-f","bestvideo[height<=360]+bestaudio/best[height<=360]/best",
      "--merge-output-format","mp4","-o",template,url]
    p=subprocess.run(command,capture_output=True,text=True,timeout=175)
    x["exit_code"]=p.returncode
    x["log_excerpt"]=(p.stdout+"\n"+p.stderr)[-2200:]
    films=sorted(out.glob(str(obj["year"])+".*"),key=lambda f:f.stat().st_size,reverse=True)
    films=[f for f in films if f.suffix in (".mp4",".webm",".mkv")]
    if p.returncode!=0 or not films:raise RuntimeError("YouTube external source unavailable or blocked")
    film=films[0]
    pr=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration:stream=codec_name,codec_type,width,height","-of","json",str(film)],capture_output=True,text=True,timeout=25)
    if pr.returncode:raise RuntimeError("ffprobe failed")
    meta=json.loads(pr.stdout)
    assert any(s.get("codec_type")=="video" for s in meta.get("streams",[]))
    x.update(status="downloaded_for_internal_editorial_review_only",filename=film.name,size=film.stat().st_size,probe=meta)
  except Exception as e:x["error"]=str(e)[:300]
  (out/"report.json").write_text(json.dumps(report,indent=2))
print(json.dumps({x["year"]:x["status"] for x in report["results"]}))
if not any(x["status"].startswith("downloaded") for x in report["results"]):sys.exit(2)
