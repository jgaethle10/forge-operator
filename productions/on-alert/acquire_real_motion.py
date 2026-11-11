#!/usr/bin/env python3
"""Acquire public-domain-attributed historic motion-picture media for internal ON ALERT review.

This is a review-acquisition stage, not an approved release or final documentary edit.
Requires access to Wikimedia Commons and ffmpeg/ffprobe.
"""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path

OUT=Path(os.environ.get("ON_ALERT_OUT", "out/on-alert-scout"))
OUT.mkdir(parents=True, exist_ok=True)
SOURCES=[
  {"id":"1962", "title":"File:Minutemen Missile And Mission 1962.webm",
   "year":1962, "source":"https://commons.wikimedia.org/wiki/File:Minutemen_Missile_And_Mission_1962.webm",
   "notice":"U.S. Department of Defense historical motion film. Wikimedia transfer is AI-upscaled; visual specifics may have been altered."},
  {"id":"1965", "title":"File:Minuteman in the West.webm",
   "year":1965, "source":"https://commons.wikimedia.org/wiki/File:Minuteman_in_the_West.webm",
   "notice":"U.S. Air Force historical motion film. Wikimedia transfer is AI-upscaled; visual specifics may have been altered."}
]
UA="Evercraft-ON-ALERT-research/1.0 (documentary archival source inspection; uses public Wikimedia videos)"
def request(url,timeout=40):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent":UA}),timeout=timeout)
def probe(path):
    data=subprocess.check_output(["ffprobe","-v","error","-show_format","-show_streams","-of","json",str(path)],timeout=90)
    return json.loads(data)
def download(src,dest,limit=400_000_000):
    size=0
    tmp=dest.with_suffix(dest.suffix+".partial")
    with request(src,timeout=50) as response, open(tmp,"wb") as out:
        while True:
            piece=response.read(1024*1024)
            if not piece:break
            size+=len(piece)
            if size>limit:raise ValueError("download exceeded 400MB safety cap")
            out.write(piece)
    tmp.replace(dest)
    return size
def extract_media_options(title):
    args=urllib.parse.urlencode({"action":"query","format":"json","prop":"videoinfo",
                                "viprop":"url|derivatives","titles":title,"formatversion":"2"})
    with request("https://commons.wikimedia.org/w/api.php?"+args) as response:
        raw=json.load(response)
    pages=raw.get("query",{}).get("pages",[])
    details=(pages[0].get("videoinfo") or [{}])[0] if pages else {}
    opts=details.get("derivatives",[])
    options=[]
    for o in opts:
        url=o.get("src") or o.get("url")
        if not url:continue
        label=(o.get("shorttitle") or o.get("title") or o.get("type") or "").lower()
        mime=(o.get("type") or "").lower()
        score=100 if "360p" in label and ("webm" in label or "webm" in mime) else 90 if "360p" in label else 80 if "240p" in label else 30
        options.append((score,label,url))
    if details.get("url"):
        options.append((10,"original",details["url"]))
    return sorted(options,reverse=True)
def run(args,timeout=600):
    p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=timeout)
    if p.returncode:raise RuntimeError("command failed: "+" ".join(args)+"\n"+p.stderr[-1200:])
    return p
report={"purpose":"internal motion-footage archive scout only","date":"2026-11-10",
        "no_release_authorization":True,"sources":[]}
for item in SOURCES:
    x=dict(item,status="not_attempted",files=[],errors=[])
    report["sources"].append(x)
    try:
        opts=extract_media_options(item["title"])
        x["available_formats"]=[{"label":lbl,"url":u} for _,lbl,u in opts]
        if not opts:raise RuntimeError("Commons metadata returned no downloadable video URLs")
        p=OUT / ("source_"+item["id"]+".webm")
        for _,lbl,url in opts:
            try:
                x["download_choice"]=lbl
                n=download(url,p)
                x["bytes"]=n
                break
            except Exception as e:
                x["errors"].append(f"{lbl}: {str(e)[:300]}")
        else:
            raise RuntimeError("All source download variants failed")
        md=probe(p)
        video=next((s for s in md.get("streams",[]) if s.get("codec_type")=="video"),None)
        if not video:raise RuntimeError("No actual video stream in downloaded data")
        duration=float(md.get("format",{}).get("duration",0))
        x.update(status="acquired_internal_review_only",duration_seconds=duration,
                 stream={"codec":video.get("codec_name"),"width":video.get("width"),"height":video.get("height")})
        x["files"].append(p.name)
        # The 12-second QC excerpt is a continuous span of actual film, not a pan over stills.
        start=60 if duration>90 else 0
        sample=OUT / ("source_"+item["id"]+"_motion_qc.mp4")
        run(["ffmpeg","-y","-v","error","-ss",str(start),"-i",str(p),
             "-t","12","-vf","scale=640:-2:flags=lanczos,fps=24",
             "-c:v","libx264","-preset","veryfast","-crf","23",
             "-c:a","aac","-b:a","96k","-movflags","+faststart",str(sample)],timeout=180)
        x["files"].append(sample.name)
        # 20-frame contact sheet spaced over the entire program to enable independent visual selection.
        # Timestamp is rendered from source presentation time, not guessed.
        sheet=OUT / ("source_"+item["id"]+"_index.jpg")
        vf="fps=1/45,scale=240:-2:flags=fast_bilinear,drawtext=text='%{pts\\:hms}':fontcolor=white:fontsize=18:box=1:boxcolor=black@0.75:x=6:y=6,tile=5x4:padding=5:margin=5"
        try:
            run(["ffmpeg","-y","-v","error","-i",str(p),"-vf",vf,"-frames:v","1","-q:v","3",str(sheet)],timeout=480)
            x["files"].append(sheet.name)
        except Exception as e:
            x["errors"].append("contact sheet failed: "+str(e)[:300])
        # Video master retained on runner only; QC samples and contact sheets are deliverables.
        p.unlink()
    except Exception as exc:
        x["status"]="blocked"
        x["errors"].append(str(exc)[:1500])
    finally:
        with open(OUT/"report.json","w") as h:json.dump(report,h,indent=2)
        with open(OUT/"README.txt","w") as h:
            h.write("ON ALERT INTERNAL ARCHIVAL MOTION FOOTAGE SCOUT\n")
            h.write("Source footage is historical US military motion film, in AI-upscaled Wikimedia copies.\n")
            h.write("QC snippets prove video decoding only; shots are not yet selected or licensed for final release.\n")
            h.write("Wall Drug footage and NPS individual permissions remain outstanding.\n")
            h.write("All sourcing and errors: report.json\n")
print(json.dumps({x["id"]:x["status"] for x in report["sources"]}))
if not any(x["status"]=="acquired_internal_review_only" for x in report["sources"]):
    sys.exit(2)
