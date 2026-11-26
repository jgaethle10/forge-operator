#!/usr/bin/env python3
"""Private historical activity profile; never a timber supply or unique-area forecast."""
import argparse, collections, hashlib, json, math, os, pathlib, stat
EXPECTED="02cb99cdd47082c6b534014022f8276c4a162a17dcf1c64d0c23fea6825fd966"
def read(p,limit):
    with os.fdopen(os.open(p,os.O_RDONLY|os.O_NOFOLLOW),"rb") as f:
        s=os.fstat(f.fileno())
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode&0o077 or s.st_size>limit: raise ValueError("untrusted_private_input")
        b=f.read(limit+1)
        if len(b)>limit: raise ValueError("input_limit")
        return b
def sha(b): return hashlib.sha256(b).hexdigest()
def bbox(rings):
    pts=[p for ring in rings for p in ring]
    return min(p[0] for p in pts),min(p[1] for p in pts),max(p[0] for p in pts),max(p[1] for p in pts)
def in_box(p,b):
    return b[0]<=p[0]<=b[2] and b[1]<=p[1]<=b[3]
def contains(p,rings):
    x,y=p; inside=False
    for ring in rings:
        for (ax,ay),(bx,by) in zip(ring,ring[1:]):
            cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax)
            if abs(cross)<1e-12 and min(ax,bx)-1e-10<=x<=max(ax,bx)+1e-10 and min(ay,by)-1e-10<=y<=max(ay,by)+1e-10: return None
            if (ay>y)!=(by>y) and x<(bx-ax)*(y-ay)/(by-ay)+ax: inside=not inside
    return inside
def county_index(features):
    out=[]
    for f in features:
        a=f["attributes"]; rings=f["geometry"]["rings"]
        out.append((a["GEOID"],a["BASENAME"],bbox(rings),[(bbox([r]),r) for r in rings]))
    return out
def locate(p,index):
    hits=[]; boundary=False
    for code,name,b,rings in index:
        if not in_box(p,b): continue
        hit=contains(p,[ring for bb,ring in rings if in_box(p,bb)])
        if hit is None: boundary=True
        elif hit: hits.append((code,name))
    return hits[0] if len(hits)==1 and not boundary else ("unassigned","Boundary, multiple or outside")
def summary(rows,index):
    categories=collections.Counter(); activities=collections.Counter(); county=collections.defaultdict(collections.Counter); raw=collections.Counter(); years=collections.Counter()
    seen=set(); gids=set(); reported=[]; commercial=[]
    for r in rows:
        if r["id"] in seen or r["global_id"] in gids: raise ValueError("duplicate_source_identity")
        seen.add(r["id"]);gids.add(r["global_id"])
        treatment=(r["treatment"] or "").strip() or "Unknown"
        raw[r["treatment"] or "Unknown"]+=1; categories[treatment]+=1
        y=str(r["year"]) if r["year"] is not None else "Unknown";years[y]+=1
        p=r["rings"][0][0];code,name=locate(p,index)
        c=county[(code,name)];c["records"]+=1
        if treatment=="Commercial Vegetation":
            c["commercial_records"]+=1;activities[(r["activity"] or "").strip() or "Unknown"]+=1
        v=r["reported_acres"]
        if v is not None:
            if type(v) not in (float,int) or not math.isfinite(v) or v<0: raise ValueError("invalid_reported_acres")
            reported.append(v)
            if treatment=="Commercial Vegetation": commercial.append(v)
    return {"record_count":len(seen),"normalized_treatments":dict(categories),"raw_treatments":dict(raw),
        "year_counts":dict(sorted(years.items())),"commercial_activity_counts":dict(activities.most_common()),
        "reported_acres_sum":math.fsum(reported),"reported_acres_nonnull_records":len(reported),
        "commercial_reported_acres_sum":math.fsum(commercial),"commercial_reported_acres_nonnull_records":len(commercial),
        "county_locator_counts":[{"geoid":code,"county":name,"records":c["records"],"commercial_records":c["commercial_records"]} for (code,name),c in sorted(county.items(),key=lambda x:(-x[1]["commercial_records"],x[0]))],
        "county_method":"first polygon vertex against generalized 2025 Census boundaries; approximate record locator only; no county acreage allocation",
        "unique_footprint_acres":None,"recoverable_timber_mbf":None,"operating_mill_capacity":None,
        "publication_authorized":False,"rights_review":"HOLD"}
