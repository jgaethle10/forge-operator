import json, sys, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
import rasterio
from rasterio.transform import from_origin
from scipy.ndimage import maximum_filter
import gems_002_prepare_candidate as candidate

class FullGridCandidateTests(unittest.TestCase):
    def test_offline_fitting_and_geotiff_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);data=base/"official";data.mkdir()
            h,w=64,72
            valid=np.ones((h,w),bool);valid[:2,:3]=False
            faults=np.zeros((h,w),np.int16);faults[~valid]=-1
            for r,c in [(8,12),(8,48),(32,10),(35,43),(52,22),(50,57)]:
                faults[r:r+5,c:c+5]=1
            profile={"driver":"GTiff","width":w,"height":h,"count":1,
                "dtype":"float32","crs":"EPSG:32611",
                "transform":from_origin(243350,4508550,100,100)}
            with rasterio.open(data/"example_submission.tif","w",**profile) as dst:
                a=np.zeros((h,w),np.float32);a[~valid]=np.nan;dst.write(a,1)
            with rasterio.open(data/"existing_faults.tif","w",**{**profile,"dtype":"int16"}) as dst:
                dst.write(faults,1)
            y,x=np.indices((h,w))
            cols=np.column_stack([((x.ravel()+j*3)%35)/35+((y.ravel()+j)%17)/100
                for j in range(34)]).astype("float32")
            def predict(m,mat,subset,n):
                return m.predict_proba(mat[subset,:n])[:,1].astype("float32")
            def render(prob,t,ridge):
                out=np.where(prob>=t,prob,0).astype("float32")
                if ridge:out*=(prob>=maximum_filter(prob,size=3)*.94)
                return out
            original=SimpleNamespace(features=lambda mask:cols[mask.ravel()],
                predict=predict,render=render)
            target=base/"candidate"
            with patch.object(candidate,"verify_original_model_source",return_value="synthetic"), \
                 patch.object(candidate,"verify_inputs",return_value={"fixture":"synthetic"}), \
                 patch.object(candidate,"validate_organizer_grid",return_value={"fixture":True}), \
                 patch.dict(sys.modules,{"run":original}):
                receipt=candidate.prepare(data,target)
                self.assertFalse(receipt["submission_made"])
                self.assertTrue(receipt["sha256_and_roundtrip_verified"])
                self.assertEqual(receipt["negative_exclusion_meters"],1000)
                self.assertEqual(receipt["training_positives"],int((faults==1).sum()))
                self.assertGreater(receipt["positive_prediction_cells"],0)
                with rasterio.open(target/"gems_002_candidate_UNSUBMITTED.tif") as src:
                    out=src.read(1)
                    self.assertEqual(src.dtypes[0],"float32")
                    self.assertTrue(np.array_equal(np.isnan(out),~valid))
                    self.assertTrue((out[valid]>=0).all() and (out[valid]<=1).all())
                stored=json.loads((target/"candidate-evidence.json").read_text())
                self.assertEqual(stored["candidate_sha256"],receipt["candidate_sha256"])
                with self.assertRaises(FileExistsError):candidate.prepare(data,target)

    def test_missing_trusted_source_fails_before_output(self):
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)/"never-created"
            with patch.object(candidate,"verify_original_model_source",side_effect=ValueError("source_invalid")):
                with self.assertRaisesRegex(ValueError,"source_invalid"):
                    candidate.prepare(Path(directory),output)
            self.assertFalse(output.exists())

if __name__=="__main__":unittest.main()
