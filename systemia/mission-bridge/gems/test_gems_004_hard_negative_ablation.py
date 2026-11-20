import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
from scipy.ndimage import distance_transform_edt, maximum_filter
import gems_004_hard_negative_ablation as hard


class HardNegativeTests(unittest.TestCase):
    def test_fixed_sample_size_and_highest_fresh_negatives_only(self):
        labels=np.zeros(35,bool);labels[[1,7]]=True
        train=np.ones(35,bool)
        distances=np.full(35,15.,dtype=float)
        pilot=np.array([1,7,*range(10,20)],dtype=np.int64)
        options=np.array([20,21,22,23,24,25],dtype=np.int64)
        scores=np.array([.1,.9,.4,.7,.5,.8],dtype=float)
        final,receipt=hard.select_hard_training_indices(
            labels,train,distances,pilot,scores,options)
        self.assertEqual(final.tolist(),[1,7,10,11,12,13,14,15,21,25,23,24])
        self.assertEqual(receipt["final_random_negatives"],6)
        self.assertEqual(receipt["final_mined_negatives"],4)
        self.assertEqual(receipt["new_model_total_negatives"],10)
        self.assertEqual(len(np.unique(final)),12)

    def test_train_mask_blocks_test_south_and_old_pilot_negatives(self):
        labels=np.zeros(40,bool);labels[[1,7]]=True
        train=np.ones(40,bool);train[28:]=False
        distances=np.full(40,15.,dtype=float);distances[25]=10.
        pilot=np.array([1,7,*range(10,20)])
        options=hard.mining_indices(labels,train,distances,pilot)
        self.assertFalse(np.any(options>=28))
        self.assertFalse(np.any(options==25))
        self.assertEqual(np.intersect1d(options,pilot).size,0)
        with self.assertRaisesRegex(ValueError,"hard_negative_training_leakage"):
            hard.select_hard_training_indices(labels,train,distances,pilot,
                np.ones(5),np.array([21,22,23,24,30]))
        with self.assertRaisesRegex(ValueError,"hard_negative_training_leakage"):
            hard.select_hard_training_indices(labels,train,distances,pilot,
                np.ones(5),np.array([11,22,23,24,26]))

    def test_distance_matched_control_same_population_and_reproducible(self):
        labels=np.zeros(65,bool);labels[[1,7]]=True
        train=np.ones(65,bool)
        train[55:]=False
        distances=np.full(65,15.,dtype=float)
        distances[40]=7.
        pilot=np.array([1,7,*range(10,20)],dtype=np.int64)
        mine=hard.mining_indices(labels,train,distances,pilot)
        a,receipt=hard.select_distance_matched_random_indices(
            labels,train,distances,pilot,mine,fold=1)
        b,_=hard.select_distance_matched_random_indices(
            labels,train,distances,pilot,mine,fold=1)
        self.assertTrue(np.array_equal(a,b))
        self.assertEqual(a[:8].tolist(),[1,7,10,11,12,13,14,15])
        self.assertEqual(len(a),12)
        self.assertEqual(receipt["final_fresh_distance_matched_random_negatives"],4)
        self.assertFalse(any(index>=55 for index in a))
        self.assertFalse(any(index==40 for index in a))
        self.assertEqual(len(np.unique(a)),12)
        self.assertEqual(len(receipt["fresh_flat_indices_sha256"]),64)

    def test_distance_matched_control_rejects_validation_leakage(self):
        labels=np.zeros(40,bool);labels[[1,7]]=True
        train=np.ones(40,bool);train[28:]=False
        distances=np.full(40,15.)
        pilot=np.array([1,7,*range(10,20)])
        for forbidden in (np.array([20,21,22,30]),np.array([11,21,22,23])):
            with self.assertRaisesRegex(ValueError,"distance_control_training_leakage"):
                hard.select_distance_matched_random_indices(
                    labels,train,distances,pilot,forbidden,fold=0)

    def test_fails_closed_when_mining_insufficient_or_probabilities_invalid(self):
        labels=np.zeros(40,bool);labels[[1,7]]=True
        train=np.ones(40,bool);distances=np.full(40,15.)
        pilot=np.array([1,7,*range(10,20)])
        with self.assertRaisesRegex(ValueError,"insufficient_fresh_hard_negatives"):
            hard.select_hard_training_indices(labels,train,distances,pilot,
                np.array([.5,.9,.2]),np.array([21,22,23]))
        with self.assertRaisesRegex(ValueError,"hard_negative_scores_invalid"):
            hard.select_hard_training_indices(labels,train,distances,pilot,
                np.array([.5,np.nan,.1,.2,.3]),np.array([21,22,23,24,25]))

    def test_full_training_synthetic_replay_and_full_area_proxy(self):
        shape=(130,160)
        raw=np.zeros(shape,np.int8)
        for row,col in [(5,10),(8,55),(20,90),(32,120),
                        (45,15),(55,65),(60,120),(70,30),(85,100)]:
            raw[row:row+16,col]=1
        raw[93:115,140]=1
        valid=np.ones(shape,bool)
        y,x=np.indices(shape)
        matrix=np.column_stack([
            np.sin((x.ravel()+2*j)/15)+.2*np.cos((y.ravel()+j)/12)
            + .03*j + .002*y.ravel() for j in range(34)
        ]).astype("float32")
        class Raster:
            def __init__(self,arr):self.arr=arr
            def __enter__(self):return self
            def __exit__(self,*args):return False
            def read(self,index):return self.arr.copy()
        def open_raster(path):
            name=Path(path).name
            if name=="existing_faults.tif":return Raster(raw)
            if name=="example_submission.tif":return Raster(valid.astype("float32"))
            raise AssertionError("unexpected source")
        def predict(model,matrix,subset,columns):
            return model.predict_proba(matrix[subset,:columns])[:,1].astype("float32")
        def render(prob,threshold,ridge):
            result=np.where(prob>=threshold,prob,0).astype("float32")
            if ridge:result*=prob>=maximum_filter(prob,size=3)*.94
            return result
        def score_setup(truth,valid):
            weights=np.maximum(0,1-distance_transform_edt(~truth)/3)
            return (1-weights)[valid].astype("float32")
        def dti(prob,truth,valid,weights):
            peaks=np.zeros_like(prob)
            for dr in range(-2,3):
                for dc in range(-2,3):
                    weight=1-np.hypot(dr,dc)/3
                    np.maximum(peaks,np.roll(prob,(dr,dc),(0,1))*weight,out=peaks)
            tp=peaks[truth].sum(dtype="float64")
            fp=np.dot(prob[valid].astype("float64"),weights)
            fn=truth.sum()-tp
            return float(tp/(tp+.2*fp+.8*fn+1e-12))
        reference=SimpleNamespace(features=lambda mask:matrix,
            predict=predict,render=render,score_setup=score_setup,dti=dti)
        with tempfile.TemporaryDirectory() as dirname:
            base=Path(dirname)
            with patch.object(hard,"verify_original_model_source",return_value="synthetic-model"),\
                 patch.object(hard,"verify_inputs",return_value={"synthetic":True}),\
                 patch.object(hard,"validate_organizer_grid",return_value={"synthetic":True}),\
                 patch.object(hard.rasterio,"open",side_effect=open_raster),\
                 patch.dict(sys.modules,{"run":reference}):
                a=hard.execute(base,base/"first")
                b=hard.execute(base,base/"second")
                self.assertEqual(len(a["fold_ledger"]),3)
                self.assertTrue(all(r["hard_negative_training"]["final_mined_negatives"]>0
                    for r in a["fold_ledger"]))
                self.assertTrue(all(r["distance_matched_control_training"][
                    "final_fresh_distance_matched_random_negatives"]>0
                    for r in a["fold_ledger"]))
                self.assertIn("full_area_distance_matched_random_control",a)
                self.assertIn("hard_mining_gain_over_distance_control",a)
                self.assertTrue(all("distance_matched_random" in r for r in a["fold_ledger"]))
                self.assertTrue(all(
                    r["distance_matched_control_training"]["positives"]==
                    r["hard_negative_training"]["positives"]
                    for r in a["fold_ledger"]))
                self.assertTrue(all(r["full_scoreable_pixels"]>r["corridor_scoreable_pixels"]
                    for r in a["fold_ledger"]))
                self.assertFalse(a["scored_submission_made"])
                self.assertFalse(a["model_promotion_allowed"])
                self.assertTrue((base/"first"/"hard-negative-full-area.json").is_file())
                with self.assertRaises(FileExistsError):
                    hard.execute(base,base/"first")
                a.pop("execution_elapsed_seconds")
                b.pop("execution_elapsed_seconds")
                self.assertEqual(a,b)


if __name__=="__main__":
    unittest.main()
