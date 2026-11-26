#!/usr/bin/env python3
"""FOREST-002 private geographic proof. No publication, dispatch or area inference."""
import argparse
import hashlib
import html
import json
import math
import os
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = "https://services.arcgis.com/4x406oNViizbGo13/ArcGIS/rest/services/Completed_FH_Treatments_2017_2022_EWA/FeatureServer/0"
ITEM = "https://www.arcgis.com/sharing/rest/content/items/5b1af5020b8a4264b3df397780e5e2e3"
EXPECTED_REVISION = 1793919093431
EXPECTED_COUNT = 27238
LIMIT = 16 * 1024 * 1024

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def request(url, params, post=False):
    encoded = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(
        url if post else url + "?" + encoded.decode(),
        data=encoded if post else None,
        headers={"Accept": "application/json", "User-Agent": "Evercraft-FOREST-002/1"},
    )
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=45) as res:
        body = res.read(LIMIT + 1)
    if len(body) > LIMIT:
        raise ValueError("response_limit")
    data = json.loads(body)
    if not isinstance(data, dict) or data.get("error"):
        raise ValueError("arcgis_error")
    return data

def sample_ids(ids, n):
    if not ids or len(set(ids)) != len(ids) or n < 1:
        raise ValueError("invalid_inventory")
    ids = sorted(ids)
    n = min(n, len(ids))
    return [ids[(i * (len(ids)-1)) // max(n-1, 1)] for i in range(n)]

def rings_checked(geometry):
    rings = geometry.get("rings")
    if not isinstance(rings, list) or not rings:
        raise ValueError("missing_rings")
    result = []
    for ring in rings:
        if len(ring) < 4:
            raise ValueError("invalid_ring")
        coords = []
        for point in ring:
            if not isinstance(point, list) or len(point) != 2:
                raise ValueError("invalid_coordinate")
            x, y = point
            if not all(type(v) in (int, float) and math.isfinite(v) for v in (x,y)):
                raise ValueError("invalid_coordinate")
            if not (-125 <= x <= -116 and 45 <= y <= 50):
                raise ValueError("outside_washington_envelope")
            coords.append([x,y])
        if coords[0] != coords[-1]:
            raise ValueError("unclosed_ring")
        result.append(coords)
    return result

def inventory():
    count = request(ROOT + "/query", {"f":"json","where":"1=1","returnCountOnly":"true"})["count"]
    inv = request(ROOT + "/query", {"f":"json","where":"1=1","returnIdsOnly":"true"})
    ids = inv["objectIds"]
    if count != EXPECTED_COUNT or inv.get("objectIdFieldName") != "OBJECTID" or inv.get("exceededTransferLimit") or len(ids) != count or len(set(ids)) != count or any(type(x) is not int or x < 0 for x in ids):
        raise ValueError("baseline_inventory_changed")
    return sorted(ids)

def revision():
    meta = request(ROOT, {"f":"json"})
    if meta.get("geometryType") != "esriGeometryPolygon" or meta.get("editingInfo",{}).get("lastEditDate") != EXPECTED_REVISION:
        raise ValueError("baseline_revision_changed")
    return meta

def collect(n):
    first = revision()
    ids = inventory()
    selected = sample_ids(ids, n)
    found = {}
    for i in range(0,len(selected),16):
        batch = selected[i:i+16]
        result = request(ROOT + "/query", {
            "f":"json","objectIds":",".join(map(str,batch)),
            "outFields":"OBJECTID","returnGeometry":"true","outSR":"4326",
            "maxAllowableOffset":"0.0001","returnZ":"false","returnM":"false"
        }, post=True)
        if result.get("exceededTransferLimit") or result.get("geometryType") != "esriGeometryPolygon" or result.get("spatialReference",{}).get("wkid") != 4326:
            raise ValueError("geometry_response_unverified")
        for row in result["features"]:
            oid = row["attributes"]["OBJECTID"]
            if oid not in batch or oid in found:
                raise ValueError("unexpected_geometry_id")
            found[oid] = rings_checked(row["geometry"])
        if any(oid not in found for oid in batch):
            raise ValueError("missing_geometry_id")
    if inventory() != ids or revision()["name"] != first["name"]:
        raise ValueError("source_changed_during_collection")
    # Retrieve item metadata independently, without treating public access as license.
    try:
        item = request(ITEM, {"f":"json"})
        rights = {k:item.get(k) for k in ("id","title","access","licenseInfo","accessInformation","modified","url")}
    except Exception as exc:
        rights = {"metadata_state":"HOLD","error_type":type(exc).__name__}
    return {
        "schema":"evercraft.forest-002.geometry-canary.v1",
        "source_url":ROOT,"item_url":ITEM,"source_revision_epoch_ms":EXPECTED_REVISION,
        "inventory_count":len(ids),"sample_count":len(found),"sample_method":"evenly spaced sorted object IDs; not spatially representative",
        "spatial_reference":"EPSG:4326","simplification_offset_degrees":0.0001,
        "unique_footprint_acres":None,"rights_review":"HOLD","publication_authorized":False,
        "item_rights_metadata":rights,
        "features":[{"object_id":oid,"rings":found[oid]} for oid in selected]
    }

def render(data):
    # Geographic grid only: no invented county/state boundaries or basemap.
    # Longitude scaled by cos(47.5 degrees) for a local equirectangular preview.
    left,right,bottom,top = -125,-116,45,50
    w,h = 1050,740
    x0,y0 = 66,80
    scale = min(920/((right-left)*math.cos(math.radians(47.5))),550/(top-bottom))
    def xy(x,y):
        return x0+(x-left)*math.cos(math.radians(47.5))*scale,y0+(top-y)*scale
    grid = []
    for lon in range(left,right+1):
        x,y = xy(lon,top)
        _,end = xy(lon,bottom)
        grid.append(f'<path d="M{x:.2f} {y:.2f}V{end:.2f}" stroke="#263e49"/><text x="{x:.2f}" y="{end+18:.2f}" text-anchor="middle">{lon}°</text>')
    for lat in range(bottom,top+1):
        x,y = xy(left,lat)
        end,_ = xy(right,lat)
        grid.append(f'<path d="M{x:.2f} {y:.2f}H{end:.2f}" stroke="#263e49"/><text x="{x-8:.2f}" y="{y+4:.2f}" text-anchor="end">{lat}°</text>')
    shapes=[]
    for feature in data["features"]:
        pieces=[]
        for ring in feature["rings"]:
            coords=[xy(x,y) for x,y in ring]
            pieces.append("M"+" L".join(f"{x:.2f} {y:.2f}" for x,y in coords)+" Z")
        shapes.append(f'<path d="{" ".join(pieces)}" fill="#71d9aa" fill-opacity=".45" stroke="#9ff7c4" stroke-width=".7" fill-rule="evenodd"/>')
        # Locator is the first ring vertex, not a centroid or project address.
        x,y=xy(*feature["rings"][0][0])
        shapes.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="2.2" fill="#c0ffe2" opacity=".8"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
<rect width="100%" height="100%" fill="#0b1b24"/>
<g font-family="sans-serif" fill="#d9e7eb" font-size="12">
<text x="32" y="34" font-size="25" font-weight="bold">FOREST-002 | Treatment geometry</text>
<text x="32" y="58">Private source canary · {data["sample_count"]} of {data["inventory_count"]} records · simplified polygons + vertex locators</text>
{"".join(grid)}{"".join(shapes)}
<text x="32" y="685">WA DNR · 2017–Oct 2026 · ID-spaced sample, not a geographic density or coverage map.</text>
<text x="32" y="707">Rights review pending · no unique acreage, timber yield or publication authorization.</text>
</g></svg>'''

def self_test():
    assert sample_ids([5,1,3,2,4],3)==[1,3,5]
    assert sample_ids([2,1],9)==[1,2]
    valid={"rings":[[[-120,47],[-119,47],[-119,48],[-120,47]]]}
    assert rings_checked(valid)==valid["rings"]
    for invalid in ({"rings":[]},{"rings":[[[0,0]]*4]},{"rings":[[[-120,47],[-119,47],[-119,48],[-120,48]]]}):
        try:
            rings_checked(invalid)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid_geometry_accepted")
    preview=render({"sample_count":1,"inventory_count":3,"features":[{"rings":valid["rings"]}]})
    assert "Private source canary" in preview and "Rights review pending" in preview
    import xml.etree.ElementTree as ET
    ET.fromstring(preview)
    print(json.dumps({"state":"PASS","scope":"synthetic geometry and SVG fixtures"}))

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--self-test",action="store_true")
    p.add_argument("--out",type=Path)
    p.add_argument("--sample",type=int,default=128)
    args=p.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.out or not 1<=args.sample<=256:
        p.error("private --out and sample 1..256 required")
    os.umask(0o077)
    out=args.out.resolve()
    out.mkdir(mode=0o700,parents=False,exist_ok=False)
    data=collect(args.sample)
    evidence=json.dumps(data,indent=2,allow_nan=False).encode()
    (out/"geometry.private.json").write_bytes(evidence)
    (out/"preview.private.svg").write_text(render(data),encoding="utf8")
    summary={k:v for k,v in data.items() if k not in ("features","item_rights_metadata")}
    summary["geometry_sha256"]=hashlib.sha256(evidence).hexdigest()
    summary["preview_sha256"]=hashlib.sha256((out/"preview.private.svg").read_bytes()).hexdigest()
    (out/"summary.json").write_text(json.dumps(summary,indent=2),encoding="utf8")
    print(json.dumps(summary,indent=2))

if __name__=="__main__":
    main()
