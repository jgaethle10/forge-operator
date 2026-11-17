#!/usr/bin/env python3
"""Fetch only source-identified Mixkit Free License illustrative engine B-roll."""
import hashlib, json, pathlib, subprocess, urllib.request
ROOT=pathlib.Path("pacific-licensed-broll")
ROOT.mkdir(exist_ok=True)
ITEMS=[
  {"id":"65","title":"Closeup of sports car engine","slug":"closeup-of-sports-car-engine","page":"https://mixkit.co/free-stock-video/closeup-of-sports-car-engine-65/"},
  {"id":"4716","title":"Mechanic repairing a car engine","slug":"mechanic-repairing-a-car-engine","page":"https://mixkit.co/free-stock-video/mechanic-repairing-a-car-engine-4716/"}
]
receipt={"project":"Pacific illustrative B-roll only","license":"https://mixkit.co/license/modal/videoFree/","rights_not_claimed_for_client_identifiable_people":True,"assets":[]}
for item in ITEMS:
  url=f"https://assets.mixkit.co/videos/preview/mixkit-{item['slug']}-{item['id']}-large.mp4"
  path=ROOT/f"mixkit_{item['id']}.mp4"
  row={**item,"candidate_url":url}
  try:
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (Evercraft permitted stock-asset research)"})
    with urllib.request.urlopen(req,timeout=35) as r:
      content_type=r.headers.get("content-type")
      data=r.read(30_000_001)
    if len(data)>30_000_000 or len(data)<100_000 or not data[4:8]==b"ftyp":
      raise RuntimeError(f"Invalid/oversized file: {len(data)} bytes {content_type} {data[:16]}")
    path.write_bytes(data)
    pr=subprocess.run(["ffprobe","-v","error","-select_streams","v:0","-show_entries","stream=width,height,avg_frame_rate,duration","-of","json",str(path)],text=True,capture_output=True,check=True)
    details=json.loads(pr.stdout)["streams"][0]
    row.update({"status":"retrieved","bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),"file":path.name,"video":details,"commercial_use_only_when_item_page_shows_stock_video_free_license":True})
  except Exception as e:
    row.update({"status":"unavailable","error":str(e)[:260]})
  print(json.dumps(row))
  receipt["assets"].append(row)
(ROOT/"stock_provenance.json").write_text(json.dumps(receipt,indent=2))
if not any(x["status"]=="retrieved" for x in receipt["assets"]):
  raise SystemExit("NO_ASSETS_RETRIEVED")
