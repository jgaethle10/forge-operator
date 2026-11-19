#!/usr/bin/env python3
"""Compare actual full-grid GEMS-002 candidate with preserved GEMS-001 submission.
No training, network, hidden score, or submission. Read-only input files.
"""
import argparse, hashlib, io, json, zipfile
from pathlib import Path
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from scipy import ndimage

ORIGINAL_CANDIDATE_SHA256="3b2360bed8966b4bfdae76bfeb5436bf6dccd16ac9dc5ff402434736bdee57a4"
CUTOFFS=(0.05,0.1,0.2,0.3,0.5)
def _hash_bytes(data):return hashlib.sha256(data).hexdigest()
def _hash_file(path):
    h=hashlib.sha256()
    with Path(path).open("rb") as f:
        for block in iter(lambda:f.read(4*1024*1024),b""):h.update(block)
    return h.hexdigest()
def _stats(a,mask):
    finite=a[mask]
    if not np.all(np.isfinite(finite)) or np.any(finite<0) or np.any(finite>1):
        raise ValueError("candidate_values_invalid")
    metrics={}
    for cutoff in CUTOFFS:
        on=(a>=cutoff)&mask
        cells=int(on.sum())
        components,n=ndimage.label(on,structure=np.ones((3,3),bool))
        sizes=np.bincount(components[on],minlength=n+1)[1:]
        metrics[str(cutoff)]={"cells":cells,"fraction_valid":cells/int(mask.sum()),
            "components_8_connected":int(n),"single_pixel_components":int((sizes==1).sum()),
            "largest_component_cells":int(sizes.max()) if n else 0}
    quartiles=[]
    for indices in np.array_split(np.arange(mask.shape[0]),4):
        m=mask[indices]
        quartiles.append({"row_start":int(indices[0]),"row_end_inclusive":int(indices[-1]),
            "valid_cells":int(m.sum()),
            "cells_ge_0_2":int(((a[indices]>=.2)&m).sum())})
    return {"thresholds":metrics,"row_quartiles":quartiles}
def compare(gems1_zip,gems2_tif,expected_gems2_sha256=None):
    with zipfile.ZipFile(gems1_zip) as z:
        original=z.read("gems_candidate.tif")
    original_hash=_hash_bytes(original)
    if original_hash!=ORIGINAL_CANDIDATE_SHA256:
        raise ValueError("gems_001_original_candidate_hash_mismatch")
    candidate_hash=_hash_file(gems2_tif)
    if expected_gems2_sha256 and candidate_hash!=expected_gems2_sha256:
        raise ValueError("gems_002_candidate_hash_mismatch")
    with MemoryFile(original) as memory, memory.open() as a, rasterio.open(gems2_tif) as b:
        if a.count!=1 or b.count!=1 or a.dtypes[0]!="float32" or b.dtypes[0]!="float32":
            raise ValueError("candidate_band_contract_mismatch")
        if (a.width,a.height,a.crs,a.transform)!=(b.width,b.height,b.crs,b.transform):
            raise ValueError("candidate_grid_mismatch")
        old=a.read(1);new=b.read(1)
    oldmask=np.isfinite(old);newmask=np.isfinite(new)
    if not np.array_equal(oldmask,newmask) or not np.any(oldmask):
        raise ValueError("candidate_valid_mask_mismatch")
    old_stats=_stats(old,oldmask);new_stats=_stats(new,newmask)
    change=(new-old)[oldmask]
    levels={}
    for cutoff in CUTOFFS:
        o=(old>=cutoff)&oldmask;n=(new>=cutoff)&newmask
        overlap=int((o&n).sum());union=int((o|n).sum())
        levels[str(cutoff)]={"intersection_cells":overlap,"union_cells":union,
            "intersection_over_union":overlap/union if union else None,
            "new_only_cells":int((n&~o).sum()),
            "old_only_cells":int((o&~n).sum())}
    density_old=old_stats["thresholds"]["0.2"]["fraction_valid"]
    density_new=new_stats["thresholds"]["0.2"]["fraction_valid"]
    return {"schema":"evercraft.gems.offline-candidate-compare.v1",
        "gems_001_sha256":original_hash,"gems_002_sha256":candidate_hash,
        "grid_and_nan_mask_match":True,"finite_cells":int(oldmask.sum()),
        "gems_001":old_stats,"gems_002":new_stats,
        "geographic_overlap":levels,"change_quantiles":np.quantile(change,[0,.01,.25,.5,.75,.99,1]).tolist(),
        "density_ge_0_2_ratio_new_vs_old":(density_new/density_old if density_old>0 else None),
        "full_area_false_positive_rate_known":False,
        "new_fault_hidden_dti_known":False,"submission_made":False,
        "automatic_promotion_allowed":False}
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--gems-001-archive",type=Path,required=True)
    p.add_argument("--gems-002-tif",type=Path,required=True)
    p.add_argument("--expected-gems-002-sha256")
    p.add_argument("--receipt",type=Path,required=True)
    opts=p.parse_args()
    if opts.receipt.exists():raise FileExistsError("comparison_receipt_exists")
    out=compare(opts.gems_001_archive,opts.gems_002_tif,opts.expected_gems_002_sha256)
    opts.receipt.parent.mkdir(parents=True,exist_ok=True)
    with opts.receipt.open("x") as f:json.dump(out,f,indent=2)
    print(json.dumps({"receipt":str(opts.receipt),
       "gems_002_sha256":out["gems_002_sha256"],
       "density_ge_0_2_ratio_new_vs_old":out["density_ge_0_2_ratio_new_vs_old"],
       "submission_made":False}))
if __name__=="__main__":main()
