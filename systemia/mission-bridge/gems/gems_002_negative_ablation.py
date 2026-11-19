#!/usr/bin/env python3
"""GEMS-002 private negative-buffer ablation. Never submits a prediction.
Requires the preserved GEMS-001 run.py and three ORIGINAL organizer rasters.
Holdout labels do not influence training negative exclusions.
"""
import argparse
import hashlib
import json
import time
from pathlib import Path
import numpy as np
import rasterio
from scipy.ndimage import distance_transform_edt
from sklearn.ensemble import HistGradientBoostingClassifier

EXPECTED = {
"example_submission.tif":"2176d08e485aa2cd2860ce8df539db4faf4d76163b38a4dd8c30a40454d35cbc",
"existing_faults.tif":"7ba308ccdc4418b31a178f4f1ef21aaa6e152e4028f2f6f64b01f7eb25ae4093",
"gems-geodawn-numerical-features.tif":"4371c82e3b8339b807bdffcf4ef59a225520fe2988d521be208ae33743123bc5"}
ARCHIVED_GEMS_001_RUN_SHA256="db07aef8eb3edaa78efdc704d867cc8c2cf12ae1c8d17152fd0280238c92ca8b"
RADII=(0,3,10)
SEED=306
def verify_inputs(data):
    audit={}
    for name,expected in EXPECTED.items():
        file=data/name
        if not file.is_file() or file.is_symlink():raise ValueError("missing_unsafe_file:"+name)
        h=hashlib.sha256()
        with file.open("rb") as f:
            for chunk in iter(lambda:f.read(1048576),b""):h.update(chunk)
        if h.hexdigest()!=expected:raise ValueError("organizer_sha256_mismatch:"+name)
        audit[name]={"sha256":expected,"bytes":file.stat().st_size}
    return audit

def train_only_distances(raw,valid,train):
    if raw.shape!=valid.shape or train.shape!=(int(valid.sum()),):
        raise ValueError("train_geometry_invalid")
    known=np.zeros(raw.shape,bool)
    known[valid]=(raw[valid]==1)&train
    if not known.any():raise ValueError("no_train_positives")
    return distance_transform_edt(~known)[valid].astype("float32")

def sample_indices(labels,train,distances,radius,seed=SEED):
    labels=np.asarray(labels,bool);train=np.asarray(train,bool);distances=np.asarray(distances,float)
    if labels.ndim!=1 or train.shape!=labels.shape or distances.shape!=labels.shape:
        raise ValueError("sampling_shapes_invalid")
    if radius not in RADII:raise ValueError("radius_not_predeclared")
    if not np.all(np.isfinite(distances)):raise ValueError("distance_invalid")
    positive=np.flatnonzero(train&labels)
    negative=np.flatnonzero(train&~labels&(distances>radius))
    if not len(positive) or not len(negative):raise ValueError("sampling_pool_empty")
    rng=np.random.default_rng(seed)
    sampled=rng.choice(negative,min(len(negative),5*len(positive)),replace=False)
    return np.concatenate([positive,sampled]),{
      "positive_count":len(positive),"eligible_negative_count":len(negative),
      "sampled_negative_count":len(sampled),"buffer_pixels":radius}

def geographic_folds(valid,buffer_pixels=100):
    """Three northern development folds, one never-trained southern test."""
    rows=np.where(valid)[0]
    if not len(rows):raise ValueError("empty_valid_mask")
    southern_start=int(np.quantile(rows,.75))
    north=rows[rows<southern_start]
    if not len(north):raise ValueError("empty_development_region")
    cuts=np.quantile(north,[0,1/3,2/3,1]).astype(int)
    folds=[]
    for fold,(start,stop) in enumerate(zip(cuts,cuts[1:])):
        lo=int(start);hi=int(stop)+(fold==2)
        test=(rows>=lo)&(rows<hi)
        train=(rows<southern_start)&((rows<lo-buffer_pixels)|(rows>=hi+buffer_pixels))
        if not train.any() or not test.any():raise ValueError("empty_tuning_fold")
        if np.any(train&(rows>=southern_start)):raise AssertionError("southern_training_leak")
        folds.append((lo,hi,train,test))
    train=(rows<southern_start-buffer_pixels)
    test=(rows>=southern_start)
    if not train.any() or not test.any():raise ValueError("empty_southern_fold")
    folds.append((southern_start,int(rows.max())+1,train,test))
    return folds,southern_start

def verify_original_model_source(file):
    """Refuse any model implementation other than the preserved GEMS-001 run.py."""
    file=Path(file)
    if not file.is_file() or file.is_symlink():
        raise ValueError("original_model_source_missing_or_unsafe")
    digest=hashlib.sha256(file.read_bytes()).hexdigest()
    if digest!=ARCHIVED_GEMS_001_RUN_SHA256:
        raise ValueError("original_model_source_sha256_mismatch")
    return digest

