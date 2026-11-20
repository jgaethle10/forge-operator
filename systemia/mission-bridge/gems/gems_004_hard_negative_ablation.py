#!/usr/bin/env python3
"""GEMS-004: geographically isolated, hard-negative training ablation.

Use ONLY owner-authorized official GeoDAWN rasters. Compare unchanged GEMS-001
multiscale HGB baseline (0m/5 random negatives per known fault) against an
equal-sized 3-random + 2 pilot-mined negative training set in the SAME folds.
The pilot is fitted on training samples ONLY, never heldout fault pixels or
southern pixels. Mining excludes the 5P pilot negatives and requires >1000m
distance to TRAINING known faults to mitigate near-trace label uncertainty.

The mapped-fault DTI is a proxy, never DrivenData's hidden new-fault score.
No candidate GeoTIFF, scored submission, or automatic promotion.
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np
import rasterio
from sklearn.ensemble import HistGradientBoostingClassifier

from gems_002_negative_ablation import (
    SEED, sample_indices, train_only_distances, verify_inputs,
    validate_organizer_grid, verify_original_model_source, score_pooled_terms)
from gems_002_segment_holdouts import (
    split_connected_faults, masks_for_fold, TRAIN_BUFFER, SCORE_CORRIDOR, FOLDS)
from gems_002_full_area_validation import full_scoreable_masks, score_masked_proxy

NEGATIVES_PER_POSITIVE=5
RANDOM_PER_POSITIVE=3
HARD_PER_POSITIVE=2
HARD_MIN_DISTANCE_PIXELS=10
THRESHOLD=.20

def new_model():
    return HistGradientBoostingClassifier(max_iter=100,learning_rate=.10,
        max_leaf_nodes=23,early_stopping=False,random_state=SEED)

def select_hard_training_indices(labels,train,distances,pilot_indices,pilot_scores,
                                 candidate_indices,minimum_distance=HARD_MIN_DISTANCE_PIXELS):
    """Select 3P old random + 2P *fresh* hard negatives, with no validation leakage.

    pilot_scores correspond to candidate_indices in the SAME order. Ranking is
    deterministic: highest probability, then lowest flattened pixel index.
    """
    labels=np.asarray(labels,bool);train=np.asarray(train,bool)
    distances=np.asarray(distances,float)
    pilot_indices=np.asarray(pilot_indices,np.int64)
    candidate_indices=np.asarray(candidate_indices,np.int64)
    pilot_scores=np.asarray(pilot_scores,float)
    if (labels.ndim!=1 or train.shape!=labels.shape or distances.shape!=labels.shape
        or pilot_scores.shape!=candidate_indices.shape):
        raise ValueError("hard_negative_shapes_invalid")
    if len(np.unique(pilot_indices))!=len(pilot_indices) or len(np.unique(candidate_indices))!=len(candidate_indices):
        raise ValueError("duplicate_training_samples")
    if (not np.all(np.isfinite(distances)) or not np.all(np.isfinite(pilot_scores))
        or np.any(pilot_scores<0) or np.any(pilot_scores>1)):
        raise ValueError("hard_negative_scores_invalid")
    pos=np.flatnonzero(train&labels)
    p=int(pos.size)
    if not p or len(pilot_indices)<p*(NEGATIVES_PER_POSITIVE+1):
        raise ValueError("pilot_sample_count_invalid")
    if not np.array_equal(pilot_indices[:p],pos):
        raise ValueError("pilot_positives_invalid")
    pilot_negative=pilot_indices[p:]
    if (len(pilot_negative)!=NEGATIVES_PER_POSITIVE*p
        or np.any(~train[pilot_negative]) or np.any(labels[pilot_negative])
        or np.any(distances[pilot_negative]<=0)):
        raise ValueError("pilot_negative_population_invalid")
    if not len(candidate_indices) or np.any(candidate_indices<0) or np.any(candidate_indices>=len(labels)):
        raise ValueError("mining_indices_invalid")
    if (np.any(~train[candidate_indices]) or np.any(labels[candidate_indices])
        or np.any(distances[candidate_indices]<=minimum_distance)
        or np.intersect1d(pilot_indices,candidate_indices).size):
        raise ValueError("hard_negative_training_leakage")
    needed=HARD_PER_POSITIVE*p
    if candidate_indices.size<needed:
        raise ValueError("insufficient_fresh_hard_negatives")
    ranked=np.lexsort((candidate_indices,-pilot_scores))
    hard=candidate_indices[ranked[:needed]]
    random_kept=pilot_negative[:RANDOM_PER_POSITIVE*p]
    selected=np.concatenate((pos,random_kept,hard))
    if len(np.unique(selected))!=len(selected) or len(selected)!=p*(NEGATIVES_PER_POSITIVE+1):
        raise AssertionError("hard_negative_training_size_mismatch")
    return selected,{
        "positives":p,"pilot_random_negatives":int(pilot_negative.size),
        "final_random_negatives":int(random_kept.size),"final_mined_negatives":int(hard.size),
        "new_model_total_negatives":int(selected.size-p),
        "hard_min_known_fault_distance_pixels":minimum_distance,
        "hard_score_quantiles":np.quantile(pilot_scores[ranked[:needed]],
                                            [0,.25,.5,.75,1]).tolist(),
        "hard_distance_min":float(np.min(distances[hard])),
        "mined_index_sha256_unavailable":True}

def mining_indices(labels,train,distances,pilot_indices,min_dist=HARD_MIN_DISTANCE_PIXELS):
    """All mining candidates restricted to training region and not pilot samples."""
    allowed=train & ~labels & (distances>min_dist)
    allowed[np.asarray(pilot_indices,np.int64)]=False
    return np.flatnonzero(allowed)

def measure(original,model,matrix,north_flat,north,truth,full,corridor,known):
    prob=np.zeros(north.shape,np.float32)
    prob[north]=original.predict(model,matrix,north_flat,matrix.shape[1])
    pred=original.render(prob,THRESHOLD,True)
    # Keep a narrow southern padding margin for the proximity kernel.
    stop=min(north.shape[0],int(np.where(north)[0].max())+4)
    full_terms=score_masked_proxy(original,pred[:stop],truth[:stop],
        full[:stop],known[:stop])
    corridor_terms=score_masked_proxy(original,pred[:stop],truth[:stop],
        corridor[:stop],known[:stop])
    return {
      "full_terms":full_terms,"corridor_terms":corridor_terms,
      "full_dti":score_pooled_terms([full_terms]),
      "corridor_dti":score_pooled_terms([corridor_terms]),
      "northern_positive_predictions":int(((pred>0)&north).sum())
    }

def execute(data,evidence):
    data,evidence=Path(data),Path(evidence)
    if evidence.exists():raise FileExistsError("hard_negative_evidence_exists")
    source=verify_original_model_source(Path(__file__).with_name("run.py"))
    manifest=verify_inputs(data)
    grid=validate_organizer_grid(data)
    with rasterio.open(data/"existing_faults.tif") as f:raw=f.read(1)
    with rasterio.open(data/"example_submission.tif") as f:valid=np.isfinite(f.read(1))
    if not np.array_equal(valid,raw!=-1):
        raise ValueError("label_template_mask_mismatch")
    south=int(np.quantile(np.where(valid)[0],.75))
    components,splits,fold_counts,inventory=split_connected_faults(raw,valid,south)
    evidence.mkdir(parents=True,exist_ok=False)
    import run as original
    original.DATA=data;original.EVIDENCE=evidence
    matrix=original.features(valid)
    if matrix.shape[0]!=int(valid.sum()) or matrix.shape[1]!=34:
        raise ValueError("archived_feature_matrix_contract_invalid")
    labels=(raw[valid]==1)
    north=valid&(np.arange(valid.shape[0])[:,None]<south)
    north_flat=north[valid]
    ledger=[]
    started=time.monotonic()
    for fold,ids in enumerate(splits):
        train_map,corridor,_,_=masks_for_fold(
            components,ids,valid,south,TRAIN_BUFFER,SCORE_CORRIDOR)
        full,truth,known=full_scoreable_masks(components,ids,valid,south)
        train=train_map[valid]
        if np.any(train & ~north_flat):
            raise AssertionError("training_region_southern_leakage")
        distances=train_only_distances(raw,valid,train)
        pilot_indices,pilot_counts=sample_indices(labels,train,distances,0)
        pilot=new_model()
        pilot.fit(matrix[pilot_indices],labels[pilot_indices])
        baseline=measure(original,pilot,matrix,north_flat,north,truth,full,corridor,known)
        mine=mining_indices(labels,train,distances,pilot_indices)
        mine_mask=np.zeros(len(labels),bool)
        mine_mask[mine]=True
        mine_scores=original.predict(pilot,matrix,mine_mask,matrix.shape[1])
        candidate_indices,hard_receipt=select_hard_training_indices(
            labels,train,distances,pilot_indices,mine_scores,mine)
        del mine_scores, mine_mask, mine, pilot
        if np.any(~train[candidate_indices]):
            raise AssertionError("candidate_training_leakage")
        hard_model=new_model()
        hard_model.fit(matrix[candidate_indices],labels[candidate_indices])
        hardened=measure(original,hard_model,matrix,north_flat,north,
                         truth,full,corridor,known)
        ledger.append({"fold":fold,
            "heldout_connected_segments":len(ids),
            "heldout_mapped_fault_pixels":int(truth.sum()),
            "full_scoreable_pixels":int(full.sum()),
            "corridor_scoreable_pixels":int(corridor.sum()),
            "baseline_training":pilot_counts,
            "hard_negative_training":hard_receipt,
            "baseline":baseline,"hard_mined":hardened})
    def pooled(choice,region):
        terms=[row[choice][region+"_terms"] for row in ledger]
        return {"dti":score_pooled_terms(terms),
            "tp":sum(x["tp"] for x in terms),
            "fp":sum(x["fp"] for x in terms),
            "fn":sum(x["fn"] for x in terms)}
    full_base=pooled("baseline","full")
    full_hard=pooled("hard_mined","full")
    report={
      "schema":"evercraft.gems.hard-negative-full-area-ablation.v1",
      "source_sha256":source,"input_manifest":manifest,"grid":grid,
      "seed":SEED,"model":"Original GEMS-001 multiscale HGB 100/.10/23",
      "scoring":"Known mapped-fault DTI proxy over full northern scoreable area",
      "fold_design":"3 northern disjoint connected fault-component groups with 3km training buffer",
      "southern_region_excluded_from_train_and_scoring":True,
      "baseline_negative_scheme":"5 random eligible negatives per known mapped fault; 0m",
      "experimental_negative_scheme":"3 pilot random + 2 fresh mined training-only hard negatives per known fault, >1000m from train-known faults",
      "model_predicted_hard_negative_labels_are_unverified":True,
      "heldout_labels_never_mined":True,
      "threshold":THRESHOLD,"ridge":True,
      "full_area_baseline":full_base,"full_area_hard_negative":full_hard,
      "full_area_gain":full_hard["dti"]-full_base["dti"],
      "corridor_baseline":pooled("baseline","corridor"),
      "corridor_hard_negative":pooled("hard_mined","corridor"),
      "fold_ledger":ledger,
      "fold_counts":fold_counts,"segment_inventory":inventory,
      "execution_elapsed_seconds":time.monotonic()-started,
      "official_new_fault_dti":None,"scored_submission_made":False,
      "model_promotion_allowed":False,"candidate_tif_created":False}
    (evidence/"hard-negative-full-area.json").write_text(json.dumps(report,indent=2)+"\n")
    return report

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--data-dir",type=Path,required=True)
    p.add_argument("--evidence-dir",type=Path,required=True)
    args=p.parse_args()
    result=execute(args.data_dir,args.evidence_dir)
    print(json.dumps({"baseline":result["full_area_baseline"]["dti"],
        "hard_negative":result["full_area_hard_negative"]["dti"],
        "gain":result["full_area_gain"],
        "official_score_known":False,
        "submission_made":False},indent=2))
