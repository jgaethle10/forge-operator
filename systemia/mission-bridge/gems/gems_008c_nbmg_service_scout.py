#!/usr/bin/env python3
"""GEMS-008C: bounded NBMG fault-source metadata scout, not fault validation."""
import argparse,hashlib,json,math,os,ssl
from collections import Counter
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request,build_opener,HTTPSHandler,HTTPRedirectHandler

SCHEMA="evercraft.gems.nbmg-24k-source-provenance-scout.v1"
BASE="https://gisweb.unr.edu/nbmg/rest/services/Geology/NBMG_Geology/MapServer/4/query"
PDF_SHA="79676005376b460fe80583e41871db6f33e99dfaa25cfc1ce7cabe7c85ab35b3"
FIELDS=("OBJECTID","source","faultType","positionalAccuracy","observationMethod")
MAX_RECORDS=500
MAX_BYTES=1024*1024

def require(ok,reason):
    if not ok:raise ValueError(reason)

def sha(path):
    h=hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):h.update(chunk)
    return h.hexdigest()

def preregister(manifest,pdf):
    manifest,pdf=Path(manifest),Path(pdf)
    require(manifest.is_file() and not manifest.is_symlink(),"private_manifest_missing")
    require(pdf.is_file() and not pdf.is_symlink(),"private_pdf_missing")
    require(sha(pdf)==PDF_SHA,"source_pdf_sha256_mismatch")
    data=json.loads(manifest.read_text())
    require(data.get("schema")=="evercraft.gems.external-fault-source-acquisition.v1","manifest_schema_invalid")
    record=next((x for x in data.get("sources",[]) if
        x.get("id")=="nbmg-ofr-20-1-petrified-spring-sheet1-2020"),None)
    require(isinstance(record,dict),"petrified_spring_record_missing")
    require(record.get("retrieval",{}).get("sha256")==PDF_SHA,"manifest_pdf_digest_mismatch")
    require(str(record.get("technical",{}).get("crs","")).startswith("EPSG:26911"),"source_crs_not_verified")
    polygon=record.get("organizer_overlap",{}).get("source_neatline_epsg26911")
    require(isinstance(polygon,list) and len(polygon)>=4,"source_neatline_missing")
    for pt in polygon:
        require(isinstance(pt,list) and len(pt)==2 and all(
            type(x) in (int,float) and math.isfinite(x) for x in pt),"invalid_neatline_coordinate")
    xmin=min(p[0] for p in polygon);xmax=max(p[0] for p in polygon)
    ymin=min(p[1] for p in polygon);ymax=max(p[1] for p in polygon)
    require(0<xmax-xmin<100000 and 0<ymax-ymin<100000,"invalid_envelope")
    envelope=dict(xmin=xmin,ymin=ymin,xmax=xmax,ymax=ymax,spatialReference={"wkid":26911})
    params=dict(f="json",where="1=1",geometry=json.dumps(envelope,separators=(",",":")),
                geometryType="esriGeometryEnvelope",inSR="26911",
                spatialRel="esriSpatialRelIntersects",outFields=",".join(FIELDS),
                returnGeometry="false",orderByFields="OBJECTID",resultRecordCount=str(MAX_RECORDS))
    url=BASE+"?"+urlencode(params)
    return dict(schema=SCHEMA,source_pdf_sha256=PDF_SHA,
                source_manifest_sha256=sha(manifest),source_map_id=record["id"],
                public_service_layer=BASE[:-6],query=url,
                query_envelope_epsg26911=envelope,
                envelope_intersection_not_fault_trace_intersection=True,
                source_and_fault_attributes_not_new_fault_truth=True,
                geometry_requested=False,maximum_features=MAX_RECORDS,
                lineage_and_rights_unverified=True,
                eligible_for_training_or_scoring=False)

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,url):
        raise ValueError("redirect_not_allowed")

def public_get(url):
    require(url.startswith(BASE+"?") and len(url)<3000,"non_allowlisted_url")
    req=Request(url,headers={"Accept":"application/json",
                             "User-Agent":"Evercraft-GEMS-SourceProvenance/1.0"})
    opener=build_opener(HTTPSHandler(context=ssl.create_default_context()),NoRedirect())
    with opener.open(req,timeout=12) as response:
        require(response.status==200,"service_http_non200")
        require(response.headers.get_content_type() in
                ("application/json","text/plain","application/octet-stream"),"service_content_type_invalid")
        raw=response.read(MAX_BYTES+1)
    require(len(raw)<=MAX_BYTES,"service_response_exceeds_budget")
    return json.loads(raw)

def analyze(plan,data):
    require(isinstance(data,dict) and "error" not in data,"arcgis_service_error")
    require(data.get("exceededTransferLimit") is not True,"response_truncated")
    features=data.get("features")
    require(isinstance(features,list) and len(features)<MAX_RECORDS,"response_missing_or_cap_reached")
    require(data.get("geometryType") in (None,"esriGeometryPolyline"),"unexpected_geometry_type")
    seen=set();tables={k:Counter() for k in FIELDS[1:]}
    for feature in features:
        require(isinstance(feature,dict) and feature.get("geometry") in (None,{}),
                "unexpected_geometry_in_metadata_only_response")
        attributes=feature.get("attributes")
        require(isinstance(attributes,dict) and all(k in attributes for k in FIELDS),
                "missing_required_attribute")
        oid=attributes["OBJECTID"]
        require(type(oid) is int and oid not in seen,"duplicate_or_invalid_oid")
        seen.add(oid)
        for field,counter in tables.items():
            val=attributes[field]
            require(val is None or isinstance(val,str) and len(val)<=500,
                    "invalid_public_attribute")
            counter[(val or "(missing)").strip()[:255]]+=1
    return {**{k:v for k,v in plan.items() if k!="query"},
            "live_or_captured_response_analyzed":True,
            "feature_count":len(features),
            **{field+"_distribution":dict(sorted(counts.items()))
               for field,counts in tables.items()},
            "not_exact_valid_mask_overlap":True,
            "independent_fault_labels_qualified":False,
            "competition_submission_made":False,
            "candidate_created":False,
            "decision":"HOLD: public attributes inform provenance, not independent fault validation"}

def write_once(path,record):
    path=Path(path)
    require(path.parent.is_dir() and not path.is_symlink(),"unsafe_receipt_location")
    with path.open("x") as f:
        os.chmod(path,0o600)
        json.dump(record,f,indent=2,allow_nan=False);f.write("\n")

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--manifest",required=True,type=Path)
    p.add_argument("--pdf",required=True,type=Path)
    p.add_argument("--receipt",required=True,type=Path)
    group=p.add_mutually_exclusive_group()
    group.add_argument("--allow-public-nbmg-query",action="store_true")
    group.add_argument("--response-json",type=Path)
    args=p.parse_args()
    plan=preregister(args.manifest,args.pdf)
    if args.allow_public_nbmg_query:
        report=analyze(plan,public_get(plan["query"]))
    elif args.response_json:
        report=analyze(plan,json.loads(args.response_json.read_text()))
    else:
        report=dict(plan,live_or_captured_response_analyzed=False,
                    mode="offline_request_packet_only")
    write_once(args.receipt,report)
    print(json.dumps({"receipt":str(args.receipt),
                      "live_query":args.allow_public_nbmg_query,
                      "feature_count":report.get("feature_count"),
                      "model_training":False,"submission_made":False}))

if __name__=="__main__":main()
