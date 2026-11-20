#!/usr/bin/env python3
"""Export the approved private AIW hover preview as a portable owned static beta.

Reads ONLY the known loopback AIW source, validates state/FHWA facts, exports
public-safe Washington historical records, and freezes an atomic, content-addressed
static bundle. Does not connect to DNS, Caddy, cloud hosts, or mutate live routes.
"""
import argparse
import base64
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import tarfile
import tempfile
from urllib.parse import urlparse
from urllib.request import urlopen

EXPECTED_STATES=52
EXPECTED_POLYGONS=56
EXPECTED_WA=8619
EXPECTED_WA_POOR=403
EXPECTED_EXCLUDED_COORDINATES=1
EXPECTED_WA_PUBLISHED=EXPECTED_WA-EXPECTED_EXCLUDED_COORDINATES
LEAFLET_SRI={
    "leaflet.js":"20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
    "leaflet.css":"p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
}
WA_KEYS={"bridge_id","name","condition","county_code","latitude","longitude","coordinate_quality","inspection_entry_count"}


def acquire(base,path):
    with urlopen(base+path,timeout=12) as response:
        if response.status!=200:
            raise ValueError(f"Source endpoint {path} unavailable")
        data=response.read(5_000_001)
        if len(data)>5_000_000:
            raise ValueError(f"Source endpoint {path} exceeds size bound")
        return data


def emit_json(obj):
    return (json.dumps(obj,sort_keys=True,ensure_ascii=False,separators=(",",":"),allow_nan=False)+"\n").encode("utf8")


def replace_once(source,needle,new):
    if source.count(needle)!=1:
        raise ValueError(f"Expected exactly one: {needle[:80]!r}; got {source.count(needle)}")
    return source.replace(needle,new,1)


def static_page(private_html):
    text=private_html.decode("utf8")
    if ("function hoverPreview(name)" not in text or
        "layer.bindTooltip(()=>hoverPreview(name)" not in text or
        "Explore America." not in text):
        raise ValueError("Approved hover experience missing; refusing export")
    text=replace_once(text,'<link rel="stylesheet" href="/vendor/leaflet.css">','<link rel="stylesheet" href="./vendor/leaflet.css">')
    text=replace_once(text,'<script src="/vendor/leaflet.js"></script>','<script src="./vendor/leaflet.js"></script>')
    text=replace_once(text,"fetch('/api/states'","fetch('./data/states.json'")
    text=replace_once(text,"fetch('/data/states.geojson'","fetch('./data/states.geojson'")
    text=replace_once(text,"fetch('/api/wa26/summary'","fetch('./data/wa-summary.json'")
    text=text.replace('href="/advanced"','href="./about.html"')
    text=text.replace('Full evidence explorer ↗','About the data ↗')
    text=text.replace('Explore all infrastructure layers ↗','Read methodology and limitations ↗')
    text=text.replace('The national workbench still offers the 2025 bridge map and other sourced infrastructure categories.',
        'Additional individual records for this state have not yet been published in this beta.')
    old_start="  async function loadRecords(reset=false){"
    old_end="  function selectRecord(r){"
    if text.count(old_start)!=1 or text.count(old_end)!=1:
        raise ValueError("UI deep-record controller changed; explicit review required")
    start=text.index(old_start)
    end=text.index(old_end,start)
    replace=StringLiteralLoadRecords
    text=text[:start]+replace+text[end:]
    if re.search(r'''(?:fetch\\(['"]/(?:api|data)/|(?:href|src)=["']/(?:vendor|advanced))''',text):
        raise ValueError("Old root-absolute preview path remains after static export")
    if "<script src=\"./vendor/leaflet.js\"></script>" not in text:
        raise ValueError("Self-hosted map engine was not retained")
    banner='<meta name="description" content="Explore dated federal bridge inventory data state by state. An independent Evercraft public beta, not real-time safety advice.">'
    text=replace_once(text,"<title>American Infrastructure Watch | Explore America</title>",
        "<title>American Infrastructure Watch | Public Beta</title>\n"+banner)
    return text.encode("utf8")