def build(full,counties,county_receipt,out):
    data=read(full/"inventory.private.jsonl",512*1024*1024); receipt=json.loads(read(full/"receipt.json",1024*1024))
    cb=read(counties,24*1024*1024);cr=json.loads(read(county_receipt,1024*1024))
    if sha(data)!=EXPECTED or receipt.get("inventory_sha256")!=EXPECTED or receipt.get("record_count")!=27238 or receipt.get("source_revision_epoch_ms")!=1793919093431 or receipt.get("publication_authorized") is not False: raise ValueError("inventory_binding_mismatch")
    features=json.loads(cb)["features"]
    if sha(cb)!=cr.get("census_sha256") or len(features)!=39 or len({f["attributes"]["GEOID"] for f in features})!=39: raise ValueError("county_binding_mismatch")
    profile=summary((json.loads(l) for l in data.splitlines()),county_index(features))
    if profile["record_count"]!=27238 or sum(r["records"] for r in profile["county_locator_counts"])!=27238 or profile["normalized_treatments"].get("Commercial Vegetation")!=5515: raise ValueError("profile_count_mismatch")
    profile.update(schema="evercraft.forest-003.historical-activity.v1",source_inventory_sha256=EXPECTED,source_revision_epoch_ms=1793919093431,county_sha256=sha(cb))
    out.mkdir(mode=0o700,exist_ok=False)
    raw=json.dumps(profile,indent=2,allow_nan=False).encode()+b"\n"
    (out/"profile.private.json").write_bytes(raw)
    (out/"receipt.json").write_text(json.dumps({"profile_sha256":sha(raw),"source_inventory_sha256":EXPECTED,"record_count":27238,"publication_authorized":False},indent=2))
    print(json.dumps(profile,indent=2))
    print("FOREST_ACTIVITY_PROFILE=PASS")
def self_test():
    ring=[[0,0],[4,0],[4,4],[0,4],[0,0]]
    hole=[[1,1],[2,1],[2,2],[1,2],[1,1]]
    assert contains((3,3),[ring,hole]) is True and contains((1.5,1.5),[ring,hole]) is False
    assert contains((0,1),[ring]) is None
    idx=[("53001","Fixture",bbox([ring]),[(bbox([ring]),ring)])]
    assert locate((3,3),idx)[0]=="53001" and locate((0,1),idx)[0]=="unassigned"
    row={"id":1,"global_id":"one","year":2025,"treatment":"Commercial Vegetation ","activity":"thin","reported_acres":3,"rings":[[[3,3],[3,4],[4,4],[3,3]]]}
    p=summary([row],idx)
    assert p["normalized_treatments"]=={"Commercial Vegetation":1} and p["commercial_reported_acres_sum"]==3 and p["unique_footprint_acres"] is None
    try: summary([row,row],idx)
    except ValueError: pass
    else: raise AssertionError("duplicate accepted")
    print("FOREST_ACTIVITY_FIXTURE=PASS")
if __name__=="__main__":
    os.umask(0o077)
    p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true")
    for k in ("full","counties","county-receipt","out"):p.add_argument("--"+k,type=pathlib.Path)
    a=p.parse_args()
    if a.self_test:self_test()
    elif all((a.full,a.counties,a.county_receipt,a.out)):build(a.full,a.counties,a.county_receipt,a.out)
    else:p.error("all four paths required")
