#!/usr/bin/env python3
"""Read-only external-layer screening for DOE GEMS.

Never injects features into a training matrix or declares that a license is
legally sufficient. Candidate review is distinct from scientific approval.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds, Window

GEMS_CRS="EPSG:32611"
GEMS_AFFINE=(100.,0.,243350.,0.,-100.,4508550.)
GEMS_WIDTH=3292
GEMS_HEIGHT=3730
GEMS_BOUNDS=(243350.,4135550.,572550.,4508550.)
METHODS={"method_only","external_raster"}
MAX_ENTRIES=100

def intersection(a,b):
    if len(a)!=4 or len(b)!=4:raise ValueError("bbox_invalid")
    left=max(a[0],b[0]);bottom=max(a[1],b[1])
    right=min(a[2],b[2]);top=min(a[3],b[3])
    if right<=left or top<=bottom:return None
    return (left,bottom,right,top)

def file_sha256(file):
    h=hashlib.sha256()
    with Path(file).open("rb") as f:
        for part in iter(lambda:f.read(1048576),b""):h.update(part)
    return h.hexdigest()

def evaluate(item):
    for key in ("id","title","source_project","source_kind","source_reference"):
        if not isinstance(item.get(key),str) or not item[key].strip():
            raise ValueError("source_required_"+key)
    if item["source_kind"] not in METHODS:raise ValueError("source_kind_invalid")
    result={"id":item["id"],"title":item["title"],
            "source_project":item["source_project"],"source_reference":item["source_reference"],
            "source_kind":item["source_kind"],"usable_for_training_now":False,
            "allowed_to_train_without_independent_review":False,
            "automatic_model_promotion":False}
    if item["source_kind"]=="method_only":
        if item.get("file_path"):raise ValueError("method_only_must_not_supply_data")
        result["status"]="methods_reusable_no_geographic_training_data"
        result["reason"]="Methods/visualization/provenance are not a GeoDAWN feature raster"
        return result
    if not item.get("file_path"):
        result["status"]="proposed_raster_not_acquired"
        result["reason"]="No local independently verified source bytes"
        return result
    path=Path(item["file_path"])
    if (not path.is_file() or path.is_symlink()
        or not isinstance(item.get("expected_sha256"),str)
        or len(item["expected_sha256"])!=64):
        raise ValueError("raster_path_or_expected_hash_invalid")
    actual=file_sha256(path)
    if actual.lower()!=item["expected_sha256"].lower():
        raise ValueError("external_raster_sha256_mismatch")
    result["sha256_verified_against_declared_pin"]=True
    result["sha256"]=actual
    with rasterio.open(path) as src:
        if src.count<1:raise ValueError("external_raster_missing_bands")
        result["crs"]=src.crs.to_string() if src.crs else None
        result["resolution"]=[abs(src.transform.a),abs(src.transform.e)]
        result["source_bounds"]=[src.bounds.left,src.bounds.bottom,
                                 src.bounds.right,src.bounds.top]
        result["bands"]=src.count
        if src.crs is None:
            result["status"]="georeference_missing"
            return result
        if src.crs.to_epsg()!=32611:
            result["status"]="different_crs_requires_bounded_transform_and_review"
            return result
        overlap=intersection(result["source_bounds"],GEMS_BOUNDS)
        result["bbox_overlap_epsg32611"]=list(overlap) if overlap else None
        if overlap is None:
            result["status"]="outside_geodawn_study_area"
            return result
        # Bounding-box overlap is only a broad-phase test. Inspect a bounded
        # local raster sample to catch obviously null/empty study-area claims.
        w=from_bounds(*overlap,transform=src.transform)
        x0=max(0,int(np.floor(w.col_off)));y0=max(0,int(np.floor(w.row_off)))
        x1=min(src.width,int(np.ceil(w.col_off+w.width)))
        y1=min(src.height,int(np.ceil(w.row_off+w.height)))
        if x1<=x0 or y1<=y0:raise ValueError("raster_window_empty")
        window=Window(x0,y0,x1-x0,y1-y0)
        sample=src.read(1,window=window,
                        out_shape=(min(256,y1-y0),min(256,x1-x0)),
                        masked=True)
        nonempty=bool(np.any(np.isfinite(sample.filled(np.nan))))
        result["bounded_sample_contains_finite_values"]=nonempty
        result["bounded_sample_is_full_coverage_proof"]=False
        if not nonempty:
            result["status"]="overlap_bbox_but_no_finite_sample"
            return result
        exact_grid=(
            np.isclose(src.transform.a,100.,rtol=0,atol=1e-7)
            and np.isclose(src.transform.e,-100.,rtol=0,atol=1e-7)
            and np.isclose((src.transform.c-243350.)%100.,0.,rtol=0,atol=1e-7)
            and np.isclose((4508550.-src.transform.f)%100.,0.,rtol=0,atol=1e-7))
        result["direct_100m_geodawn_alignment"]=bool(exact_grid)
    if not (item.get("competition_use_rights_declared") is True
            and item.get("sponsor_sharing_rights_declared") is True
            and isinstance(item.get("rights_source"),str)
            and item["rights_source"].strip()):
        result["status"]="rights_and_shareability_review_needed"
        return result
    if not result["direct_100m_geodawn_alignment"]:
        result["status"]="reprojection_or_resampling_review_needed"
        return result
    # Boolean assertions in an input manifest are NOT third-party verification.
    result["status"]="candidate_for_independent_rights_and_science_review_only"
    result["reason"]="Aligned raster hash checked, but rights, pixel coverage, label leakage and feature utility unverified"
    return result

def audit(manifest):
    if manifest.get("schema")!="evercraft.gems.cross-domain-catalog.v1":
        raise ValueError("catalog_schema_invalid")
    items=manifest.get("sources")
    if not isinstance(items,list) or not 1<=len(items)<=MAX_ENTRIES:
        raise ValueError("catalog_sources_invalid")
    ids=[x.get("id") for x in items]
    if len(set(ids))!=len(ids):raise ValueError("duplicate_source_id")
    entries=[evaluate(entry) for entry in items]
    return {"schema":"evercraft.gems.external-layer-screen.v1",
            "gems_crs":GEMS_CRS,"gems_bounds_epsg32611":list(GEMS_BOUNDS),
            "gems_pixel_size_m":100,"sources":entries,
            "sources_approved_for_training":0,
            "target_labels_from_unseen_new_faults_available":False,
            "automatic_training_or_submission":False,
            "notice":"Source review only; a bounding box or self-declared rights cannot qualify a training feature"}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--catalog",type=Path,required=True)
    p.add_argument("--receipt",type=Path,required=True)
    args=p.parse_args()
    if args.receipt.exists():raise FileExistsError("external_layer_receipt_exists")
    report=audit(json.loads(args.catalog.read_text()))
    args.receipt.parent.mkdir(parents=True,exist_ok=True)
    with args.receipt.open("x") as out:json.dump(report,out,indent=2)
    print(json.dumps({"receipt":str(args.receipt),
        "sources":len(report["sources"]),
        "sources_approved_for_training":0,
        "submission_made":False}))
