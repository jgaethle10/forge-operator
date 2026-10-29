#!/usr/bin/env python3
"""Fallen Studios objective MP4 gate. Metadata/decoding/motion only; never 'beauty approval'."""
import argparse, subprocess, json, hashlib, pathlib, sys, statistics

PARSER=argparse.ArgumentParser()
PARSER.add_argument("--input",required=True)
PARSER.add_argument("--expected-frames",type=int,default=48)
PARSER.add_argument("--output",required=True)
args=PARSER.parse_args()
p=pathlib.Path(args.input)
if not p.exists():raise SystemExit("video_not_found")
def run(argv):
    r=subprocess.run(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if r.returncode: raise RuntimeError("media_probe_or_decode_failed")
    return r.stdout

probe=json.loads(run(["ffprobe","-v","error","-count_frames","-select_streams","v:0",
    "-show_entries","stream=codec_name,width,height,pix_fmt,avg_frame_rate,nb_read_frames:format=duration",
    "-of","json",str(p)]))
stream=probe["streams"][0]
frames=int(stream.get("nb_read_frames") or 0)
duration=float(probe["format"]["duration"])
checks={
 "codec_h264":stream["codec_name"]=="h264",
 "mobile_pixfmt":stream["pix_fmt"]=="yuv420p",
 "vertical":int(stream["height"])>int(stream["width"]),
 "frame_count":frames==args.expected_frames,
 "duration":abs(duration-args.expected_frames/24)<.08,
}
# ffmpeg must decode the *whole* file. We sample every decoded frame at a fixed proxy resolution.
w,h=80,144
raw=run(["ffmpeg","-hide_banner","-loglevel","error","-i",str(p),
  "-vf",f"scale={w}:{h}","-pix_fmt","rgb24","-f","rawvideo","pipe:1"])
chunk=w*h*3
checks["all_frames_decode"]=len(raw)==chunk*frames
luma_means=[]
diffs=[]
prev=None
for i in range(0,len(raw),chunk):
    frame=raw[i:i+chunk]
    if len(frame)!=chunk:break
    mono=bytes((frame[j]*3+frame[j+1]*6+frame[j+2])//10 for j in range(0,chunk,3))
    luma_means.append(sum(mono)/len(mono))
    if prev is not None:
        diffs.append(sum(abs(x-y) for x,y in zip(mono,prev))/len(mono))
    prev=mono
checks["not_blank"]=len(luma_means)>0 and max(luma_means)>10
checks["actual_visual_motion"]=bool(diffs) and statistics.mean(diffs)>0.22 and max(diffs)>0.55
status="OBJECTIVE_TECHNICAL_PASS" if all(checks.values()) else "BLOCKED"
doc={
 "schema":"evercraft.fallen.encoded-video-objective-qc.v1",
 "status":status,
 "checks":checks,
 "media_sha256":hashlib.sha256(p.read_bytes()).hexdigest(),
 "duration_sec":duration,
 "frames_read":frames,
 "size":{"width":int(stream["width"]),"height":int(stream["height"])},
 "mean_luma":round(statistics.mean(luma_means),2) if luma_means else None,
 "mean_adjacent_frame_difference":round(statistics.mean(diffs),3) if diffs else None,
 "limitations":["no subjective visual quality evaluation","no claim of photorealism",
   "no audio/voice evaluation","no licensing review","no customer approval"],
 "publication_authority":False
}
out=pathlib.Path(args.output)
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(doc,indent=2)+"\n")
print(json.dumps(doc,indent=2))
if status!="OBJECTIVE_TECHNICAL_PASS":sys.exit(2)
