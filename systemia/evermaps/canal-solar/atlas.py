#!/usr/bin/env python3
"""EverMaps canal inventory collector. GIS evidence only, NOT solar feasibility."""
import argparse
import csv
import hashlib
import html
import json
import shutil
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import requests
from shapely.geometry import box, mapping, shape
from pyproj import Geod

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
GEOD = Geod(ellps="WGS84")
SOURCES = {
 "USGS_NHD": {"url":"https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6", "where":"ftype = 336 AND fcode <> 33603", "by":"US Geological Survey / The National Map (NHD)", "limits":"Nationwide canals/ditches, including non-irrigation or historically mapped features; not current operation/rights verification."},
 "WA_NHD": {"url":"https://gis.ecology.wa.gov/serverext/rest/services/TCP/EDAT/MapServer/48", "where":"FType = 336 AND FCode <> 33603", "by":"WA Department of Ecology / USGS", "limits":"Canals/ditches include features that may not be open or current."},
 "WA_SVID": {"url":"https://maps.yakimacounty.us/server/rest/services/Irrigation/SVIDLayersMap/FeatureServer/8", "where":"1=1", "by":"Yakima County / Sunnyside Valley Irrigation District contributors", "limits":"District source linework, not construction permission."},
 "CA_USBR": {"url":"https://geo.usbr.gov/server/rest/services/CGB_PAO_CVP_SacRiver_WebLayers_Tiles/MapServer/15", "where":"1=1", "by":"US Bureau of Reclamation", "limits":"Historical and partial CA/NV/OR coverage. Drains, ditches and wasteways included."},
 "CA_DWR_LOCAL": {"url":"https://utility.arcgis.com/usrsvcs/servers/b43dc55d1e1448f2b384ebb8efac9042/rest/services/InlandWaters/i12_Canals_and_Aqueducts_local/MapServer/0", "where":"1=1", "by":"California Department of Water Resources (CC BY)", "limits":"Local government or agency canals only; excludes major state and federal canals. Historic interpretation and updates may not match current conditions."},
 "OR_JACKSON": {"url":"https://jcportal.jacksoncountyor.gov/server/rest/services/Environmental/Irrigation_Canals/MapServer/7", "where":"TYPE IN (21,22,24)", "by":"Jackson County GIS", "limits":"Physical condition and active irrigation use unverified."},
 "UT_CACHE": {"url":"https://gis.cachecounty.gov/arcgis/rest/services/Canals/Canal_WebMap/MapServer/1", "where":"1=1", "by":"Cache County GIS", "limits":"Can include inactive or piped conveyances."},
 "FL_SFWMD": {"url":"https://geoweb.sfwmd.gov/agsext1/rest/services/WaterManagementSystem/Canals/MapServer/0", "where":"FLOWLINETYPE = 2", "by":"South Florida Water Management District", "limits":"Hydroedges alone do not prove operator access or viability."}
}
# Bounds are exploratory market envelopes, NOT administrative or project boundaries.
REGIONS = {
 "sunnyside_wa": ("Sunnyside–Grandview, WA",[-120.09,46.13,-119.64,46.42],"WA_NHD",["WA_SVID"]),
 "yakima_valley_wa": ("Yakima Valley, WA",[-121.03,46.05,-119.23,47.06],"WA_NHD",["WA_SVID"]),
 "turlock_modesto_ca": ("Turlock–Modesto, CA",[-121.17,37.25,-120.39,38.18],"CA_DWR_LOCAL",["CA_USBR"]),
 "fresno_madera_ca": ("Fresno–Madera, CA",[-120.15,36.36,-119.26,37.18],"CA_DWR_LOCAL",["CA_USBR"]),
 "stockton_delta_ca": ("Stockton–Delta, CA",[-122.04,37.77,-120.92,38.44],"CA_DWR_LOCAL",["CA_USBR"]),
 "sacramento_valley_ca": ("Sacramento Valley, CA",[-122.74,38.43,-121.06,40.4],"CA_DWR_LOCAL",["CA_USBR"]),
 "klamath_or_ca": ("Klamath Basin, OR/CA",[-122.13,41.32,-120.46,42.33],"USGS_NHD",[]),
 "newlands_nv": ("Newlands/Fallon, NV",[-119.99,39.11,-118.41,39.83],"USGS_NHD",[]),
 "medford_jackson_or": ("Medford/Jackson County, OR",[-123.24,42.09,-122.47,42.77],"OR_JACKSON",[]),
 "cache_valley_ut": ("Cache Valley, UT",[-112.26,41.46,-111.45,42.07],"USGS_NHD",[]),
 "south_florida_fl": ("South Florida Canal Districts",[-81.25,25.76,-80.05,27.12],"FL_SFWMD",[])
}

def stamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def api(session,url,params):
    for attempt in range(4):
        try:
            r=session.get(url,params=params,timeout=(12,75))
            r.raise_for_status()
            x=r.json()
            if not isinstance(x,dict) or "error" in x:
                raise RuntimeError("Service response error: "+str(x.get("error",x))[:300])
            return x
        except (requests.RequestException,ValueError,RuntimeError):
            if attempt==3: raise
            time.sleep(min(2**attempt,6))

