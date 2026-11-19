#!/usr/bin/env python3
"""Read-only diagnostic of PRESERVED GEMS-001 GeoTIFF topology.

Usage: python candidate_topology.py /private/gems_001_verified_submission.zip
Requires NumPy, Rasterio, SciPy. No network, training, submission or modifications.
This is NOT a performance metric and never claims official DTI.
"""
import hashlib
import json
import sys
import zipfile

import numpy as np
from rasterio.io import MemoryFile
from scipy import ndimage

SHA256="3b2360bed8966b4bfdae76bfeb5436bf6dccd16ac9dc5ff402434736bdee57a4"
THRESHOLDS=(0.1,0.3,0.5)

def audit(archive_path):
    with zipfile.ZipFile(archive_path) as z:
        raw=z.read("gems_candidate.tif")
        receipt=json.loads(z.read("evidence/drivendata-receipt.json"))
    digest=hashlib.sha256(raw).hexdigest()
    if digest!=SHA256 or receipt.get("staged_file_sha256")!=digest:
        raise ValueError("preserved_candidate_hash_mismatch")
    with MemoryFile(raw) as data, data.open() as raster:
        predicted=raster.read(1)
        crs=str(raster.crs)
        dimensions=[raster.width,raster.height]
        resolution=list(raster.res)
    finite=np.isfinite(predicted)
    positives=predicted[finite & (predicted>0)]
    structure=ndimage.generate_binary_structure(2,2)
    topology=[]
    for threshold in THRESHOLDS:
        selected=finite & (predicted>=threshold)
        labels,count=ndimage.label(selected,structure=structure)
        sizes=np.bincount(labels[selected],minlength=count+1)[1:]
        topology.append({
            "threshold":threshold,
            "cells_at_or_above":int(selected.sum()),
            "components_8_connected":int(count),
            "single_cell_components":int(np.count_nonzero(sizes==1)),
            "components_at_least_10_cells":int(np.count_nonzero(sizes>=10)),
            "largest_component_size_cells":int(sizes.max()) if len(sizes) else 0,
        })
    bands=[]
    for indices in np.array_split(np.arange(predicted.shape[0]),4):
        section=predicted[indices]
        valid=np.isfinite(section)
        selected=valid & (section>=0.3)
        bands.append({"rows":[int(indices[0]),int(indices[-1])],
          "valid_cells":int(valid.sum()),"cells_ge_0_3":int(selected.sum()),
          "fraction_of_valid_ge_0_3":round(float(selected.sum()/valid.sum()),9) if valid.any() else None})
    return {
       "schema":"evercraft.gems.real-candidate-topology-audit.v1",
       "source":"preserved_user_submission_zip",
       "submission_id_from_archived_receipt":receipt.get("submission_id"),
       "candidate_sha256":digest,
       "crs":crs,"dimensions":dimensions,"pixel_size_m":resolution,
       "finite_cells":int(finite.sum()),
       "positive_cells":len(positives),
       "positive_probability_quantiles":{
           key:round(float(value),8) for key,value in zip(
               ["min","q25","median","q75","p90","p95","p99","max"],
               np.quantile(positives,[0,.25,.5,.75,.9,.95,.99,1])
           )
       },
       "threshold_topology":topology,
       "north_south_row_bands":bands,
       "connectivity":"8_neighbor",
       "no_official_labels_used":True,
       "official_dti_computed":False,
       "performance_claim":False,
       "submission_modified":False,
       "external_network_called":False,
       "interpretation":"Prediction topology is not evidence of geological correctness or official model quality."
    }
if __name__=="__main__":
    if len(sys.argv)!=2:
        raise SystemExit("usage: candidate_topology.py PRIVATE_SUBMISSION.zip")
    print(json.dumps(audit(sys.argv[1]),indent=2))
