#!/usr/bin/env python3
"""GEMS-002 independent whole-connected-fault holdout protocol.
Three northern segment folds; compare fixed 0 vs 10 pixel exclusion.
Mapped-fault proxy only; not an official leaderboard result or submission.
"""
import argparse
import hashlib
import json
import time
from pathlib import Path
import numpy as np
import rasterio
from scipy import ndimage
from sklearn.ensemble import HistGradientBoostingClassifier
from gems_002_negative_ablation import (
    verify_inputs,validate_organizer_grid,verify_original_model_source,
    train_only_distances,sample_indices,dti_proxy_components,
    score_pooled_terms,SEED)

RADII=(0,10)
FOLDS=3
TRAIN_BUFFER=30
SCORE_CORRIDOR=15
MIN_TRACE=12

def split_connected_faults(raw,valid,south,seed=SEED,min_trace=MIN_TRACE):
    """8-connected raster segments, NOT authoritative geological trace IDs."""
    if raw.ndim!=2 or raw.shape!=valid.shape or valid.dtype!=bool:
        raise ValueError("fault_geometry_invalid")
    if not (0<south<raw.shape[0]):raise ValueError("southern_boundary_invalid")
    labels,total=ndimage.label((raw==1)&valid,structure=np.ones((3,3),bool))
    counts=np.bincount(labels.ravel(),minlength=total+1)
    south_ids=set(int(x) for x in np.unique(labels[south:]) if x>0)
    north_ids=[int(x) for x in np.unique(labels[:south]) if x>0]
    eligible=[x for x in north_ids if x not in south_ids and counts[x]>=min_trace]
    if len(eligible)<FOLDS:raise ValueError("insufficient_northern_segments")
    order=np.random.default_rng(seed).permutation(sorted(eligible))
    order=sorted(map(int,order),key=lambda x:-counts[x])
    splits=[[] for _ in range(FOLDS)]
    totals=[0]*FOLDS
    for seg in order:
        i=min(range(FOLDS),key=lambda k:(totals[k],len(splits[k]),k))
        splits[i].append(seg)
        totals[i]+=int(counts[seg])
    if any(not x for x in splits):raise ValueError("empty_segment_fold")
    return labels,splits,totals,{
        "components_total":int(total),"eligible_northern":len(eligible),
        "excluded_crossing_south":len(set(north_ids)&south_ids),
        "definition":"8_neighbor_connected_fault_pixels"}

def masks_for_fold(labels,segment_ids,valid,south,
                   train_buffer=TRAIN_BUFFER,corridor=SCORE_CORRIDOR):
    if labels.shape!=valid.shape or not segment_ids or corridor>=train_buffer:
        raise ValueError("invalid_segment_mask_contract")
    held=np.isin(labels,segment_ids)
    if not held.any() or np.any(held[south:]):
        raise ValueError("empty_or_southern_holdout")
    distance=ndimage.distance_transform_edt(~held)
    north=np.arange(valid.shape[0])[:,None]<south
    train=valid&north&(distance>train_buffer)
    other=(labels>0)&~held
    region=valid&north&(distance<=corridor)&~other
    truth=held&region
    if not train.any() or not region.any() or not truth.any():
        raise ValueError("empty_training_or_scoring_area")
    if (train&held).any() or (train&region).any() or (truth&other).any():
        raise AssertionError("holdout_leakage")
    return train,region,truth,{
        "heldout_positive_pixels":int(held.sum()),
        "score_pixels":int(region.sum()),
        "other_mapped_fault_pixels_excluded_from_score":int(
            (valid&north&(distance<=corridor)&other).sum()),
        "training_buffer_pixels":train_buffer,"scoring_corridor_pixels":corridor}

def execute(data,evidence):
    data=Path(data);evidence=Path(evidence)
    source=verify_original_model_source(Path(__file__).with_name("run.py"))
    import run as original
    hashes=verify_inputs(data)
    grid=validate_organizer_grid(data)
    with rasterio.open(data/"existing_faults.tif") as src:raw=src.read(1)
    with rasterio.open(data/"example_submission.tif") as src:valid=np.isfinite(src.read(1))
    if not np.array_equal(valid,raw!=-1):raise ValueError("label_mask_mismatch")
    south=int(np.quantile(np.where(valid)[0],.75))
    segment_map,splits,counts,inventory=split_connected_faults(raw,valid,south)
    evidence.mkdir(parents=True,exist_ok=True)
    original.DATA=data;original.EVIDENCE=evidence
    features=original.features(valid)
    known=(raw[valid]==1)
    ledger=[];started=time.monotonic()
    for fold,ids in enumerate(splits):
        train_map,region,truth,stats=masks_for_fold(segment_map,ids,valid,south)
        train=train_map[valid]
        test=region[valid]
        distances=train_only_distances(raw,valid,train)
        for radius in RADII:
            indexes,pool=sample_indices(known,train,distances,radius)
            model=HistGradientBoostingClassifier(max_iter=100,learning_rate=.10,
                max_leaf_nodes=23,early_stopping=False,random_state=SEED)
            model.fit(features[indexes],known[indexes])
            prob=np.zeros(valid.shape,np.float32)
            prob[region]=original.predict(model,features,test,features.shape[1])
            prediction=original.render(prob,.20,True)
            terms=dti_proxy_components(original,prediction,truth,region)
            ledger.append({
                "fold":fold,"radius_pixels":radius,"segments":len(ids),
                "segment_ids_sha256":hashlib.sha256(
                    np.array(sorted(ids),np.int32).tobytes()).hexdigest(),
                "segment_stats":stats,"positive_train":pool["positive_count"],
                "negative_train":pool["sampled_negative_count"],
                "terms":terms,"proxy_dti":score_pooled_terms([terms])})
    pooled={str(r):score_pooled_terms([row["terms"] for row in ledger
            if row["radius_pixels"]==r]) for r in RADII}
    output={"schema":"evercraft.gems.connected-segment-holdout.v1",
      "inputs":hashes,"grid":grid,"source_sha256":source,"seed":SEED,
      "southern_start_row":south,"southern_excluded_from_training":True,
      "segment_inventory":inventory,"segment_fold_sizes":counts,
      "fixed_radii_pixels":list(RADII),"train_buffer_pixels":TRAIN_BUFFER,
      "scoring_corridor_pixels":SCORE_CORRIDOR,"pooled_mapped_fault_proxy":pooled,
      "winner_gain":pooled["10"]-pooled["0"],
      "fold_ledger":ledger,"elapsed_seconds":time.monotonic()-started,
      "ground_truth_is_new_faults":False,
      "segment_definition_is_geological_trace":False,
      "independent_hidden_score":False,"submission_made":False}
    dest=evidence/"gems-002-connected-segment-holdout.json"
    if dest.exists():raise FileExistsError("evidence_already_exists")
    dest.write_text(json.dumps(output,indent=2)+"\n")
    return output

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--data-dir",type=Path,required=True)
    p.add_argument("--evidence-dir",type=Path,required=True)
    a=p.parse_args()
    result=execute(a.data_dir,a.evidence_dir)
    print(json.dumps({"scores":result["pooled_mapped_fault_proxy"],
        "gain":result["winner_gain"],"submission_made":False}))
