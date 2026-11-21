import tempfile,unittest
from pathlib import Path
import numpy as np,rasterio
from rasterio.transform import from_origin
from gems_005_directional_features import directional_coherence_response,make_directional_matrix

class DirectionalFeaturesTests(unittest.TestCase):
    def test_linear_ramp_has_supported_coherent_direction(self):
        y,x=np.indices((80,80))
        a=(x+.02*y).astype("float32")
        out=directional_coherence_response(a,np.ones(a.shape,bool),2)
        self.assertTrue(np.all(np.isfinite(out[15:65,15:65])))
        self.assertGreater(float(np.median(out[15:65,15:65])),.8)

    def test_missing_and_invalid_do_not_become_fake_edges(self):
        y,x=np.indices((80,80));a=x.astype("float32");a[25:55,25:55]=np.nan
        mask=np.isfinite(a);out=directional_coherence_response(a,mask,2)
        self.assertTrue(np.all(np.isnan(out[25:55,25:55])))
        self.assertTrue(np.all(np.isfinite(out[10:15,10:15])))
        with self.assertRaises(ValueError):directional_coherence_response(a,mask,0)
        with self.assertRaises(ValueError):directional_coherence_response(a,np.ones_like(mask),2)

    def test_actual_rasterio_band_names_and_pixel_row_alignment(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/"features.tif";h,w=50,60
            profile={"driver":"GTiff","count":19,"height":h,"width":w,
                "dtype":"float32","crs":"EPSG:32611",
                "transform":from_origin(243350,4508550,100,100)}
            y,x=np.indices((h,w));valid=np.ones((h,w),bool);valid[:3,:4]=False
            with rasterio.open(path,"w",**profile) as dst:
                for band in range(1,20):
                    dst.write((x+y*(band/50)).astype("float32"),band)
                    name="rtp" if band==2 else "iso_grav_anom" if band==13 else f"other_{band}"
                    dst.set_band_description(band,name+" - measured")
            mat,audit=make_directional_matrix(valid,path)
            self.assertEqual(mat.shape,(int(valid.sum()),4))
            self.assertEqual([v["source_band_index"] for v in audit],[2,2,13,13])
            self.assertTrue(all(v["no_fault_labels_used"] for v in audit))
            self.assertGreater(int(np.isfinite(mat).sum()),200)
            with self.assertRaises(ValueError):
                make_directional_matrix(np.ones((10,10),bool),path)

    def test_constant_offset_does_not_change_directionality(self):
        _,x=np.indices((90,90));a=x.astype("float32")
        first=directional_coherence_response(a,np.ones(a.shape,bool),8)
        second=directional_coherence_response(a+100,np.ones(a.shape,bool),8)
        self.assertTrue(np.allclose(first[20:70,20:70],second[20:70,20:70],
                                    rtol=1e-4,atol=1e-4))

if __name__=="__main__":unittest.main()
