"""End-to-end GEMS-004 vs GEMS-005 baseline parity on synthetic geology.

Runs both actual HGB pipelines and the exact receipt verifier, without any
organizer data, portal access, candidate GeoTIFF or scored submission.
"""
import hashlib
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
import gems_005_directional_ablation as directional
import gems_cross_experiment_gate as gate


class CrossPipelineIntegrationTests(unittest.TestCase):
    def test_real_synthetic_fits_yield_identical_baseline_samples_and_terms(self):
        shape=(130,160)
        raw=np.zeros(shape,dtype=np.int8)
        for row,col in [(5,10),(8,55),(20,90),(32,120),
                        (45,15),(55,65),(60,120),(70,30),(85,100)]:
            raw[row:row+16,col]=1
        raw[93:115,140]=1
        valid=np.ones(shape,bool)
        y,c=np.indices(shape)
        matrix=np.column_stack([
            np.sin((c.ravel()+2*j)/15)
            +.2*np.cos((y.ravel()+j)/12)+.03*j+.002*y.ravel()
            for j in range(34)]).astype("float32")
        extra=np.column_stack([
            np.sin(c.ravel()/11),np.cos(y.ravel()/9),
            np.sin((y.ravel()+c.ravel())/15),
            np.cos((y.ravel()-c.ravel())/11)]).astype("float32")

        class Raster:
            def __init__(self, arr):self.arr=arr
            def __enter__(self):return self
            def __exit__(self,*args):return False
            def read(self, band):return self.arr.copy()

        def open_raster(path):
            name=Path(path).name
            if name=="existing_faults.tif":return Raster(raw)
            if name=="example_submission.tif":return Raster(valid.astype("float32"))
            raise AssertionError("unexpected synthetic raster")

        def predict(model,features,subset,columns):
            return model.predict_proba(features[subset,:columns])[:,1].astype("float32")

        def render(prob,threshold,ridge):
            result=np.where(prob>=threshold,prob,0).astype("float32")
            if ridge:result*=prob>=maximum_filter(prob,size=3)*.94
            return result

        def score_setup(truth,region):
            weights=np.maximum(0,1-distance_transform_edt(~truth)/3)
            return (1-weights)[region].astype("float32")

        def dti(prob,truth,region,weights):
            peaks=np.zeros_like(prob)
            for dr in range(-2,3):
                for dc in range(-2,3):
                    weight=1-np.hypot(dr,dc)/3
                    np.maximum(peaks,np.roll(prob,(dr,dc),(0,1))*weight,out=peaks)
            tp=peaks[truth].sum(dtype="float64")
            fp=np.dot(prob[region].astype("float64"),weights)
            fn=truth.sum()-tp
            return float(tp/(tp+.2*fp+.8*fn+1e-12))

        reference=SimpleNamespace(features=lambda mask:matrix,
            predict=predict,render=render,score_setup=score_setup,dti=dti)
        inputs={"gems-geodawn-numerical-features.tif":{"sha256":"b"*64},
                "existing_faults.tif":{"sha256":"c"*64},
                "example_submission.tif":{"sha256":"d"*64}}
        grid={"crs":"EPSG:32611","width":3292,"height":3730,
              "feature_bands":19,"raster_alignment_verified":True,
              "feature_names_verified":True}
        model_sha="a"*64
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            with patch.object(hard,"verify_original_model_source",return_value=model_sha),\
                 patch.object(directional,"verify_original_model_source",return_value=model_sha),\
                 patch.object(hard,"verify_inputs",return_value=inputs),\
                 patch.object(directional,"verify_inputs",return_value=inputs),\
                 patch.object(hard,"validate_organizer_grid",return_value=grid),\
                 patch.object(directional,"validate_organizer_grid",return_value=grid),\
                 patch.object(hard.rasterio,"open",side_effect=open_raster),\
                 patch.object(directional.rasterio,"open",side_effect=open_raster),\
                 patch.object(directional,"make_directional_matrix",return_value=(
                      extra,[{"synthetic_test_only":True}]*4)),\
                 patch.dict(sys.modules,{"run":reference}):
                r4=hard.execute(root,root/"gems004")
                r5=directional.execute(root,root/"gems005")

            path4=root/"gems004/hard-negative-full-area.json"
            path5=root/"gems005/directional-full-area-ablation.json"
            expected4=json.loads(path4.read_text())
            expected5=json.loads(path5.read_text())
            self.assertEqual(r4,expected4)
            self.assertEqual(r5,expected5)
            checked=gate.verify(expected4,expected5,
                hashlib.sha256(path4.read_bytes()).hexdigest(),
                hashlib.sha256(path5.read_bytes()).hexdigest())
            self.assertTrue(checked["same_source_grid_folds_samples_and_baseline"])
            self.assertTrue(checked["all_three_folds_exact_ordered_training_pixels_sha256_matched"])
            self.assertEqual(checked["result"],"comparable_proxy_research_only")
            self.assertFalse(checked["independent_new_fault_confirmation"])
            self.assertFalse(checked["automatic_selection_or_submission_allowed"])


if __name__=="__main__":
    unittest.main()