StringLiteralLoadRecords="""  let staticBridgeRows=null;
  async function loadRecords(reset=false){
    if(selectedName!=='Washington')return;
    if(reset)offset=0;
    const current=++activeRequest;
    $('record-list').textContent='Loading historical bridge records…';
    $('record-detail').hidden=true;
    try{
      if(!staticBridgeRows){
        const res=await fetch('./data/wa-bridges.json',{cache:'force-cache'});
        if(!res.ok)throw Error('Static evidence unavailable');
        const payload=await res.json();
        if(payload.scope!=='WA_only_2026_public_records'||payload.source_total!==8619||
           payload.withheld_coordinate_count!==1||!Array.isArray(payload.bridges)||
           payload.bridges.length!==8618)throw Error('Static evidence invalid');
        staticBridgeRows=payload.bridges;
      }
      if(current!==activeRequest||!deep||selectedName!=='Washington')return;
      const condition=$('condition').value;
      const filtered=condition?staticBridgeRows.filter(r=>r.condition===condition):staticBridgeRows;
      recordCount=filtered.length;
      const rows=filtered.slice(offset,offset+12);
      const list=$('record-list');list.replaceChildren();
      for(const r of rows){
        const row=document.createElement('button');row.type='button';row.className='record';
        const name=document.createElement('strong');name.textContent=r.name||'Unnamed bridge';
        const meta=document.createElement('span');
        meta.textContent=r.bridge_id+' · '+({P:'Poor',F:'Fair',G:'Good'}[r.condition]||'Unclassified')+' condition';
        row.append(name,meta);
        row.addEventListener('click',()=>selectRecord(r));
        list.appendChild(row);
      }
      if(!rows.length)list.textContent='No matching records. This is not a safety determination.';
      $('record-page').textContent=(rows.length?offset+1:0)+'–'+(offset+rows.length)+' of '+format(recordCount);
      $('previous').disabled=offset===0;
      $('next').disabled=offset+rows.length>=recordCount;
    }catch{
      if(current!==activeRequest)return;
      $('record-list').textContent='Detailed records temporarily unavailable. Summary statistics remain sourced.';
      $('previous').disabled=true;$('next').disabled=true;
    }
  }
"""


def about_html():
    return b"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>About the data | American Infrastructure Watch</title><style>body{font:16px/1.65 system-ui,sans-serif;color:#133c5a;background:#f5fafd;margin:0}main{max-width:760px;margin:56px auto;padding:0 22px}h1{font-size:2.3rem;line-height:1.13}article{background:white;border-radius:18px;padding:24px;border:1px solid #d9e9f3}a{color:#075f9a}li{margin-bottom:10px}small{color:#617b91}</style></head><body><main><a href="./">&larr; Back to the map</a><h1>About this public beta</h1><article><p>American Infrastructure Watch is an independent Evercraft project for exploring historical public infrastructure evidence. It is not an official U.S. government website or a live emergency/route-safety service.</p><h2>What the numbers mean</h2><ul><li>Most state bridge totals and Poor-condition counts come from <strong>FHWA National Bridge Inventory 2025 state summaries</strong>. These are state-wide administrative totals, not individual bridge pins.</li><li>Washington uses independently validated <strong>FHWA 2026</strong> state bridge records (8,619 total, 403 rated Poor). The public beta's deep list exposes 8,618 records with usable coordinate quality; one record has a flagged source coordinate and is withheld from the location-based list, not deleted from the reported state total.</li><li>Good/Fair/Poor describe historical inspection classifications, <strong>not</strong> immediate hazard, road closure, safe passage, maintenance order, or forecast.</li><li>This is not a complete nationwide 2026 record database. Missing state-level deep detail is shown as missing, not inferred.</li></ul><h2>Primary sources</h2><p><a href="https://www.fhwa.dot.gov/bridge/nbi/sd2025.cfm">FHWA 2025 statewide bridge condition summaries</a><br><a href="https://www.fhwa.dot.gov/bridge/nbi/nbi_data_2026.cfm">FHWA 2026 NBI state data</a><br><a href="https://www.fhwa.dot.gov/bridge/nbi/nbi_data.cfm">FHWA bridge inventory definitions and limitations</a></p><h2>Map and software attributions</h2><p>State boundary geometry is derived from U.S. Census data through us-atlas v3.0.1 (copyright Michael Bostock; ISC license). Interactive geometry uses locally hosted Leaflet v1.9.4 (BSD-2-Clause license). Their license texts accompany this release.</p><p><small>Independent Evercraft public beta. Data is dated and incomplete. No real-time danger claim.</small></p></article></main></body></html>"""


