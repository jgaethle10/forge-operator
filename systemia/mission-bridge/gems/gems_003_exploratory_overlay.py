#!/usr/bin/env python3
"""GEMS-003 exploratory geometry overlays of two already scored rasters.
No hidden score, ground-truth evaluation, training, network, or submissions.
"""
import argparse,hashlib,json,zipfile
from pathlib import Path
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from scipy.ndimage import distance_transform_edt

GEMS001_SHA="3b2360bed8966b4bfdae76bfeb5436bf6dccd16ac9dc5ff402434736bdee57a4"
GEMS002_SHA="7d2b4cf8bc16421e36b196b2b6b349b65e0b6732560a392b98ac699ff3c6be80"
OPTIONS=(("conservative",.70,10),("broader",.60,30))
def sha256(payload):return hashlib.sha256(payload).hexdigest()
def overlay(old,new,confidence,max_distance_pixels):
    """Returns old probabilities unmodified except GEMS-002-only nearby pixels."""
    if old.shape!=new.shape or old.ndim!=2:raise ValueError("grid_shape_mismatch")
    valid=np.isfinite(old)
    if not np.array_equal(valid,np.isfinite(new)) or not valid.any():
        raise ValueError("valid_mask_mismatch")
    if np.any((old[valid]<0)|(old[valid]>1)|(new[valid]<0)|(new[valid]>1)):
        raise ValueError("invalid_probabilities")
    original=(old>=.2)&valid
    candidate=(new>=.2)&valid
    only=candidate&~original
    d=distance_transform_edt(~original)
    allow=only&(new>=confidence)&(d<=max_distance_pixels)
    output=old.copy()
    output[allow]=new[allow]
    if not np.array_equal(output[valid&~allow],old[valid&~allow]):
        raise AssertionError("incumbent_values_changed")
    return output,allow,d
def generate(archive,candidate,dest):
    archive=Path(archive);candidate=Path(candidate);dest=Path(dest)
    if dest.exists():raise FileExistsError("output_dir_exists")
    with zipfile.ZipFile(archive) as z:
        old_bytes=z.read("gems_candidate.tif")
    if sha256(old_bytes)!=GEMS001_SHA:raise ValueError("gems001_sha256_mismatch")
    if sha256(candidate.read_bytes())!=GEMS002_SHA:
        raise ValueError("gems002_sha256_mismatch")
    with MemoryFile(old_bytes) as mem,mem.open() as source,rasterio.open(candidate) as other:
        metadata=(source.width,source.height,source.count,source.crs,source.transform,source.dtypes[0])
        if metadata!=(other.width,other.height,other.count,other.crs,other.transform,other.dtypes[0]):
            raise ValueError("candidate_raster_grid_mismatch")
        if source.count!=1 or source.dtypes[0]!="float32":
            raise ValueError("single_float32_band_required")
        profile=source.profile.copy()
        old=source.read(1);new=other.read(1)
    valid=np.isfinite(old)
    if not np.array_equal(valid,np.isfinite(new)):raise ValueError("valid_mask_mismatch")
    old_only=(old>=.2)&(new<.2)&valid
    new_only=(new>=.2)&(old<.2)&valid
    report={"schema":"evercraft.gems.exploratory-overlay.v1",
            "official_dti_known":False,"new_fault_labels_available":False,
            "submission_made":False,"automatic_promotion_allowed":False,
            "original_hash":GEMS001_SHA,"challenger_hash":GEMS002_SHA,
            "valid_pixels":int(valid.sum()),
            "old_only_pixels":int(old_only.sum()),"new_only_pixels":int(new_only.sum()),
            "variants":{}}
    dest.mkdir(parents=True,exist_ok=False)
    profile.update(driver="GTiff",dtype="float32",count=1,nodata=None,
        tiled=True,blockxsize=256,blockysize=256,compress="deflate",predictor=3)
    for name,threshold,distance in OPTIONS:
        result,added,_=overlay(old,new,threshold,distance)
        filename=f"gems_003_{name}_EXPLORATORY_UNSUBMITTED.tif"
        path=dest/filename
        with rasterio.open(path,"w",**profile) as dst:dst.write(result,1)
        with rasterio.open(path) as verify:
            reread=verify.read(1)
            if not np.array_equal(reread[valid],result[valid]) or not np.array_equal(np.isnan(reread),~valid):
                raise ValueError("roundtrip_mismatch")
        report["variants"][name]={"filename":filename,"sha256":sha256(path.read_bytes()),
            "minimum_new_confidence":threshold,"max_old_distance_pixels":distance,
            "added_cells":int(added.sum()),"total_ge_02":int(((result>=.2)&valid).sum()),
            "original_probabilities_preserved_except_added_cells":True}
    (dest/"evidence.json").write_text(json.dumps(report,indent=2)+"\n")
    return report
if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--gems-001-archive",type=Path,required=True)
    p.add_argument("--gems-002-tif",type=Path,required=True)
    p.add_argument("--new-output-dir",type=Path,required=True)
    a=p.parse_args()
    print(json.dumps(generate(a.gems_001_archive,a.gems_002_tif,a.new_output_dir),indent=2))