def main():
    # Imported model is only trusted after its bytes match the archived source.
    verify_original_model_source(Path(__file__).with_name("run.py"))
    import run as original
    arg=argparse.ArgumentParser()
    arg.add_argument("--data-dir",type=Path,required=True)
    arg.add_argument("--evidence-dir",type=Path,required=True)
    opts=arg.parse_args()
    started=time.monotonic()
    manifest=verify_inputs(opts.data_dir)
    opts.evidence_dir.mkdir(parents=True,exist_ok=True)
    original.DATA=opts.data_dir
    original.EVIDENCE=opts.evidence_dir
    with rasterio.open(opts.data_dir/"existing_faults.tif") as f:raw=f.read(1)
    with rasterio.open(opts.data_dir/"example_submission.tif") as f:valid=np.isfinite(f.read(1))
    if not np.array_equal(valid,raw!=-1):raise ValueError("label_template_mask_mismatch")
    matrix=original.features(valid)
    labels=raw[valid]==1
    rows=np.where(valid)[0]
    folds,southern_start=geographic_folds(valid)
    ledger=[]
    for fold,(lo,hi,train,test) in enumerate(folds[:3]):
        # Only training-known fault pixels contribute to buffer distances.
        distances=train_only_distances(raw,valid,train)
        region=valid[lo:hi];truth=raw[lo:hi]==1
        test_indices=np.flatnonzero(test)
        if len(test_indices)!=int(region.sum()):raise ValueError("test_geometry_invalid")
        for radius in RADII:
            indices,counts=sample_indices(labels,train,distances,radius)
            model=HistGradientBoostingClassifier(max_iter=100,learning_rate=.10,
                 max_leaf_nodes=23,early_stopping=False,random_state=SEED)
            model.fit(matrix[indices],labels[indices])
            prob=np.zeros(region.shape,np.float32)
            prob[region]=original.predict(model,matrix,test,matrix.shape[1])
            pred=original.render(prob,.20,True)
            score=original.dti(np.pad(pred,3),np.pad(truth,3),
                 np.pad(region,3),original.score_setup(truth,region))
            ledger.append({"fold":fold,"rows":[lo,hi],"radius_pixels":radius,
             "proxy_dti":float(score),"training_positives":int(counts["positive_count"]),
             "sampled_negatives":int(counts["sampled_negative_count"])})
    tune={str(r):float(np.mean([x["proxy_dti"] for x in ledger
           if x["fold"]<3 and x["radius_pixels"]==r])) for r in RADII}
    selected=max(RADII,key=lambda r:tune[str(r)])
    # Candidate is frozen before scoring the southern holdout.
    lo,hi,train,test=folds[3]
    distances=train_only_distances(raw,valid,train)
    region=valid[lo:hi];truth=raw[lo:hi]==1
    if int(test.sum())!=int(region.sum()):raise ValueError("holdout_geometry_invalid")
    holdout={}
    for radius in (0,selected) if selected!=0 else (0,):
        indices,counts=sample_indices(labels,train,distances,radius)
        model=HistGradientBoostingClassifier(max_iter=100,learning_rate=.10,
             max_leaf_nodes=23,early_stopping=False,random_state=SEED)
        model.fit(matrix[indices],labels[indices])
        prob=np.zeros(region.shape,np.float32)
        prob[region]=original.predict(model,matrix,test,matrix.shape[1])
        pred=original.render(prob,.20,True)
        score=original.dti(np.pad(pred,3),np.pad(truth,3),
             np.pad(region,3),original.score_setup(truth,region))
        holdout[str(radius)]=float(score)
        ledger.append({"fold":3,"phase":"locked_southern_test","rows":[lo,hi],
          "radius_pixels":radius,"proxy_dti":float(score),
          "training_positives":int(counts["positive_count"]),
          "sampled_negatives":int(counts["sampled_negative_count"])})
    report={"schema":"evercraft.gems.negative-ablation.v2",
      "official_input_sha256_verified":True,"input_manifest":manifest,
      "experiment":"GEMS-001 multiscale HGB; fixed .20 cutoff with ridge thinning",
      "radii_pixels":list(RADII),"seed":SEED,"negative_ratio":5,
      "selection_folds":[0,1,2],"locked_final_fold":3,
      "southern_start_row":southern_start,"southern_used_in_tuning_training":False,
      "tuning_proxy_dti":tune,"selected_by_tuning_only":selected,
      "heldout_proxy_dti_baseline_and_selected_only":holdout,
      "holdout_delta_vs_baseline":holdout[str(selected)]-holdout["0"],
      "fold_ledger":ledger,"elapsed_seconds":time.monotonic()-started,
      "official_dti_computed":False,"submission_created":False,
      "private_saban_executed":False,"auto_promotion_allowed":False}
    dest=opts.evidence_dir/"gems-002-negative-buffer-ablation.json"
    dest.write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps({"evidence":str(dest),"selected_radius_pixels":selected,
      "holdout_proxy_dti":holdout,"submission_created":False}))
if __name__=="__main__":main()
