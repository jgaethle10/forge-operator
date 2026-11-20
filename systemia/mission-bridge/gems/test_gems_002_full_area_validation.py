import json,sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
from scipy.ndimage import distance_transform_edt,maximum_filter
import gems_002_full_area_validation as full

class FullScoreableAreaTests(unittest.TestCase):
    def fixture(self):
        valid=np.ones((130,160),bool)
        raw=np.zeros(valid.shape,np.int8)
        for row,col in [(5,10),(8,55),(20,90),(32,120),(45,15),
                        (55,65),(60,120),(70,30),(85,100)]:
            raw[row:row+16,col]=1
        raw[93:115,140]=1  # component crossing the southern cutoff
        return raw,valid

    def test_pixel_exact_known_fault_mask_and_full_background(self):
        raw,valid=self.fixture()
        from gems_002_segment_holdouts import split_connected_faults,masks_for_fold
        labels,splits,_,_=split_connected_faults(raw,valid,100)
        held=np.isin(labels,splits[0])
        area,truth,known=full.full_scoreable_masks(labels,splits[0],valid,100)
        _,corridor,_,_=masks_for_fold(labels,splits[0],valid,100,5,3)
        self.assertTrue(np.array_equal(truth,held))
        self.assertTrue(np.any(area&~corridor))
        self.assertTrue(np.array_equal(known,(labels>0)&~held))
        self.assertFalse(np.any(area&known))
        self.assertFalse(np.any(area[100:]))
        self.assertTrue(np.all(area[0,0:5])) # full background retained

    def test_component_pruning_is_explicit_and_reproducible(self):
        a=np.zeros((12,12),np.float32)
        a[1,1]=.4;a[5,5:8]=.8
        self.assertTrue(np.array_equal(full.prune_small_components(a,1),a))
        b=full.prune_small_components(a,2)
        self.assertEqual(float(b[1,1]),0.)
        self.assertAlmostEqual(float(b[5,6]),.8,places=6)
        with self.assertRaises(ValueError):full.prune_small_components(a,0)

    def test_known_predictions_contribute_neither_fp_nor_tp(self):
        pred=np.zeros((16,16),np.float32)
        pred[6,6]=1.
        truth=np.zeros((16,16),bool);truth[6,7]=True
        known=np.zeros((16,16),bool);known[6,6]=True
        region=np.ones((16,16),bool);region[known]=False
        class Reference:
            @staticmethod
            def score_setup(truth,valid):
                weights=np.maximum(0,1-distance_transform_edt(~truth)/3)
                return (1-weights)[valid].astype("float32")
            @staticmethod
            def dti(prob,truth,valid,weights):
                peaks=np.zeros_like(prob)
                for dr in range(-2,3):
                    for dc in range(-2,3):
                        factor=1-np.hypot(dr,dc)/3
                        np.maximum(peaks,np.roll(prob,(dr,dc),(0,1))*factor,out=peaks)
                tp=peaks[truth].sum(dtype="float64")
                fp=np.dot(prob[valid].astype("float64"),weights)
                return float(tp/(tp+.2*fp+.8*(truth.sum()-tp)+1e-12))
        r=full.score_masked_proxy(Reference,pred,truth,region,known)
        self.assertEqual(r["tp"],0.)
        self.assertEqual(r["fp"],0.)
        self.assertEqual(r["fn"],1.)

    def test_full_synthetic_rehearsal_both_radii_and_scoring_zones(self):
        raw,valid=self.fixture()
        rows,cols=np.indices(raw.shape)
        matrix=np.column_stack([rows.ravel()/130,cols.ravel()/160,
            np.sin(cols.ravel()/11),np.cos(rows.ravel()/13)]).astype("float32")
        class FakeRaster:
            def __init__(self,arr):self.arr=arr
            def __enter__(self):return self
            def __exit__(self,*args):return False
            def read(self,i):return self.arr.copy()
        def opener(p):
            if Path(p).name=="existing_faults.tif":return FakeRaster(raw)
            if Path(p).name=="example_submission.tif":return FakeRaster(valid.astype("float32"))
            raise AssertionError("unexpected synthetic raster")
        class FastModel:
            def __init__(self,**kwargs):pass
            def fit(self,x,y):return self
            def predict_proba(self,x):
                p=np.clip(.16+.3*x[:,0]+.22*x[:,1],.01,.95)
                return np.column_stack([1-p,p])
        def predict(model,matrix,subset,columns):
            return model.predict_proba(matrix[subset,:columns])[:,1].astype("float32")
        def render(prob,t,ridge):
            pred=np.where(prob>=t,prob,0).astype("float32")
            if ridge:pred*=prob>=maximum_filter(prob,size=3)*.94
            return pred
        original=SimpleNamespace(
            features=lambda valid:matrix,predict=predict,render=render,
            score_setup=lambda truth,valid:
                (1-np.maximum(0,1-distance_transform_edt(~truth)/3))[valid].astype("float32"))
        def dti(prob,truth,valid,weights):
            peaks=np.zeros_like(prob)
            for dr in range(-2,3):
                for dc in range(-2,3):
                    w=1-np.hypot(dr,dc)/3
                    np.maximum(peaks,np.roll(prob,(dr,dc),(0,1))*w,out=peaks)
            tp=peaks[truth].sum(dtype="float64")
            fp=np.dot(prob[valid].astype("float64"),weights)
            return float(tp/(tp+.2*fp+.8*(truth.sum()-tp)+1e-12))
        original.dti=dti
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp)
            with patch.object(full,"verify_original_model_source",return_value="synthetic"),\
                 patch.object(full,"verify_inputs",return_value={"fixture":"synthetic"}),\
                 patch.object(full,"validate_organizer_grid",return_value={"synthetic":True}),\
                 patch.object(full.rasterio,"open",side_effect=opener),\
                 patch.object(full,"HistGradientBoostingClassifier",FastModel),\
                 patch.object(full,"TRAIN_BUFFER",5),\
                 patch.object(full,"SCORE_CORRIDOR",3),\
                 patch.dict(sys.modules,{"run":original}):
                a=full.execute(base,base/"run-a")
                b=full.execute(base,base/"run-b")
                self.assertEqual(len(a["fold_ledger"]),3*7)
                self.assertEqual(len(a["postprocess_exploratory_summaries"]),7)
                self.assertTrue(any(r["full_area_scoreable_pixels"]>
                    r["corridor_scoreable_pixels"] for r in a["fold_ledger"]))
                self.assertFalse(a["submission_made"])
                self.assertFalse(a["competition_score_known"])
                a.pop("elapsed_seconds");b.pop("elapsed_seconds")
                self.assertEqual(a,b)
                self.assertTrue((base/"run-a"/"full-area-proxy.json").exists())
                with self.assertRaises(FileExistsError):full.execute(base,base/"run-a")

if __name__=="__main__":unittest.main()
