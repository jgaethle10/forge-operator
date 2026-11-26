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
def private_dir(p):
    st=p.lstat()
    if p.is_symlink() or not p.is_dir() or st.st_uid!=os.getuid() or st.st_mode&0o077: raise ValueError("unsafe_private_directory")
def private_read(p,limit=16*1024*1024):
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,"rb") as f:
        import stat
        st=os.fstat(f.fileno())
        if not stat.S_ISREG(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode&0o077 or st.st_size>limit: raise ValueError("unsafe_checkpoint")
        return f.read(limit+1)
def batch_payload(ids, rows):
    if sorted(r["id"] for r in rows)!=ids or len({r["global_id"] for r in rows})!=len(ids): raise ValueError("batch_inventory_mismatch")
    raw=b"".join(encode(r)+b"\n" for r in rows)
    return encode({"schema":"evercraft.forest-002.batch.v1","revision":REV,"ids":ids,"rows_sha256":sha(raw),"rows":rows})
def decode_batch(raw,ids):
    data=json.loads(raw)
    if data.get("schema")!="evercraft.forest-002.batch.v1" or data.get("revision")!=REV or data.get("ids")!=ids: raise ValueError("checkpoint_binding_mismatch")
    rows=data["rows"]
    if batch_payload(ids,rows)!=raw: raise ValueError("checkpoint_integrity_mismatch")
    return rows
def collect(out):
    import fcntl
    os.umask(0o077)
    out.mkdir(mode=0o700,parents=False,exist_ok=True); private_dir(out)
    batches_dir=out/"batches"; batches_dir.mkdir(mode=0o700,exist_ok=True); private_dir(batches_dir)
    fd=os.open(out/"collection.lock",os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        import stat
        st=os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode&0o077: raise ValueError("unsafe_collection_lock")
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        collect_locked(out,batches_dir)
    finally: os.close(fd)
def durable_save(p,b):
    import tempfile
    fd,tmp=tempfile.mkstemp(prefix=p.name+".",suffix=".tmp",dir=p.parent)
    try:
        with os.fdopen(fd,"wb") as f: f.write(b); f.flush(); os.fsync(f.fileno())
        os.link(tmp,p)
        d=os.open(p.parent,os.O_RDONLY|os.O_DIRECTORY)
        try: os.fsync(d)
        finally: os.close(d)
    finally: os.unlink(tmp)
def inventory_digest(p):
    import stat
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,"rb") as f:
        st=os.fstat(f.fileno())
        if not stat.S_ISREG(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode&0o077 or st.st_size>512*1024*1024: raise ValueError("unsafe_inventory")
        return hashlib.file_digest(f,"sha256").hexdigest()
def collect_locked(out,batches_dir):
    G["revision"](); ids=G["inventory"]()
    if len(ids)!=COUNT: raise ValueError("inventory_count_mismatch")
    inventory_binding=encode({"schema":"evercraft.forest-002.inventory-binding.v1","source_url":ROOT,"revision":REV,"offset":OFFSET,"batch_size":BATCH,"ids":ids})
    manifest=out/"inventory-binding.json"
    if manifest.exists():
        if private_read(manifest)!=inventory_binding: raise ValueError("inventory_binding_changed")
    else: durable_save(manifest,inventory_binding)
    data_path=out/"inventory.private.jsonl"; receipt_path=out/"receipt.json"
    if receipt_path.exists():
        rec=json.loads(private_read(receipt_path))
        digest=inventory_digest(data_path)
        if rec.get("schema")!="evercraft.forest-002.full-geometry.v1" or rec.get("inventory_sha256")!=digest or rec.get("inventory_binding_sha256")!=sha(inventory_binding) or rec.get("record_count")!=COUNT or rec.get("publication_authorized") is not False: raise ValueError("completed_receipt_mismatch")
        print("EXISTING_FULL_RECEIPT=VERIFIED"); return
    seen=set(); batches=[]; years={}; categories={}
    total_bytes=0
    import tempfile
    fd,tmp=tempfile.mkstemp(prefix="inventory.",suffix=".tmp",dir=out)
    try:
        with os.fdopen(fd,"wb") as f:
            for i in range(0,len(ids),BATCH):
                batch=ids[i:i+BATCH]; checkpoint=batches_dir/("%06d.json"%(i//BATCH))
                if checkpoint.exists(): rows=decode_batch(private_read(checkpoint),batch)
                else:
                    rows=fetch_batch(batch)
                    durable_save(checkpoint,batch_payload(batch,rows))
                    time.sleep(.1)
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
            f.flush(); os.fsync(f.fileno())
        if G["inventory"]()!=ids or len(seen)!=COUNT: raise ValueError("inventory_changed")
        G["revision"]()
        digest=inventory_digest(pathlib.Path(tmp))
        if data_path.exists():
            if inventory_digest(data_path)!=digest: raise ValueError("existing_unreceipted_inventory_mismatch")
        else: os.link(tmp,data_path)
        receipt={"schema":"evercraft.forest-002.full-geometry.v1","source_url":ROOT,"source_revision_epoch_ms":REV,"record_count":len(ids),"spatial_reference":"EPSG:4326","simplification_offset_degrees":OFFSET,"inventory_sha256":digest,"inventory_binding_sha256":sha(inventory_binding),"batch_sha256":batches,"year_counts":years,"treatment_counts":categories,"unique_footprint_acres":None,"recoverable_timber_mbf":None,"publication_authorized":False,"rights_review":"HOLD"}
        durable_save(receipt_path,encode(receipt))
        print(json.dumps({k:v for k,v in receipt.items() if k!="batch_sha256"},indent=2))
    finally: os.unlink(tmp)
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
    payload=batch_payload([1],[n])
    assert decode_batch(payload,[1])==[n]
    for corrupt in [payload.replace(b"fixture",b"changed"),payload]:
        try: decode_batch(corrupt,[1] if corrupt!=payload else [2])
        except ValueError: pass
        else: raise AssertionError("invalid_checkpoint_accepted")
    print("FULL_GEOMETRY_FIXTURE=PASS")
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");p.add_argument("--out",type=pathlib.Path);a=p.parse_args()
    if a.self_test: self_test()
    elif a.out: collect(a.out)
    else: p.error("--out required")
