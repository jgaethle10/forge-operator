"""GEMS-005 full synthetic HGB training and identical-fold evidence contract."""
import sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
from scipy.ndimage import distance_transform_edt,maximum_filter
import gems_005_directional_ablation as x

class DirectionalAblationTests(unittest.TestCase):
    def test_synthetic_three_fold_equal_training_and_full_area_scoring(self):
        shape=(130,160);raw=np.zeros(shape,np.int8)
        for row,col in [(5,10),(8,55),(20,90),(32,120),
                        (45,15),(55,65),(60,120),(70,30),(85,100)]:
            raw[row:row+16,col]=1
        raw[93:115,140]=1
        valid=np.ones(shape,bool)
        y,c=np.indices(shape)
        matrix=np.column_stack([np.sin((c.ravel()+2*j)/15)
            +.2*np.cos((y.ravel()+j)/12)+.03*j+.002*y.ravel()
            for j in range(34)]).astype("float32")
        extra=np.column_stack([np.sin(c.ravel()/11),np.cos(y.ravel()/9),
            np.sin((y.ravel()+c.ravel())/15),np.cos((y.ravel()-c.ravel())/11)]
            ).astype("float32")
        class Raster:
            def __init__(self,a):self.a=a
            def __enter__(self):return self
            def __exit__(self,*args):return False
            def read(self,band):return self.a.copy()
        def raster_open(path):
            if Path(path).name=="existing_faults.tif":return Raster(raw)
            if Path(path).name=="example_submission.tif":return Raster(valid.astype("float32"))
            raise AssertionError("unexpected_raster")
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
                    w=1-np.hypot(dr,dc)/3
                    np.maximum(peaks,np.roll(prob,(dr,dc),(0,1))*w,out=peaks)
            tp=peaks[truth].sum(dtype="float64")
            fp=np.dot(prob[region].astype("float64"),weights)
            return float(tp/(tp+.2*fp+.8*(truth.sum()-tp)+1e-12))
        ref=SimpleNamespace(features=lambda mask:matrix,predict=predict,
            render=render,score_setup=score_setup,dti=dti)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with patch.object(x,"verify_original_model_source",return_value="synthetic"),\
                 patch.object(x,"verify_inputs",return_value={"mock":"verified"}),\
                 patch.object(x,"validate_organizer_grid",return_value={"mock":"aligned"}),\
                 patch.object(x,"make_directional_matrix",return_value=(extra,[{"no_fault_labels_used":True}]*4)),\
                 patch.object(x.rasterio,"open",side_effect=raster_open),\
                 patch.dict(sys.modules,{"run":ref}):
                first=x.execute(root,root/"first")
                second=x.execute(root,root/"second")
                self.assertEqual(len(first["fold_ledger"]),3)
                self.assertEqual(first["original_feature_count"],34)
                self.assertEqual(first["augmented_feature_count"],38)
                self.assertTrue(first["identical_training_samples_and_positive_labels"])
                self.assertTrue(all(v["training"]["sampled_negative_count"]==
                    5*v["training"]["positive_count"] for v in first["fold_ledger"]))
                self.assertFalse(first["submission_made"])
                self.assertFalse(first["automatic_promotion_allowed"])
                self.assertTrue((root/"first"/"directional-full-area-ablation.json").is_file())
                with self.assertRaises(FileExistsError):x.execute(root,root/"first")
                first.pop("elapsed_seconds");second.pop("elapsed_seconds")
                self.assertEqual(first,second)

    def test_full_area_score_crop_preserves_three_southern_kernel_rows(self):
        """Same 300m southern padding as GEMS-002/004; never count it as north."""
        for height, northern_rows, expected_crop in ((12,7,10),(8,7,8)):
            with self.subTest(height=height,north=northern_rows):
                width=8
                north=np.zeros((height,width),bool)
                north[:northern_rows]=True
                flat=north.ravel()
                matrix=np.zeros((height*width,34),dtype="float32")
                reference=SimpleNamespace(
                    predict=lambda *args: np.full(int(north.sum()),.6,dtype="float32"),
                    render=lambda prob,threshold,ridge: prob)
                truth=np.zeros_like(north)
                full=np.ones_like(north)
                corridor=np.ones_like(north)
                known=np.zeros_like(north)
                terms={"tp":1.0,"fp":2.0,"fn":3.0}
                with patch.object(x,"score_masked_proxy",return_value=terms) as score:
                    result=x.measure(reference,object(),matrix,flat,north,
                                     truth,full,corridor,known)
                self.assertEqual(score.call_count,2)
                for call in score.call_args_list:
                    self.assertEqual(
                        [arr.shape for arr in call.args[1:]],
                        [(expected_crop,width)]*4)
                self.assertEqual(result["selected_northern_pixels"],
                                 northern_rows*width)

if __name__=="__main__":unittest.main()
