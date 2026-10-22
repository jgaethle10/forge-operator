#!/usr/bin/env python3
"""Source-labeled GIS validation queues. NOT a solar feasibility shortlist."""
import argparse
import csv
import json
import re
import sys
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

AMBIGUOUS = re.compile(r"\b(?:aqueduct|pipe|pipeline|wasteway|drain|siphon|tunnel|culvert|conduit)\b", re.I)
CHECKS = ("open_water", "owner_and_operator", "physical_width", "maintenance_access",
          "crossings_and_footings", "rights_and_easements", "utility_interconnection",
          "permitting_environment", "project_economics")

def validate_region(folder):
    manifest=json.loads((folder/"manifest.json").read_text())
    if manifest.get("status")!="MAPPED_UNSCREENED" or manifest.get("sales_gate")!="HUMAN_REVIEW_REQUIRED":
        raise ValueError("Manual mapped-unscreened review gate not established")
    fc=json.loads((folder/"canal_segments.geojson").read_text())
    features=fc.get("features") if fc.get("type")=="FeatureCollection" else None
    if not isinstance(features,list) or len(features)!=manifest["source_feature_count"]:
        raise ValueError("Feature count does not match manifest")
    actual=Counter(f.get("properties",{}).get("source_id") for f in features)
    expected={s["source_id"]:s["clipped"] for s in manifest["sources"]}
    if dict(actual)!=expected:raise ValueError("Source enumeration mismatch")
    primary=manifest["primary_source"]
    rows=[x["properties"] for x in features if x["properties"]["source_id"]==primary]
    if not rows:raise ValueError("No primary-source features")
    if any(x.get("status")!="MAPPED_UNSCREENED" or x.get("solar_feasible")!="NOT_ASSESSED" for x in rows):
        raise ValueError("Unverified readiness claim")
    named=[x for x in rows if str(x.get("source_name","")).strip() not in ("","Unspecified","None")]
    warnings=[x for x in named if AMBIGUOUS.search(str(x["source_name"]))]
    review=sorted([x for x in named if not AMBIGUOUS.search(str(x["source_name"]))],
                  key=lambda x:float(x.get("length_km",0)),reverse=True)
    unique=set(); queue=[]
    for x in review:
        k=x["evermaps_id"]
        if k in unique:continue
        unique.add(k)
        queue.append({"feature_id":k,"source_name":x["source_name"],"clipped_length_km":x["length_km"],
                      "source_id":x["source_id"],"state":"OPERATOR_VALIDATION_NEEDED",
                      "note":"A linework/name review item, not an approved solar site"})
        if len(queue)==12:break
    result={"schema":"evercraft.evermaps.operator-qa.v1","region":manifest["region"],
        "reviewed_utc":datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "state":"UNSCREENED_OPERATOR_REVIEW_ONLY","primary_source":primary,
        "primary_feature_count":len(rows),"named_feature_count":len(named),
        "unnamed_feature_count":len(rows)-len(named),"ambiguous_name_warnings":len(warnings),
        "operator_review_queue":queue,"checks_missing":CHECKS,
        "source_attributions":[{"id":s["source_id"],"url":s["url"],"attribution":s["attribution"]} for s in manifest["sources"]],
        "caveats":["No project suitability, owner consent, MW, economics or water saving claims",
                   "No complete physical canal census","Market envelopes and source layers may overlap"]}
    (folder/"qa_review.json").write_text(json.dumps(result,indent=2)+"\n")
    with (folder/"operator_validation_queue.csv").open("w",newline="",encoding="utf-8") as f:
        w=csv.DictWriter(f,fieldnames=["feature_id","source_name","clipped_length_km","source_id","state","note"])
        w.writeheader();w.writerows(queue)
    archive=folder.parent/(folder.name+"_RESEARCH_ONLY.zip")
    if not archive.exists():raise ValueError("Expected research archive absent")
    temp=archive.with_suffix(".tmp")
    with zipfile.ZipFile(archive) as source,zipfile.ZipFile(temp,"w",zipfile.ZIP_DEFLATED) as out:
        for item in source.infolist():
            if item.filename.endswith("/qa_review.json") or item.filename.endswith("/operator_validation_queue.csv"):continue
            out.writestr(item,source.read(item.filename))
        for name in ("qa_review.json","operator_validation_queue.csv"):
            out.write(folder/name,arcname=folder.name+"/"+name)
    temp.replace(archive)
    return {"region":folder.name,"primary_features":len(rows),"named_features":len(named),
            "review_queue":len(queue),"status":"REVIEW_ONLY"}

def main():
    p=argparse.ArgumentParser();p.add_argument("--root",default=str(Path(__file__).resolve().parent/"out"))
    args=p.parse_args();root=Path(args.root)
    folders=sorted(p for p in root.iterdir() if p.is_dir() and (p/"manifest.json").exists())
    if not folders:raise SystemExit("No regional archives to review")
    report=[];failures=0
    for folder in folders:
        try:
            v=validate_region(folder);report.append(v)
            print("OPERATOR_QA",v["region"],v["primary_features"],v["named_features"],v["review_queue"])
        except Exception as ex:
            failures+=1;(root/(folder.name+"_RESEARCH_ONLY.zip")).unlink(missing_ok=True)
            report.append({"region":folder.name,"status":"HOLD","reason":str(ex)})
            print("QA_HOLD",folder.name,str(ex),file=sys.stderr)
    (root/"market_qa.json").write_text(json.dumps({"markets":report},indent=2)+"\n")
    if failures:raise SystemExit(2)
if __name__=="__main__":main()
