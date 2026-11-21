#!/usr/bin/env python3
"""GEMS-002 full-scoreable-area, mapped-fault proxy validation.

The previous connected-component study scores only 1.5 km corridors.
This protocol also scores ALL northern scoreable pixels, excluding known
training-fault pixels *exactly* as organizers clarify (not a buffered exclusion).
Newly mapped fault truth is NOT available: all metrics remain local proxies.
No submit action, no model promotion, no changes to GEMS-001.
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np
import rasterio
from scipy import ndimage
from sklearn.ensemble import HistGradientBoostingClassifier

from gems_002_negative_ablation import (
    SEED, verify_inputs, validate_organizer_grid, verify_original_model_source,
    train_only_distances, sample_indices, dti_proxy_components,
    score_pooled_terms)
from gems_002_segment_holdouts import (
    split_connected_faults, masks_for_fold, FOLDS, TRAIN_BUFFER, SCORE_CORRIDOR)

RADII=(0,10)
THRESHOLDS=(.2,.35,.5)
PRUNE_MIN_PIXELS=(1,2)

def full_scoreable_masks(labels, ids, valid, south):
    """Official-style pixel-exact known fault exclusion; no 1.5km corridor cut."""
    if labels.shape!=valid.shape or valid.dtype!=bool or not 0<south<valid.shape[0]:
        raise ValueError("full_area_geometry_invalid")
    if not ids:raise ValueError("holdout_segment_ids_missing")
    held=np.isin(labels,ids)
    if not held.any() or np.any(held[south:]):
        raise ValueError("full_area_holdout_invalid")
    north=np.arange(valid.shape[0])[:,None]<south
    train_known=(labels>0)&~held
    region=valid&north&~train_known
    truth=held&region
    if np.any(region&train_known) or not np.any(truth) or not np.any(region&~truth):
        raise ValueError("full_area_scoring_mask_invalid")
    return region,truth,train_known

def prune_small_components(pred,min_pixels):
    """Do not confuse visual cleanliness with better DTI; evaluate before use."""
    if min_pixels<1:raise ValueError("component_threshold_invalid")
    if min_pixels==1:return pred
    labeled,total=ndimage.label(pred>0,structure=np.ones((3,3),bool))
    sizes=np.bincount(labeled.ravel(),minlength=total+1)
    keep=(labeled>0)&(sizes[labeled]>=min_pixels)
    return np.where(keep,pred,0).astype("float32")

def score_masked_proxy(original,pred,truth,region,known_mask):
    """A known-fault prediction is not given credit near a new held-out label."""
    if pred.shape!=truth.shape or truth.shape!=region.shape or region.shape!=known_mask.shape:
        raise ValueError("scoring_shapes_invalid")
    if np.any(region&known_mask):raise AssertionError("known_scoring_mask_overlap")
    scored=pred.copy()
    scored[known_mask]=0
    return dti_proxy_components(original,scored,truth,region)

def variants_for_radius(radius):
    if radius==0:return ((.2,1),)
    if radius==10:return tuple((threshold,minimum)
        for threshold in THRESHOLDS for minimum in PRUNE_MIN_PIXELS)
    raise ValueError("radius_invalid")

def summarize(ledger):
    result={}
    for radius in RADII:
        for threshold,minimum in variants_for_radius(radius):
            records=[r for r in ledger
                if r["radius_pixels"]==radius
                and r["threshold"]==threshold
                and r["min_component_pixels"]==minimum]
            if len(records)!=FOLDS:raise ValueError("missing_fold_or_variant")
            key=f"r{radius}_t{threshold:g}_min{minimum}"
            result[key]={
                "full_area_pooled_dti":score_pooled_terms([r["full_terms"] for r in records]),
                "corridor_pooled_dti":score_pooled_terms([r["corridor_terms"] for r in records]),
                "full_area_tp":sum(r["full_terms"]["tp"] for r in records),
                "full_area_fp":sum(r["full_terms"]["fp"] for r in records),
                "full_area_fn":sum(r["full_terms"]["fn"] for r in records)}
    return result

def execute(data,evidence):
    data,evidence=Path(data),Path(evidence)
    if evidence.exists():raise FileExistsError("full_area_evidence_exists")
    pinned=verify_original_model_source(Path(__file__).with_name("run.py"))
    manifest=verify_inputs(data)
    grid=validate_organizer_grid(data)
    with rasterio.open(data/"existing_faults.tif") as f:raw=f.read(1)
    with rasterio.open(data/"example_submission.tif") as f:valid=np.isfinite(f.read(1))
    if not np.array_equal(valid,raw!=-1):raise ValueError("label_template_mask_mismatch")
    south=int(np.quantile(np.where(valid)[0],.75))
    components,splits,fold_sizes,inventory=split_connected_faults(raw,valid,south)
    evidence.mkdir(parents=True,exist_ok=False)
    import run as original
    original.DATA=data;original.EVIDENCE=evidence
    matrix=original.features(valid)
    labels=(raw[valid]==1)
    north=valid&(np.arange(valid.shape[0])[:,None]<south)
    north_test=north[valid]
    ledger=[]
    started=time.monotonic()
    for fold,ids in enumerate(splits):
        train_map,corridor,_,stats=masks_for_fold(
            components,ids,valid,south,TRAIN_BUFFER,SCORE_CORRIDOR)
        full,truth,known=full_scoreable_masks(components,ids,valid,south)
        if not np.any(corridor&~full):
            pass
        else:
            raise AssertionError("corridor_beyond_scoreable_region")
        if not np.array_equal(truth&corridor,np.isin(components,ids)):
            raise AssertionError("heldout_trace_not_fully_scored")
        train=train_map[valid]
        distances=train_only_distances(raw,valid,train)
        for radius in RADII:
            indices,pool=sample_indices(labels,train,distances,radius)
            model=HistGradientBoostingClassifier(
                max_iter=100,learning_rate=.10,max_leaf_nodes=23,
                early_stopping=False,random_state=SEED)
            model.fit(matrix[indices],labels[indices])
            raw_prob=np.zeros(valid.shape,np.float32)
            raw_prob[north]=original.predict(model,matrix,north_test,matrix.shape[1])
            del model
            for threshold,minimum in variants_for_radius(radius):
                pred=original.render(raw_prob,threshold,True)
                pred=prune_small_components(pred,minimum)
                # Crop after rendering to avoid 3x3 boundary artifacts.
                crop=slice(0,min(valid.shape[0],south+3))
                fp=score_masked_proxy(original,pred[crop],truth[crop],
                    full[crop],known[crop])
                cp=score_masked_proxy(original,pred[crop],truth[crop],
                    corridor[crop],known[crop])
                ledger.append({"fold":fold,"radius_pixels":radius,
                    "threshold":threshold,"min_component_pixels":minimum,
                    "training_positives":pool["positive_count"],
                    "sampled_negatives":pool["sampled_negative_count"],
                    "full_area_scoreable_pixels":int(full.sum()),
                    "corridor_scoreable_pixels":int(corridor.sum()),
                    "known_fault_masked_pixels":int((known&north).sum()),
                    "heldout_fault_pixels":int(truth.sum()),
                    "positive_prediction_pixels_north":int(((pred>0)&north).sum()),
                    "full_terms":fp,"corridor_terms":cp,
                    "full_area_dti":score_pooled_terms([fp]),
                    "corridor_dti":score_pooled_terms([cp])})
            del raw_prob
    summary=summarize(ledger)
    base=summary["r0_t0.2_min1"]["full_area_pooled_dti"]
    incumbent=summary["r10_t0.2_min1"]["full_area_pooled_dti"]
    report={"schema":"evercraft.gems.full-area-mapped-fault-proxy.v1",
        "organizer_input_sha256":manifest,"grid":grid,"original_run_sha256":pinned,
        "seed":SEED,"folds":FOLDS,"segment_inventory":inventory,
        "heldout_segment_fold_sizes":fold_sizes,
        "scoring_protocol":"northern valid pixels excluding exact training known-fault pixels; heldout faults count as positives",
        "unscored_south":True,"train_buffer_pixels":TRAIN_BUFFER,
        "known_fault_exclusion_pixels":0,"scoring_corridor_pixels":SCORE_CORRIDOR,
        "fixed_radii_pixels":list(RADII),
        "postprocess_variants_for_preselected_1000m":"threshold 0.2,0.35,0.5; min component 1,2",
        "full_area_pooled_original_baseline":base,
        "full_area_pooled_incumbent_1000m":incumbent,
        "full_area_incumbent_minus_baseline":incumbent-base,
        "postprocess_exploratory_summaries":summary,
        "fold_ledger":ledger,
        "elapsed_seconds":time.monotonic()-started,
        "evaluation_target_is_hidden_new_faults":False,
        "independent_unseen_validation":False,
        "competition_score_known":False,"candidate_created":False,
        "submission_made":False,"auto_promote":False}
    (evidence/"full-area-proxy.json").write_text(json.dumps(report,indent=2)+"\n")
    return report

if __name__=="__main__":
    a=argparse.ArgumentParser()
    a.add_argument("--data-dir",required=True,type=Path)
    a.add_argument("--evidence-dir",required=True,type=Path)
    opts=a.parse_args()
    r=execute(opts.data_dir,opts.evidence_dir)
    print(json.dumps({"full_area_pooled_original_baseline":r["full_area_pooled_original_baseline"],
        "full_area_pooled_incumbent_1000m":r["full_area_pooled_incumbent_1000m"],
        "comparison_validates_hidden_faults":False,"submission_made":False},indent=2))
