#!/usr/bin/env python3
"""FOREST-004: bounded first-party acquisition of processing-map catalog and county payroll context."""
import argparse, datetime as dt, hashlib, json, os, pathlib, subprocess, urllib.request, urllib.error, stat
HERE=pathlib.Path(__file__).resolve().parent
MAP="8ff0ad3c5f8246a3af709ff60f5a8abb"
ROOT="https://www.arcgis.com/sharing/rest/content/items/"+MAP
COUNTIES={"53019":"Ferry","53065":"Stevens","53047":"Okanogan","53051":"Pend Oreille"}
SOURCES={"map_metadata":ROOT+"?f=json","map_definition":ROOT+"/data?f=json",**{"qcew_"+c:"https://data.bls.gov/cew/data/api/2025/a/area/"+c+".csv" for c in COUNTIES}}
def sha(b):return hashlib.sha256(b).hexdigest()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*a,**k): return None
def fetch(url):
    if url not in SOURCES.values(): raise ValueError("unregistered_source")
    req=urllib.request.Request(url,headers={"User-Agent":"Evercraft Forest Research/1.0","Accept":"application/json,text/csv,*/*"})
    with urllib.request.build_opener(NoRedirect()).open(req,timeout=40) as r:
        if r.status!=200: raise ValueError("non_200")
        data=r.read(32*1024*1024+1)
        if len(data)>32*1024*1024: raise ValueError("response_limit")
        return data
def map_layers(data):
    obj=json.loads(data)
    if obj.get("error") or not isinstance(obj.get("operationalLayers"),list): raise ValueError("map_definition_unavailable")
    rows=[]
    def walk(layers,depth=0):
        if depth>6 or len(rows)>200:raise ValueError("map_layer_limit")
        for l in layers:
            if len(rows)>=200:raise ValueError("map_layer_limit")
            rows.append({k:str(l[k])[:1000] for k in ("id","title","url","itemId","layerType") if isinstance(l.get(k),str)})
            if isinstance(l.get("layers"),list):walk(l["layers"],depth+1)
    walk(obj["operationalLayers"])
    return rows
def qcew(out,code,data):
    raw=out/("qcew-"+code+".csv");raw.write_bytes(data)
    proc=subprocess.run(["node",str(HERE/"qcew-baseline.mjs"),"--file",code,"2025",str(raw)],capture_output=True,timeout=45)
    if proc.returncode:raise ValueError("qcew_parser_hold")
    x=json.loads(proc.stdout);r=x["result"]
    if x["source_file_sha256"]!=sha(data) or r["area_fips"]!=code or r["year"]!=2025 or not any(a["state"] in ("REPORTED","SUPPRESSED") for a in r["industries"]):raise ValueError("qcew_binding_hold")
    (out/("qcew-"+code+".json")).write_bytes(proc.stdout)
    return r
def run(out):
    out.mkdir(mode=0o700,exist_ok=False)
    rows=[];context={};layers=[]
    for key,url in SOURCES.items():
        entry={"source_key":key,"url":url,"status":"HOLD","sha256":None}
        try:
            data=fetch(url);(out/(key+".raw")).write_bytes(data);entry["sha256"]=sha(data)
            if key=="map_metadata":
                obj=json.loads(data)
                if obj.get("id")!=MAP or obj.get("type")!="Web Map" or obj.get("error"):raise ValueError("map_identity_hold")
                entry["status"]="PASS_METADATA_ONLY"
                entry["title"]=obj.get("title")
            elif key=="map_definition":
                layers=map_layers(data);entry["status"]="PASS_LAYER_CATALOG_ONLY"
            else:
                code=key[5:];context[code]=qcew(out,code,data);entry["status"]="PASS_HISTORICAL_PAYROLL"
        except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError) as e:entry["reason"]=type(e).__name__
        rows.append(entry)
    report={"schema":"evercraft.forest-004.industry-sources.v1","observed_at":dt.datetime.now(dt.timezone.utc).isoformat(),
        "sources":rows,"county_payroll":context,"map_layer_catalog":layers,
        "map_source_project":"https://nrsig.org/projects/infrastructure-mapping",
        "facility_inventory_verified":False,"current_operating_capacity":None,"recoverable_timber_mbf":None,
        "publication_authorized":False,"rights_review":"HOLD"}
    b=json.dumps(report,indent=2,allow_nan=False).encode()+b"\n";(out/"report.private.json").write_bytes(b)
    (out/"receipt.json").write_text(json.dumps({"report_sha256":sha(b),"source_count":len(rows),"publication_authorized":False},indent=2))
    print(json.dumps({"sources":rows,"county_payroll":{c:{"county":COUNTIES[c],"jobs":r["total"]["annual_avg_emplvl"],"establishments":r["total"]["annual_avg_estabs"]} for c,r in context.items()},"map_layer_catalog":layers,"facility_inventory_verified":False},indent=2))
    print("FOREST_INDUSTRY_SOURCE_RECEIPT=WRITTEN")
def self_test():
    assert map_layers(b'{"operationalLayers":[{"title":"Fixture","url":"https://example.org/0","layers":[{"title":"child"}]}]}')[1]["title"]=="child"
    try:map_layers(b'{"error":{"code":403}}')
    except ValueError:pass
    else:raise AssertionError("error accepted")
    try:fetch("https://example.org")
    except ValueError:pass
    else:raise AssertionError("unregistered URL accepted")
    print("FOREST_INDUSTRY_SOURCE_FIXTURE=PASS")
if __name__=="__main__":
    os.umask(0o077);p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true");p.add_argument("--out",type=pathlib.Path);a=p.parse_args()
    if a.self_test:self_test()
    elif a.out and a.out.is_absolute():run(a.out)
    else:p.error("absolute --out required")
