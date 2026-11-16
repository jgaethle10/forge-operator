#!/usr/bin/env python3
"""Inventory official public Pacific YouTube videos for owner-provided client footage review.
No bypass, no sign-in, no third-party proxies, no auto-publication.
"""
import subprocess,json,pathlib
root=pathlib.Path("pacific-public-youtube-discovery");root.mkdir(exist_ok=True)
url="https://www.youtube.com/@PacificMobileMechanic/shorts"
cmd=["yt-dlp","--flat-playlist","--playlist-end","25","--dump-single-json","--skip-download","--no-warnings",url]
p=subprocess.run(cmd,text=True,capture_output=True,timeout=110)
(root/"stderr.txt").write_text(p.stderr[-6000:])
if p.returncode:
 print("CHANNEL_DISCOVERY_ERROR",p.stderr[-1800:])
 (root/"result.json").write_text(json.dumps({"status":"not_retrievable","url":url,"stderr_tail":p.stderr[-3000:]},indent=2))
else:
 data=json.loads(p.stdout)
 items=[{"id":e.get("id"),"title":e.get("title"),"duration":e.get("duration"),"url":e.get("url"),"timestamp":e.get("timestamp")} for e in data.get("entries",[]) if e]
 (root/"result.json").write_text(json.dumps({"status":"ok","channel":url,"entries":items},indent=2))
 print(json.dumps(items,indent=2)[:13000])