def collect(session,source_id,bounds,cap=25000):
    src=SOURCES[source_id]; url=src["url"]+"/query"
    footprint=json.dumps({"xmin":bounds[0],"ymin":bounds[1],"xmax":bounds[2],"ymax":bounds[3],"spatialReference":{"wkid":4326}})
    params={"where":src["where"],"geometry":footprint,"geometryType":"esriGeometryEnvelope",
            "spatialRel":"esriSpatialRelIntersects","inSR":"4326","returnIdsOnly":"true","f":"json"}
    id_response=api(session,url,params)
    ids=id_response.get("objectIds")
    oid=id_response.get("objectIdFieldName") or "OBJECTID"
    if not isinstance(ids,list) or any(type(i)!=int for i in ids) or len(ids)!=len(set(ids)):
        raise RuntimeError("Incomplete or duplicate ID enumeration")
    ids.sort()
    if len(ids)>cap:
        raise RuntimeError("Too many features; split market envelope before retrieval")
    result={}
    for start in range(0,len(ids),100):
        batch=ids[start:start+100]
        geo=api(session,url,{"objectIds":",".join(map(str,batch)),"outFields":"*",
                             "returnGeometry":"true","outSR":"4326","f":"geojson"})
        if geo.get("type")!="FeatureCollection":
            raise RuntimeError("GeoJSON not supported by source")
        for f in geo.get("features",[]):
            props=f.get("properties") or {}
            val=props.get(oid,props.get(oid.lower(),props.get("OBJECTID",f.get("id"))))
            try: n=int(val)
            except (ValueError,TypeError): raise RuntimeError("Missing numeric source object ID")
            if n not in batch or n in result or not f.get("geometry"):
                raise RuntimeError("Unexpected, duplicate, or geometryless source feature")
            result[n]=f
        if not set(batch).issubset(result):
            raise RuntimeError("Batch incomplete; cannot publish")
    if set(ids)!=set(result): raise RuntimeError("Full retrieval incomplete")
    features=[]; boundary=box(*bounds)
    for n in ids:
        feat=result[n]
        geom=shape(feat["geometry"])
        if not geom.is_valid: raise RuntimeError("Invalid geometry from source")
        clipped=geom.intersection(boundary)
        if clipped.is_empty: continue
        if clipped.geom_type=="GeometryCollection":
            from shapely.geometry import MultiLineString
            lines=[]
            for g in clipped.geoms:
                if g.geom_type=="LineString": lines.append(g)
                elif g.geom_type=="MultiLineString": lines.extend(g.geoms)
            if not lines: continue
            clipped=MultiLineString(lines)
        if clipped.geom_type not in ("LineString","MultiLineString"): continue
        km=abs(GEOD.geometry_length(clipped))/1000
        if km<0.001: continue
        props=feat.get("properties") or {}
        name=next((str(props.get(k)) for k in ("GNIS_Name","CANAL_MC","CANAL","NAME","Name") if props.get(k)),"Unspecified")
        segment_id=source_id.lower()+"-"+hashlib.sha256((source_id+":"+str(n)).encode()).hexdigest()[:12]
        features.append({"type":"Feature","geometry":mapping(clipped),"properties":{
            "evermaps_id":segment_id,"source_id":source_id,"source_object_id":n,"source_name":name,
            "length_km":round(km,5),"status":"MAPPED_UNSCREENED","solar_feasible":"NOT_ASSESSED",
            "width":"NOT_VERIFIED","operator":"NOT_VERIFIED","rights":"NOT_VERIFIED",
            "water_operations":"NOT_VERIFIED","grid":"NOT_VERIFIED","source_url":src["url"]}})
    return features,{"source_id":source_id,"url":src["url"],"attribution":src["by"],
                     "limitations":src["limits"],"ids":len(ids),"clipped":len(features),
                     "mapped_length_km":round(sum(f["properties"]["length_km"] for f in features),3),
                     "retrieval_complete_for_query":True}

def make_map(title,features):
    safe_title=html.escape(title)
    payload=json.dumps({"type":"FeatureCollection","features":features},separators=(",",":")).replace("<",r"\u003c")
    return ("""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EverMaps | %s</title><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>body{margin:0;font:14px system-ui;background:#061a26;color:#e7f9f8}header{padding:20px}small{color:#ffcf94}#map{height:80vh}a{color:#7effda}</style>
<header><b>EVERCRAFT / EVERMAPS</b><h1>%s</h1><small>GIS SOURCE INVENTORY ONLY. NOT A SOLAR FEASIBILITY OR ENGINEERING STUDY.</small></header>
<div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
const features=%s;
if(window.L){const m=L.map('map');L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(m);
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const l=L.geoJSON(features,{style:{color:'#62e6c0',weight:3},onEachFeature:(f,l)=>{const p=f.properties;l.bindPopup('<b>'+escape(p.source_name)+'</b><p>'+escape(p.evermaps_id)+'</p><p>'+escape(p.length_km)+' km · '+escape(p.source_id)+'</p><b>Not screened</b>')}}).addTo(m);
if(l.getBounds().isValid())m.fitBounds(l.getBounds());else m.setView([37.5,-120.5],7);
}else document.getElementById('map').innerText='Offline map preview unavailable; use canal_segments.geojson.';</script></html>"""%(safe_title,safe_title,payload))

