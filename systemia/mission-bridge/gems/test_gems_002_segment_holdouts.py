import unittest
import tempfile
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
from scipy.ndimage import maximum_filter,distance_transform_edt
import gems_002_segment_holdouts as segment_worker
from gems_002_segment_holdouts import split_connected_faults,masks_for_fold

class ConnectedFaultHoldoutTests(unittest.TestCase):
    @staticmethod
    def fixture():
        valid=np.ones((130,160),bool)
        raw=np.zeros(valid.shape,np.int8)
        for row,col in [(5,10),(8,55),(20,90),(32,120),
                        (45,15),(55,65),(60,120),(70,30),(85,100)]:
            raw[row:row+16,col]=1
        raw[93:115,140]=1
        return raw,valid
    def test_deterministic_disjoint_whole_components(self):
        raw,valid=self.fixture()
        a=split_connected_faults(raw,valid,100)
        b=split_connected_faults(raw,valid,100)
        self.assertEqual(a[1],b[1])
        self.assertEqual(len(a[1]),3)
        self.assertEqual(len(set(sum(a[1],[]))),len(sum(a[1],[])))
        self.assertGreaterEqual(a[3]["excluded_crossing_south"],1)
    def test_whole_trace_and_buffer_excluded_from_fit(self):
        raw,valid=self.fixture()
        groups,splits,_,_=split_connected_faults(raw,valid,100)
        for split in splits:
            train,test,truth,meta=masks_for_fold(groups,split,valid,100,5,3)
            segment=np.isin(groups,split)
            self.assertFalse(np.any(segment&train))
            self.assertFalse(np.any(train&test))
            self.assertTrue(np.array_equal(segment,truth))
            self.assertFalse(np.any(truth[100:]))
            self.assertEqual(meta["heldout_positive_pixels"],int(segment.sum()))
    def test_nearby_unheldout_faults_not_treated_as_negatives(self):
        raw,valid=self.fixture()
        groups,splits,_,_=split_connected_faults(raw,valid,100)
        _,region,_,_=masks_for_fold(groups,splits[0],valid,100,5,3)
        other=(groups>0)&~np.isin(groups,splits[0])
        self.assertFalse(np.any(region&other))
    def test_end_to_end_synthetic_models_write_deterministic_evidence(self):
        raw,valid=self.fixture()
        rows,cols=np.indices(raw.shape)
        # Synthetic geophysical channels, not original DrivenData features.
        feats=np.column_stack([
            rows.ravel()/raw.shape[0],cols.ravel()/raw.shape[1],
            np.sin(cols.ravel()/10),np.cos(rows.ravel()/10),
        ]).astype("float32")
        class Raster:
            def __init__(self,contents):
                self.contents=contents
            def __enter__(self):return self
            def __exit__(self,*args):return False
            def read(self,index):return self.contents.copy()
        def raster_open(p):
            name=Path(p).name
            if name=="existing_faults.tif":return Raster(raw)
            if name=="example_submission.tif":return Raster(valid.astype("float32"))
            raise AssertionError("unexpected raster")
        def predict(model,matrix,subset,columns):
            return model.predict_proba(matrix[subset,:columns])[:,1].astype("float32")
        def render(prob,threshold,ridge):
            out=np.where(prob>=threshold,prob,0).astype("float32")
            if ridge:out*=prob>=maximum_filter(prob,size=3)*.94
            return out
        def score_setup(truth,valid):
            weight=np.maximum(0,1-distance_transform_edt(~truth)/3)
            return (1-weight)[valid].astype("float32")
        def dti(prob,truth,valid,weights):
            peaks=np.zeros_like(prob)
            for dr in range(-2,3):
                for dc in range(-2,3):
                    weight=1-np.hypot(dr,dc)/3
                    np.maximum(peaks,np.roll(prob,(dr,dc),(0,1))*weight,out=peaks)
            tp=peaks[truth].sum(dtype="float64")
            fp=np.dot(prob[valid].astype("float64"),weights)
            return float(tp/(tp+.2*fp+.8*(truth.sum()-tp)+1e-12))
        original=SimpleNamespace(features=lambda mask:feats,predict=predict,
            render=render,score_setup=score_setup,dti=dti)
        with tempfile.TemporaryDirectory() as root:
            base=Path(root)
            with patch.object(segment_worker,"verify_original_model_source",return_value="synthetic-source"), \
                 patch.object(segment_worker,"verify_inputs",return_value={"fixture":"synthetic"}), \
                 patch.object(segment_worker,"validate_organizer_grid",return_value={"fixture_grid":True}), \
                 patch.object(segment_worker.rasterio,"open",side_effect=raster_open), \
                 patch.dict(sys.modules,{"run":original}):
                first=segment_worker.execute(base,base/"run_a")
                second=segment_worker.execute(base,base/"run_b")
                self.assertEqual(len(first["fold_ledger"]),6)
                self.assertEqual(set(first["pooled_mapped_fault_proxy"]),{"0","10"})
                self.assertFalse(first["submission_made"])
                self.assertFalse(first["ground_truth_is_new_faults"])
                self.assertTrue((base/"run_a"/"gems-002-connected-segment-holdout.json").is_file())
                self.assertEqual(json.loads((base/"run_a"/"gems-002-connected-segment-holdout.json").read_text())["schema"],
                                 "evercraft.gems.connected-segment-holdout.v1")
                first.pop("elapsed_seconds");second.pop("elapsed_seconds")
                self.assertEqual(first,second)
                with self.assertRaises(FileExistsError):
                    segment_worker.execute(base,base/"run_a")

    def test_invalid_inputs_hold(self):
        raw,valid=self.fixture()
        with self.assertRaises(ValueError):split_connected_faults(raw,valid[:,:-1],100)
        with self.assertRaises(ValueError):split_connected_faults(raw,valid,0)
        with self.assertRaises(ValueError):split_connected_faults(raw,valid,100,min_trace=10000)
        groups,splits,_,_=split_connected_faults(raw,valid,100)
        with self.assertRaises(ValueError):masks_for_fold(groups,splits[0],valid,100,3,5)
if __name__=="__main__":unittest.main()