def export(args):
    base=args.origin.rstrip("/")
    u=urlparse(base)
    if (u.scheme!="http" or u.hostname not in ("127.0.0.1","localhost") or
        u.username or u.password or u.path not in ("","/") or u.query or u.fragment):
        raise ValueError("Source must be an explicit HTTP loopback preview, never a public URL")
    approved=Path(args.source_html).read_bytes()
    observed=acquire(base,"/")
    if observed!=approved:
        raise ValueError("Running preview bytes are not the approved immutable GitHub source")
    stage=Path(args.output)
    if stage.exists():
        raise FileExistsError("Output already exists; never replace an existing release")
    summary=json.loads(acquire(base,"/api/states"))
    boundary=json.loads(acquire(base,"/data/states.geojson"))
    wa=json.loads(acquire(base,"/api/wa26/summary"))
    if (summary.get("scope")!="national_state_summaries_FHWA_2025" or
        len(summary.get("states",[]))!=EXPECTED_STATES or
        not all(s.get("vintage")==2025 for s in summary["states"]) or
        not any(s.get("name")=="Washington" for s in summary["states"])):
        raise ValueError("2025 nationwide state summary validation failed")
    if boundary.get("type")!="FeatureCollection" or len(boundary.get("features",[]))!=EXPECTED_POLYGONS:
        raise ValueError("Census-derived state geometry validation failed")
    if (wa.get("scope")!="WA_only_2026" or
        wa.get("records")!=EXPECTED_WA or
        wa.get("conditions",{}).get("P")!=EXPECTED_WA_POOR or
        wa.get("flagged_coordinate_count")!=EXPECTED_EXCLUDED_COORDINATES or
        wa.get("historical_condition_not_emergency") is not True or
        wa.get("national_2026_complete") is not False):
        raise ValueError("WA FHWA 2026 source and limitations validation failed")
    rows=[]
    for offset in range(0,EXPECTED_WA_PUBLISHED,100):
        page=json.loads(acquire(base,f"/api/wa26/bridges?limit=100&offset={offset}"))
        if (page.get("scope")!="WA_only_2026" or
            page.get("total_matches")!=EXPECTED_WA_PUBLISHED or
            page.get("offset")!=offset or
            page.get("returned")!=len(page.get("bridges",[])) or
            page.get("not_live_safety") is not True):
            raise ValueError(f"Washington page {offset} failed record/limit contract")
        for row in page["bridges"]:
            if (not isinstance(row,dict) or
                set(row)!=WA_KEYS or
                row.get("condition") not in ("G","F","P") or
                not isinstance(row.get("bridge_id"),str) or
                row.get("coordinate_quality")=="review_outside_wa_bbox"):
                raise ValueError("Invalid or non-public-safe bridge record")
            rows.append(row)
    if len(rows)!=EXPECTED_WA_PUBLISHED or len({r["bridge_id"] for r in rows})!=len(rows):
        raise ValueError("Missing or duplicate 2026 Washington bridge records")
    vendor=Path(args.leaflet_dir)
    outputs={
        "index.html":static_page(approved),
        "about.html":about_html(),
        "data/states.json":emit_json(summary),
        "data/states.geojson":emit_json(boundary),
        "data/wa-summary.json":emit_json(wa),
        "data/wa-bridges.json":emit_json({
            "scope":"WA_only_2026_public_records",
            "source_total":EXPECTED_WA,
            "withheld_coordinate_count":EXPECTED_EXCLUDED_COORDINATES,
            "not_live_safety":True,"bridges":rows}),
        "vendor/leaflet.js":(vendor/"leaflet.js").read_bytes(),
        "vendor/leaflet.css":(vendor/"leaflet.css").read_bytes(),
        "vendor/LEAFLET-LICENSE":(vendor/"LICENSE").read_bytes(),
        "vendor/US-ATLAS-LICENSE":(vendor/"us-atlas-LICENSE").read_bytes() if (vendor/"us-atlas-LICENSE").exists() else
            b"""Copyright 2013-2019 Michael Bostock
Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.
THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS.
""",
        "robots.txt":b"User-agent: *\nAllow: /\n",
    }
    for asset,b64digest in LEAFLET_SRI.items():
        actual=base64.b64encode(hashlib.sha256(outputs["vendor/"+asset]).digest()).decode()
        if actual!=b64digest:raise ValueError("Local map engine SRI mismatch")
    if not outputs["vendor/LEAFLET-LICENSE"]:
        raise ValueError("Leaflet license missing")
    manifest={
        "schema":"evercraft.aiw.public-beta-static.v1",
        "source_commit":args.commit,
        "source_origin":"Evercraft-owned private loopback preview",
        "generated_at_utc":datetime.now(timezone.utc).isoformat(),
        "public_release_ready":False,
        "public_url_verified":False,
        "national_2026_complete":False,
        "national_state_summaries_2025":EXPECTED_STATES,
        "geography_boundaries":EXPECTED_POLYGONS,
        "wa_2026_total":EXPECTED_WA,
        "wa_2026_poor":EXPECTED_WA_POOR,
        "wa_2026_deep_records":EXPECTED_WA_PUBLISHED,
        "wa_2026_flagged_coordinate_withheld":EXPECTED_EXCLUDED_COORDINATES,
        "source_wa_sha256":wa.get("source_sha256"),
        "files":{name:hashlib.sha256(data).hexdigest() for name,data in sorted(outputs.items())},
    }
    outputs["release.json"]=emit_json(manifest)
    outputs["SHA256SUMS"]=("".join(f"{hashlib.sha256(value).hexdigest()}  {key}\n"
                                   for key,value in sorted(outputs.items()))).encode("ascii")
    try:
        stage.mkdir(mode=0o700,parents=True)
        for name,data in outputs.items():
            path=stage/name
            path.parent.mkdir(parents=True,exist_ok=True)
            with path.open("xb") as f:f.write(data)
            path.chmod(0o644)
        archive=stage.parent/(stage.name+".tar.gz")
        if archive.exists():raise FileExistsError("Archive exists; no overwrite")
        with tarfile.open(archive,"x:gz") as tar:
            for name in sorted(outputs):
                tar.add(stage/name,arcname=name,recursive=False)
    except Exception:
        # Keep partial staging for diagnosis; nothing here modifies a public path.
        raise
    print(json.dumps({"state":"STATIC_BUNDLE_BUILT_PRIVATE","output":str(stage),
                      "archive":str(archive),"files":len(outputs),
                      "deep_records":len(rows),"public_deployed":False},indent=2))


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin",default="http://127.0.0.1:8796")
    parser.add_argument("--source-html",required=True,help="Pinned reviewed GitHub HTML, byte-equal to the running private preview")
    parser.add_argument("--leaflet-dir",required=True)
    parser.add_argument("--output",required=True)
    parser.add_argument("--commit",required=True)
    params=parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}",params.commit):parser.error("Pin exact 40-character source commit")
    export(params)
