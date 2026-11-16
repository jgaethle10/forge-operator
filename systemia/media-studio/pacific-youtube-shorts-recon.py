#!/usr/bin/env python3
"""Source-locked Pacific official YouTube Shorts for private client edit inspection.
No credential bypass; limited three clips, human/brand rights pending client signoff.
"""
import json,subprocess,pathlib,shutil
out=pathlib.Path("pacific-youtube-short-recon");out.mkdir(exist_ok=True)
ids=[("f350_mobile","VBggPMecmgs"),("oil_change","9Z7e4q4ySRM"),("paint_buff","5dfd96ZDs9Q")]
items=[]
for name,vid in ids:
 url="https://www.youtube.com/shorts/"+vid
 args=["yt-dlp","--no-playlist","--no-warnings","--no-progress","--max-filesize","35M","--socket-timeout","20","--retries","1","--format","b[height<=720]/bv*[height<=720]+ba/best","--merge-output-format","mp4","--output",str(out/(name+".%(ext)s")),url]
 try:
  r=subprocess.run(args,text=True,capture_output=True,timeout=95)
  hits=[str(x) for x in out.glob(name+".*") if x.is_file() and x.stat().st_size>50000]
  items.append({"source":url,"name":name,"exit":r.returncode,"files":hits,"stderr_tail":r.stderr[-1500:]})
  print(name,r.returncode,hits,r.stderr[-500:])
 except Exception as e:
  items.append({"source":url,"error":str(e),"name":name})
(out/"evidence.json").write_text(json.dumps({"private_preview_only":True,"owner_clearance_pending":True,"entries":items},indent=2))
