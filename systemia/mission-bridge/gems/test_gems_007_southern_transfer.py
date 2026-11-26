"""GEMS-007 frozen-south transfer audits against fabricated data only."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
from scipy.ndimage import distance_transform_edt, maximum_filter

import gems_007_southern_transfer as transfer
from gems_002_negative_ablation import sample_indices, train_only_distances
from gems_004_hard_negative_ablation import DISTANCE_BIN_EDGES
from gems_006_seed_replication import REPLICATION_SEED


class FrozenSouthernTransferTests(unittest.TestCase):
    def test_frozen_quota_hamilton_tie_break_and_rejections(self):
        counts=[1,1]+[0]*(len(DISTANCE_BIN_EDGES)-1)
        self.assertEqual(
            transfer.allocate_frozen_quotas(counts,3).tolist(),
            [2,1]+[0]*(len(DISTANCE_BIN_EDGES)-1))
        self.assertEqual(
            int(transfer.allocate_frozen_quotas(counts,21).sum()),21)
        with self.assertRaisesRegex(ValueError,"frozen_quota_inputs_invalid"):
            transfer.allocate_frozen_quotas([0]*11,5)
        with self.assertRaisesRegex(ValueError,"frozen_quota_inputs_invalid"):
            transfer.allocate_frozen_quotas(counts,0)

    def test_south_and_connected_fault_embargo(self):
        shape=(130,160)
        raw=np.zeros(shape,dtype=np.int8)
        for y,x in [(5,10),(8,55),(20,90),(32,120),
                    (45,15),(55,65),(60,120),(70,30),(85,100)]:
            raw[y:y+16,x]=1
        raw[93:115,140]=1
        valid=np.ones(shape,bool)
        train,south,truth,corridor,known,g=transfer.build_southern_masks(raw,valid)
        self.assertTrue(g["southern_mapped_fault_pixels"]>0)
        self.assertTrue(g["full_connected_component_southern_embargo"])
        self.assertFalse(np.any(train & south))
        self.assertFalse(np.any(train & truth))
        self.assertFalse(np.any(known & south))
        self.assertTrue(np.all(truth<=corridor))
        # Even the northern tail of a fault that crosses south is excluded
        # and a spatial moat around it is omitted from training.
        self.assertFalse(np.any(train[85:96,100]))
        self.assertFalse(np.any(train[85:96,140]))

    def test_stratified_control_is_seeded_and_no_pilot_overlap(self):
        labels=np.zeros(160,bool);labels[[1,7]]=True
        train=np.ones(160,bool);train[150:]=False
        distance=np.full(160,18.0)
        pilot=np.array([1,7,*range(10,20)],dtype=np.int64)
        quota=np.zeros(len(DISTANCE_BIN_EDGES)+1,np.int64)
        quota[1]=4
        a,receipt=transfer.fresh_control_indices(
            labels,train,distance,pilot,quota,306)
        b,repeat=transfer.fresh_control_indices(
            labels,train,distance,pilot,quota,306)
        self.assertTrue(np.array_equal(a,b))
        self.assertEqual(receipt,repeat)
        self.assertEqual(len(a),12)
        self.assertTrue(np.array_equal(a[:8],[1,7,10,11,12,13,14,15]))
        self.assertEqual(len(np.unique(a)),12)
        self.assertEqual(receipt["quota_counts"][1],4)
        bad=quota.copy();bad[4]=1
        with self.assertRaisesRegex(ValueError,"southern_quota_total_invalid"):
            transfer.fresh_control_indices(labels,train,distance,pilot,bad,306)

    def test_end_to_end_two_seeds_synthetic_southern_scoring(self):
        shape=(130,160)
        raw=np.zeros(shape,dtype=np.int8)
        for y,x in [(5,10),(8,55),(20,90),(32,120),
                    (45,15),(55,65),(60,120),(70,30),(85,100)]:
            raw[y:y+16,x]=1
        raw[93:115,140]=1
        valid=np.ones(shape,bool)
        yy,xx=np.indices(shape)
        matrix=np.column_stack([
            np.sin((xx.ravel()+2*j)/15)+.2*np.cos((yy.ravel()+j)/12)
            +.03*j+.002*yy.ravel() for j in range(34)
        ]).astype("float32")
        train_map,south,*_=transfer.build_southern_masks(raw,valid)
        train=train_map[valid]
        labels=raw[valid]==1
        d=train_only_distances(raw,valid,train)
        p=int((labels&train).sum())
        self.assertGreater(p,0)
        # Pick frozen synthetic train-only bin counts with capacity on both
        # seed draws. This is fabricated data, not the official input.
        avail=[]
        for seed in (306,REPLICATION_SEED):
            pilot,_=sample_indices(labels,train,d,0,seed=seed)
            eligible=transfer.mining_indices(labels,train,d,pilot)
            hist=np.bincount(np.searchsorted(
                np.asarray(DISTANCE_BIN_EDGES),d[eligible],side="right"),
                minlength=len(DISTANCE_BIN_EDGES)+1)
            avail.append(hist)
        capacity=np.minimum(*avail)
        self.assertGreaterEqual(capacity.sum(),2*p)
        # Capacity-proportional quota allocation must fit both seed pools.
        # Allocate from high-capacity bins until all 2P are assigned.
        quota=np.zeros_like(capacity)
        to_pick=2*p
        for bin_id in np.argsort(-capacity,kind="stable"):
            count=min(int(capacity[bin_id]),to_pick)
            quota[bin_id]=count
            to_pick-=count
            if to_pick==0:break
        self.assertEqual(int(quota.sum()),2*p)
        source={"source_sha256":"a"*64,
                "input_manifest":{"synthetic":True},
                "grid":{"synthetic":True}}
        freeze={"north_quota_counts":quota.tolist(),
                "north_quota_total":int(quota.sum()),
                "gems004_report_sha256":"b"*64,
                "gems006_report_sha256":"c"*64}

        class Raster:
            def __init__(self, arr):self.arr=arr
            def __enter__(self):return self
            def __exit__(self,*unused):return False
            def read(self, band):return self.arr.copy()
        def fake_open(path):
            name=Path(path).name
            if name=="existing_faults.tif":return Raster(raw)
            if name=="example_submission.tif":return Raster(valid.astype("float32"))
            raise AssertionError("unplanned_raster_read")
        def predict(model,mat,subset,ncols):
            return model.predict_proba(mat[subset,:ncols])[:,1].astype("float32")
        def render(prob,threshold,ridge):
            selected=np.where(prob>=threshold,prob,0).astype("float32")
            if ridge:selected*=prob>=maximum_filter(prob,size=3)*.94
            return selected
        def score_setup(truth,region):
            weights=np.maximum(0,1-distance_transform_edt(~truth)/3)
            return (1-weights)[region].astype("float32")
        def dti(prob,truth,region,weights):
            peaks=np.zeros_like(prob)
            for dr in range(-2,3):
                for dc in range(-2,3):
                    w=1-np.hypot(dr,dc)/3
                    np.maximum(peaks,np.roll(prob,(dr,dc),(0,1))*w,out=peaks)
            tp=peaks[truth].sum(dtype="float64")
            fp=np.dot(prob[region].astype("float64"),weights)
            fn=truth.sum()-tp
            return float(tp/(tp+.2*fp+.8*fn+1e-12))
        reference=SimpleNamespace(features=lambda mask:matrix,
            predict=predict,render=render,score_setup=score_setup,dti=dti)
        with tempfile.TemporaryDirectory() as work:
            home=Path(work)
            with patch.object(transfer,"load_frozen_preregistration",
                              return_value=(source,freeze)),\
                 patch.object(transfer,"verify_original_model_source",
                              return_value="a"*64),\
                 patch.object(transfer,"verify_inputs",
                              return_value={"synthetic":True}),\
                 patch.object(transfer,"validate_organizer_grid",
                              return_value={"synthetic":True}),\
                 patch.object(transfer.rasterio,"open",side_effect=fake_open),\
                 patch.dict(sys.modules,{"run":reference}):
                result=transfer.execute(home,home/"004",home/"006",home/"south")
                self.assertEqual(result["schema"],transfer.SCHEMA)
                self.assertEqual(len(result["seed_runs"]),2)
                self.assertTrue(result["southern_previously_evaluated_in_gems002"])
                self.assertFalse(result["independent_geographic_holdout"])
                self.assertFalse(result["scored_submission_made"])
                self.assertFalse(result["automatic_selection_allowed"])
                self.assertTrue((home/"south/southern-transfer-stress.json").exists())
                for row in result["seed_runs"]:
                    b=row["metrics"]["full_area_baseline"]
                    m=row["metrics"]["full_area_distance_matched_random_control"]
                    held=result["geography"]["southern_mapped_fault_pixels"]
                    self.assertAlmostEqual(b["tp"]+b["fn"],held,places=5)
                    self.assertAlmostEqual(m["tp"]+m["fn"],held,places=5)
                self.assertNotEqual(
                    result["seed_runs"][0]["baseline_indices_sha256"],
                    result["seed_runs"][1]["baseline_indices_sha256"])
                with self.assertRaisesRegex(ValueError,
                                            "southern_evidence_output_must_be_new"):
                    transfer.execute(home,home/"004",home/"006",home/"south")


if __name__=="__main__":
    unittest.main()