def write_csv(path,records):
    if not records: return
    with path.open("w",encoding="utf-8",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(records[0]))
        w.writeheader(); w.writerows(records)

def build(region_id):
    title,bounds,primary,others=REGIONS[region_id]
    output=OUT/region_id
    archive=OUT/(region_id+"_RESEARCH_ONLY.zip")
    if output.exists(): shutil.rmtree(output)
    archive.unlink(missing_ok=True)
    output.mkdir(parents=True,exist_ok=True)
    audits=[]; features=[]
    try:
        with requests.Session() as s:
            s.headers.update({"User-Agent":"Evercraft-EverMaps-Canal-Research/0.3"})
            for src in [primary]+others:
                incoming,audit=collect(s,src,bounds)
                audits.append(audit); features.extend(incoming)
        lead=next(x for x in audits if x["source_id"]==primary)
        if lead["clipped"]==0: raise RuntimeError("Primary source query returned no clipped canal features")
        manifest={"schema":"evercraft.evermaps.canal-inventory.v0.3","region":region_id,"title":title,
                  "generated_utc":stamp(),"status":"MAPPED_UNSCREENED","bounds_wgs84":bounds,
                  "sources":audits,"primary_source":primary,"source_feature_count":len(features),
                  "length_method":"primary-source only, segments clipped to market rectangle",
                  "limitations":"Not a complete physical canal census; no rights, open-water verification, construction suitability, MW, water savings, ROI or approvals.",
                  "sales_gate":"HUMAN_REVIEW_REQUIRED"}
        (output/"manifest.json").write_text(json.dumps(manifest,indent=2))
        (output/"canal_segments.geojson").write_text(json.dumps({"type":"FeatureCollection","features":features}))
        write_csv(output/"segment_inventory.csv",[f["properties"] for f in features])
        (output/"map.html").write_text(make_map(title,features))
        brief=f"""<!doctype html><html lang="en"><meta charset="utf-8"><title>{html.escape(title)} | EverMaps</title>
<style>body{{font:16px/1.6 system-ui;max-width:850px;margin:5vh auto;padding:25px;color:#193b45}}h1{{font-size:40px}}strong{{color:#156a55}}</style>
<p>EVERCRAFT / EVERMAPS · RESEARCH INVENTORY</p><h1>{html.escape(title)} Canal Corridor Inventory</h1>
<p><strong>{lead['clipped']:,} source centerlines · {lead['mapped_length_km']:,.1f} km (primary source)</strong></p>
<p>Source-bounded geographic records retrieved {stamp()}; NOT a solar feasibility report, owner or operator certification, rights report, or complete canal census.</p>
<h2>Available files</h2><p>Map, GeoJSON source lines, segment register, manifest and source audit. Public geographic records are attributed to their providers.</p>
<h2>Needed to qualify solar-cover potential</h2><p>On-site width, clear span, maintenance access, cross-structures, open-water and seasonal operations, rights and approvals, solar resource, utility interconnection and economics.</p>
<h2>Recommended buyer engagement</h2><p>Validate corridor coverage with the canal operator; agree on a paid evidence-enrichment scope before ranking opportunities.</p>
<p>Generated by EverMaps · External sale and suitability claims require manual quality review.</p></html>"""
        (output/"buyer_brief.html").write_text(brief)
        with zipfile.ZipFile(archive,"w",zipfile.ZIP_DEFLATED) as z:
            for file in sorted(output.iterdir()): z.write(file,arcname=region_id+"/"+file.name)
        print("MAPPED_UNSCREENED",region_id,lead["clipped"],"primary source features",archive,flush=True)
        return True
    except Exception as exc:
        if output.exists(): shutil.rmtree(output)
        output.mkdir(parents=True,exist_ok=True)
        (output/"manifest.json").write_text(json.dumps({"region":region_id,"generated_utc":stamp(),
            "status":"HOLD","reason":str(exc)[:500],"sales_gate":"BLOCKED"},indent=2))
        print("HOLD",region_id,str(exc)[:200],file=sys.stderr,flush=True)
        return False

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--regions",nargs="+",default=["sunnyside_wa","turlock_modesto_ca"],
                   help="Region IDs, or all")
    args=p.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    regions=list(REGIONS) if args.regions==["all"] else args.regions
    bad=[x for x in regions if x not in REGIONS]
    if bad: p.error("Unknown regions: "+", ".join(bad))
    failures=[rid for rid in regions if not build(rid)]
    if failures: sys.exit(2)

if __name__=="__main__": main()
