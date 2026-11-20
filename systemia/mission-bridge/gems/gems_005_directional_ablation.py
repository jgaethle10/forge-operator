#!/usr/bin/env python3
"""GEMS-005: same-label, same-fold 34 vs 38 feature HGB comparison.
Uses SHA-pinned official GeoDAWN 19-band TIFF. No submission or promotion.
"""
import argparse,json,time
from pathlib import Path
import numpy as np,rasterio
from sklearn.ensemble import HistGradientBoostingClassifier
from gems_002_negative_ablation import (SEED,verify_inputs,validate_organizer_grid,
    verify_original_model_source,train_only_distances,sample_indices,score_pooled_terms)
from gems_002_segment_holdouts import (split_connected_faults,masks_for_fold,
    TRAIN_BUFFER,SCORE_CORRIDOR,FOLDS)
from gems_002_full_area_validation import full_scoreable_masks,score_masked_proxy
from gems_005_directional_features import make_directional_matrix

def fit_same_samples(original,augmented,labels,indices):
    def model():
        return HistGradientBoostingClassifier(max_iter=100,learning_rate=.10,
            max_leaf_nodes=23,early_stopping=False,random_state=SEED)
    return (model().fit(original[indices],labels[indices]),
            model().fit(augmented[indices],labels[indices]))

def measure(reference,model,matrix,north_flat,north,truth,full,corridor,known):
    prob=np.zeros(north.shape,'float32')
    prob[north]=reference.predict(model,matrix,north_flat,matrix.shape[1])
    rendered=reference.render(prob,.2,True)
    stop=int(np.where(north)[0].max())+1
    f=score_masked_proxy(reference,rendered[:stop],truth[:stop],full[:stop],known[:stop])
    c=score_masked_proxy(reference,rendered[:stop],truth[:stop],corridor[:stop],known[:stop])
    return {"full_terms":f,"corridor_terms":c,"full_dti":score_pooled_terms([f]),
      "corridor_dti":score_pooled_terms([c]),
      "selected_northern_pixels":int(((rendered>0)&north).sum())}

def execute(data,evidence):
    data=Path(data);evidence=Path(evidence)
    if evidence.exists():raise FileExistsError("gems005_output_exists")
    source=verify_original_model_source(Path(__file__).with_name("run.py"))
    official=verify_inputs(data)
    grid=validate_organizer_grid(data)
    with rasterio.open(data/"existing_faults.tif") as src:raw=src.read(1)
    with rasterio.open(data/"example_submission.tif") as src:valid=np.isfinite(src.read(1))
    if not np.array_equal(raw!=-1,valid):raise ValueError("raster_mask_disagreement")
    south=int(np.quantile(np.where(valid)[0],.75))
    components,splits,fold_counts,inventory=split_connected_faults(raw,valid,south)
    evidence.mkdir(parents=True,exist_ok=False)
    import run as reference
    reference.DATA=data;reference.EVIDENCE=evidence
    original=reference.features(valid)
    if original.shape!=(int(valid.sum()),34):raise ValueError("original_34_features_invalid")
    additional,feature_audit=make_directional_matrix(valid,
                         data/"gems-geodawn-numerical-features.tif")
    augmented=np.concatenate((original,additional),axis=1)
    if augmented.shape!=(int(valid.sum()),38):raise ValueError("augmented_38_features_invalid")
    del additional
    labels=raw[valid]==1
    north=valid&(np.arange(valid.shape[0])[:,None]<south)
    north_flat=north[valid]
    ledger=[];started=time.monotonic()
    for fold,ids in enumerate(splits):
        train_map,corridor,_,_=masks_for_fold(components,ids,valid,south,
                                              TRAIN_BUFFER,SCORE_CORRIDOR)
        full,truth,known=full_scoreable_masks(components,ids,valid,south)
        train=train_map[valid]
        if np.any(train&~north_flat):raise AssertionError("south_train_leakage")
        distances=train_only_distances(raw,valid,train)
        indices,counts=sample_indices(labels,train,distances,0)
        if np.any(~train[indices]) or not np.array_equal(augmented[indices,:34],original[indices]):
            raise AssertionError("train_samples_or_base_columns_changed")
        baseline_model,challenge_model=fit_same_samples(original,augmented,labels,indices)
        baseline=measure(reference,baseline_model,original,north_flat,north,truth,full,corridor,known)
        challenge=measure(reference,challenge_model,augmented,north_flat,north,truth,full,corridor,known)
        del baseline_model,challenge_model
        ledger.append({"fold":int(fold),"training":counts,
            "training_positive_count":int(labels[indices].sum()),
            "heldout_component_count":int(len(ids)),
            "heldout_fault_pixels":int(truth.sum()),
            "full_area_scoreable_pixels":int(full.sum()),
            "baseline_34":baseline,"directional_38":challenge})
    if len(ledger)!=FOLDS:raise AssertionError("fold_count_mismatch")
    def pool(variant,zone):
        terms=[v[variant][zone+"_terms"] for v in ledger]
        return {"dti":score_pooled_terms(terms),
            **{k:sum(t[k] for t in terms) for k in ("tp","fp","fn")}}
    base=pool("baseline_34","full");new=pool("directional_38","full")
    report={"schema":"evercraft.gems.directional-source-feature-ablation.v1",
      "official_raster_sha256":official,"original_source_sha256":source,
      "organizer_grid":grid,"model":"HGB max_iter=100 lr=.10 max_leaf_nodes=23 seed=306",
      "feature_definition":"magnetic/gravity masked structure tensor at 2 and 8 pixels",
      "original_feature_count":34,"augmented_feature_count":38,
      "source_bands":["rtp","iso_grav_anom"],"scales_pixels":[2,8],
      "additional_feature_audit":feature_audit,"selection_threshold":.2,
      "ridge":True,"negative_sampling_radius_pixels":0,
      "identical_training_samples_and_positive_labels":True,
      "geographic_validation":"3 northern withheld known-fault component folds; full northern known-fault-pixel-excluded region",
      "feature_transform_uses_only_unlabeled_geophysical_arrays":True,
      "full_area_original_34":base,"full_area_directional_38":new,
      "full_area_dti_difference":new["dti"]-base["dti"],
      "corridor_original_34":pool("baseline_34","corridor"),
      "corridor_directional_38":pool("directional_38","corridor"),
      "fold_ledger":ledger,"fold_counts":fold_counts,
      "segment_inventory":inventory,"elapsed_seconds":time.monotonic()-started,
      "no_independent_hidden_fault_labels":True,
      "not_independent_untouched_confirmation":True,
      "hidden_new_fault_score_known":False,"new_candidate_created":False,
      "automatic_promotion_allowed":False,"submission_made":False}
    (evidence/"directional-full-area-ablation.json").write_text(json.dumps(report,indent=2)+"\n")
    return report

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--data-dir",type=Path,required=True)
    p.add_argument("--evidence-dir",type=Path,required=True)
    a=p.parse_args();r=execute(a.data_dir,a.evidence_dir)
    print(json.dumps({"baseline_known_fault_proxy":r["full_area_original_34"]["dti"],
        "directional_known_fault_proxy":r["full_area_directional_38"]["dti"],
        "delta":r["full_area_dti_difference"],
        "official_score_measured":False,"submitted":False},indent=2))
