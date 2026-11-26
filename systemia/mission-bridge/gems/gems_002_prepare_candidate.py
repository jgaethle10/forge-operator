#!/usr/bin/env python3
"""Offline GEMS-002 candidate only; deliberately no DrivenData submission.
Pinned to real-data-selected 1000m negative exclusion and original GEMS-001 model.
"""
import argparse, hashlib, json, time
from pathlib import Path
import numpy as np
import rasterio
from scipy.ndimage import distance_transform_edt
from sklearn.ensemble import HistGradientBoostingClassifier
from gems_002_negative_ablation import (
    SEED, sample_indices, verify_inputs, validate_organizer_grid,
    verify_original_model_source)
RADIUS_PIXELS=10
THRESHOLD=.20

def prepare(data_dir, output_dir):
    data_dir,output_dir=Path(data_dir),Path(output_dir)
    if output_dir.exists():raise FileExistsError("candidate_output_exists")
    source_path=Path(__file__).with_name("run.py")
    source_sha=verify_original_model_source(source_path)
    inputs=verify_inputs(data_dir)
    grid=validate_organizer_grid(data_dir)
    if output_dir==data_dir or output_dir==source_path.parent or data_dir in output_dir.parents or source_path.parent in output_dir.parents:
        raise ValueError("unsafe_output_location")
    with rasterio.open(data_dir/"example_submission.tif") as src:
        valid=np.isfinite(src.read(1))
        profile=src.profile.copy()
        transform=src.transform;crs=src.crs
    with rasterio.open(data_dir/"existing_faults.tif") as src:
        raw=src.read(1)
    if not np.array_equal(valid,raw!=-1):
        raise ValueError("label_template_mask_mismatch")
    known=(raw==1)&valid
    if int(known.sum())<100:raise ValueError("unexpectedly_few_known_fault_pixels")
    train=np.ones(int(valid.sum()),bool)
    distance=distance_transform_edt(~known)[valid].astype("float32")
    labels=known[valid]
    idx,pool=sample_indices(labels,train,distance,RADIUS_PIXELS,seed=SEED)
    if pool["positive_count"]!=int(known.sum()) or not pool["sampled_negative_count"]:
        raise ValueError("training_population_invalid")
    output_dir.mkdir(parents=True,exist_ok=False)
    import run as original
    original.DATA=data_dir;original.EVIDENCE=output_dir
    started=time.monotonic()
    matrix=original.features(valid)
    if matrix.shape!=(int(valid.sum()),34):raise ValueError("expected_original_34_features")
    model=HistGradientBoostingClassifier(max_iter=100,learning_rate=.10,
        max_leaf_nodes=23,early_stopping=False,random_state=SEED)
    model.fit(matrix[idx],labels[idx])
    prediction=np.zeros(valid.shape,np.float32)
    prediction[valid]=original.predict(model,matrix,train,34)
    if not np.all(np.isfinite(prediction[valid])) or np.any(prediction[valid]<0) or np.any(prediction[valid]>1):
        raise ValueError("model_prediction_invalid")
    output=original.render(prediction,THRESHOLD,True)
    output[~valid]=np.nan
    if not np.all(np.isfinite(output[valid])) or np.any(output[valid]<0) or np.any(output[valid]>1):
        raise ValueError("rendered_prediction_invalid")
    if not np.any(output[valid]>0):raise ValueError("empty_candidate")
    profile.update(driver="GTiff",dtype="float32",count=1,nodata=None,
        compress="deflate",predictor=3,tiled=True,blockxsize=256,blockysize=256)
    path=output_dir/"gems_002_candidate_UNSUBMITTED.tif"
    with rasterio.open(path,"w",**profile) as dst:dst.write(output,1)
    digest=hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda:f.read(4*1024*1024),b""):digest.update(part)
    with rasterio.open(path) as src:
        if src.count!=1 or src.dtypes[0]!="float32" or src.crs!=crs or src.transform!=transform or src.width!=valid.shape[1] or src.height!=valid.shape[0]:
            raise ValueError("candidate_raster_contract_mismatch")
        reread=src.read(1)
    if not np.array_equal(np.isnan(reread),~valid) or not np.array_equal(reread[valid],output[valid]):
        raise ValueError("candidate_pixel_roundtrip_mismatch")
    positives=reread[valid][reread[valid]>0]
    report={"schema":"evercraft.gems.offline-candidate.v1",
        "original_run_sha256":source_sha,"organizer_input_receipts":inputs,"grid":grid,
        "file":path.name,"candidate_sha256":digest.hexdigest(),"bytes":path.stat().st_size,
        "sha256_and_roundtrip_verified":True,"seed":SEED,
        "negative_exclusion_pixels":RADIUS_PIXELS,"negative_exclusion_meters":1000,
        "training_positives":pool["positive_count"],"sampled_negatives":pool["sampled_negative_count"],
        "feature_count":34,"model":"HGB(max_iter=100, learning_rate=.10, max_leaf_nodes=23, early_stopping=False)",
        "render_threshold":THRESHOLD,"ridge":True,
        "finite_grid_cells":int(valid.sum()),"nan_grid_cells":int((~valid).sum()),
        "positive_prediction_cells":int(positives.size),
        "positive_prediction_fraction":float(positives.size/valid.sum()),
        "nonzero_prediction_quantiles":np.quantile(positives,[0,.25,.5,.75,.95,1]).tolist(),
        "elapsed_seconds":time.monotonic()-started,
        "trained_on_full_mapped_fault_grid":True,
        "full_area_precision_validated":False,"hidden_new_fault_dti_known":False,
        "submission_made":False,"automatic_promotion_allowed":False}
    (output_dir/"candidate-evidence.json").write_text(json.dumps(report,indent=2)+"\n")
    return report

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--data-dir",required=True,type=Path)
    parser.add_argument("--output-dir",required=True,type=Path)
    args=parser.parse_args()
    result=prepare(args.data_dir,args.output_dir)
    print(json.dumps({"candidate_sha256":result["candidate_sha256"],
        "evidence":str(args.output_dir/"candidate-evidence.json"),
        "submission_made":False},indent=2))
