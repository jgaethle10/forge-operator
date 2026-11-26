#!/usr/bin/env python3
"""FOREST-002: complete inventory geographic collection, private only."""
import argparse, datetime as dt, hashlib, json, math, os, pathlib, runpy, time
HERE=pathlib.Path(__file__).resolve().parent
G=runpy.run_path(str(HERE/"forest-002-geometry.py"))
ROOT=G["ROOT"]; REV=G["EXPECTED_REVISION"]; COUNT=G["EXPECTED_COUNT"]
FIELDS="OBJECTID,GlobalID,DATE_COMPL,ACTIVITY,TREATMENT,ACRES_TREATED,GIS_ACRES"
BATCH=128
OFFSET=0.0005
def sha(b): return hashlib.sha256(b).hexdigest()
def encode(x): return json.dumps(x,allow_nan=False,separators=(",",":")).encode()
def save(p,b):
    tmp=p.with_name(p.name+".tmp")
    with tmp.open("xb") as f: f.write(b)
    os.replace(tmp,p)
def normalize(row, wanted):
    a=row["attributes"]
    if not all(k in a for k in FIELDS.split(",")) or type(a["OBJECTID"]) is not int or a["OBJECTID"] not in wanted: raise ValueError("bad_attributes")
    gid=a["GlobalID"]
    if not isinstance(gid,str) or not gid: raise ValueError("missing_global_id")
    date=a["DATE_COMPL"]
    if date is not None and type(date) is not int: raise ValueError("bad_date")
    year=None if date is None else dt.datetime.fromtimestamp(date/1000,dt.timezone.utc).year
    for k in ("ACTIVITY","TREATMENT"):
        if a[k] is not None and (not isinstance(a[k],str) or len(a[k])>255): raise ValueError("bad_label")
    for k in ("ACRES_TREATED","GIS_ACRES"):
        v=a[k]
        if v is not None and (type(v) not in (int,float) or not math.isfinite(v) or v<0): raise ValueError("bad_acres")
    return {"id":a["OBJECTID"],"global_id":gid.lower().strip("{}"),"date":date,"year":year,"activity":a["ACTIVITY"],"treatment":a["TREATMENT"],"reported_acres":a["ACRES_TREATED"],"gis_acres":a["GIS_ACRES"],"rings":G["rings_checked"](row["geometry"])}
def fetch_batch(ids):
    q={"f":"json","objectIds":",".join(map(str,ids)),"outFields":FIELDS,"returnGeometry":"true","outSR":"4326","maxAllowableOffset":str(OFFSET),"returnZ":"false","returnM":"false"}
    x=G["request"](ROOT+"/query",q,post=True)
    if x.get("exceededTransferLimit") or x.get("geometryType")!="esriGeometryPolygon" or x.get("spatialReference",{}).get("wkid")!=4326: raise ValueError("geometry_response_invalid")
    rows=[normalize(r,set(ids)) for r in x["features"]]
    if sorted(r["id"] for r in rows)!=ids: raise ValueError("batch_inventory_mismatch")
    return sorted(rows,key=lambda r:r["id"])
def collect(out):
    os.umask(0o077)
    out.mkdir(mode=0o700,parents=False,exist_ok=False)
    G["revision"](); ids=G["inventory"]()
    seen=set(); batches=[]; years={}; categories={}
    total_bytes=0; data_path=out/"inventory.private.jsonl"
    with data_path.open("xb") as f:
        for i in range(0,len(ids),BATCH):
            batch=ids[i:i+BATCH]
            rows=fetch_batch(batch)
            raw=b"".join(encode(r)+b"\n" for r in rows)
            total_bytes+=len(raw)
            if total_bytes>512*1024*1024: raise ValueError("inventory_size_limit")
            for r in rows:
                if r["global_id"] in seen: raise ValueError("duplicate_global_id")
                seen.add(r["global_id"])
                key=str(r["year"]) if r["year"] is not None else "Unknown"
                years[key]=years.get(key,0)+1
                key=r["treatment"] or "Unknown"
                categories[key]=categories.get(key,0)+1
            f.write(raw); batches.append(sha(raw))
            if i==0 or (i//BATCH+1)%10==0: print("RECONCILED_RECORDS="+str(min(i+BATCH,len(ids))),flush=True)
            time.sleep(.1)
    if G["inventory"]()!=ids or len(seen)!=COUNT: raise ValueError("inventory_changed")
    G["revision"]()
    digest=hashlib.file_digest(data_path.open("rb"),"sha256").hexdigest()
    receipt={"schema":"evercraft.forest-002.full-geometry.v1","source_url":ROOT,"source_revision_epoch_ms":REV,"record_count":len(ids),"spatial_reference":"EPSG:4326","simplification_offset_degrees":OFFSET,"inventory_sha256":digest,"batch_sha256":batches,"year_counts":years,"treatment_counts":categories,"unique_footprint_acres":None,"recoverable_timber_mbf":None,"publication_authorized":False,"rights_review":"HOLD"}
    save(out/"receipt.json",encode(receipt))
    print(json.dumps({k:v for k,v in receipt.items() if k!="batch_sha256"},indent=2))
def self_test():
    a={"OBJECTID":1,"GlobalID":"fixture","DATE_COMPL":0,"ACTIVITY":"test","TREATMENT":"thin","ACRES_TREATED":0,"GIS_ACRES":None}
    r={"attributes":a,"geometry":{"rings":[[[-120,47],[-119,47],[-119,48],[-120,47]]]}}
    n=normalize(r,{1})
    assert n["year"]==1970 and n["reported_acres"]==0 and n["gis_acres"] is None
    try: normalize(r,{2})
    except ValueError: pass
    else: raise AssertionError("unexpected_id_accepted")
    a["ACRES_TREATED"]=-1
    try: normalize(r,{1})
    except ValueError: pass
    else: raise AssertionError("negative_acres_accepted")
    print("FULL_GEOMETRY_FIXTURE=PASS")
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");p.add_argument("--out",type=pathlib.Path);a=p.parse_args()
    if a.self_test: self_test()
    elif a.out: collect(a.out)
    else: p.error("--out required")
