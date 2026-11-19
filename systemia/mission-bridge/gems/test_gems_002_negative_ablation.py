import unittest
from unittest.mock import patch
from pathlib import Path
import tempfile
from pathlib import Path
import numpy as np
from gems_002_negative_ablation import sample_indices,train_only_distances,geographic_folds,verify_original_model_source,validate_organizer_grid

class NegativeAbalationTests(unittest.TestCase):
    def test_reproducible_and_buffered(self):
        labels=np.array([1,0,0,0,0,0,0,0,0,0],bool)
        train=np.ones(10,bool)
        distances=np.arange(10,dtype=float)
        a,ca=sample_indices(labels,train,distances,0)
        b,cb=sample_indices(labels,train,distances,0)
        np.testing.assert_array_equal(a,b)
        self.assertEqual(ca,cb)
        self.assertEqual(ca['sampled_negative_count'],5)
        c,cc=sample_indices(labels,train,distances,3)
        self.assertTrue(np.all(distances[c[1:]]>3))
        self.assertEqual(cc['sampled_negative_count'],5)

    def test_holdout_labels_never_influence_buffer(self):
        raw=np.zeros((5,5),np.int8)
        raw[1,1]=1
        raw[3,3]=1
        valid=np.ones((5,5),bool)
        train=np.ones(25,bool)
        train[3*5+3]=False
        original=train_only_distances(raw,valid,train)
        changed=raw.copy()
        changed[3,3]=0
        np.testing.assert_array_equal(original,train_only_distances(changed,valid,train))

    def test_sample_indices_only_from_training_mask(self):
        labels=np.array([1,0,0,0,1,0],bool)
        train=np.array([1,1,1,1,0,0],bool)
        distances=np.array([0,1,2,3,0,5],float)
        idx,_=sample_indices(labels,train,distances,0)
        self.assertTrue(np.all(train[idx]))
        self.assertTrue(np.all(idx<4))

    def test_southern_holdout_is_never_used_in_northern_tuning(self):
        valid=np.ones((1000,12),bool)
        folds,southern=geographic_folds(valid,buffer_pixels=10)
        rows=np.where(valid)[0]
        self.assertEqual(len(folds),4)
        for lo,hi,train,test in folds[:3]:
            self.assertTrue(np.all(rows[train]<southern))
            self.assertTrue(np.all(rows[test]<southern))
            self.assertFalse(np.any(train&test))
        lo,hi,train,test=folds[3]
        self.assertTrue(np.all(rows[train]<southern-10))
        self.assertTrue(np.all(rows[test]>=southern))
        self.assertFalse(np.any(train&test))

    def test_irregular_validity_still_locks_southern_region(self):
        valid=np.ones((1000,8),bool)
        valid[30:60,:]=False
        valid[200:300,0:4]=False
        valid[900:,1:]=False
        folds,southern=geographic_folds(valid,buffer_pixels=10)
        rows=np.where(valid)[0]
        for lo,hi,train,test in folds[:3]:
            self.assertFalse(np.any(train&(rows>=southern)))
        self.assertTrue(np.all(rows[folds[-1][3]]>=southern))

    def test_model_source_is_hash_pinned_and_symlinks_denied(self):
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/"run.py"
            source.write_text("def predict(): return 1")
            with self.assertRaisesRegex(ValueError,"original_model_source_sha256_mismatch"):
                verify_original_model_source(source)
            source.unlink()
            with self.assertRaisesRegex(ValueError,"original_model_source_missing_or_unsafe"):
                verify_original_model_source(source)
            source.symlink_to(Path(__file__).resolve())
            with self.assertRaisesRegex(ValueError,"original_model_source_missing_or_unsafe"):
                verify_original_model_source(source)

    def test_exact_raster_alignment_contract(self):
        from rasterio.crs import CRS
        from rasterio.transform import Affine
        bands=[
            "mag_anom","rtp","tmi_hg","geod_2ndinv","iso_grav_anom_slope",
            "tc","geod_shearrate","geod_dilaterate","tmi_vg",
            "deq_n100a15","iso_grav_anom_vg","det_elev","iso_grav_anom",
            "tmi","depth_to_base_surf","ieq_n100a15","cond_surf",
            "iso_grav_anom_hg","det_elev_slope"
        ]
        affine=Affine(100,0,243350,0,-100,4508550)
        class FakeRaster:
            def __init__(self,count,transform=affine,crs=CRS.from_epsg(32611),
                         width=3292,height=3730,descriptions=None):
                self.count=count;self.transform=transform;self.crs=crs
                self.width=width;self.height=height
                self.descriptions=descriptions or tuple()
            def close(self):pass
        def pack(feature=None,labels=None,template=None):
            return [template or FakeRaster(1),labels or FakeRaster(1),
                feature or FakeRaster(19,descriptions=tuple(name+" - synthetic" for name in bands))]
        with patch("rasterio.open",side_effect=pack()):
            found=validate_organizer_grid(Path("/not-used"))
            self.assertTrue(found["raster_alignment_verified"])
            self.assertEqual(found["feature_bands"],19)
        for altered,error in [
            (pack(feature=FakeRaster(19,transform=Affine(100,0,243450,0,-100,4508550),
                     descriptions=tuple(name+" - synthetic" for name in bands))),
             "organizer_raster_transform_mismatch"),
            (pack(feature=FakeRaster(19,crs=CRS.from_epsg(4326),
                     descriptions=tuple(name+" - synthetic" for name in bands))),
             "organizer_raster_crs_mismatch"),
            (pack(feature=FakeRaster(18,descriptions=tuple(name+" - synthetic" for name in bands[:18]))),
             "official_band_count_mismatch"),
            (pack(feature=FakeRaster(19,descriptions=tuple("duplicate - synthetic" for _ in bands))),
             "organizer_feature_band_semantics_mismatch"),
            (pack(labels=FakeRaster(1,width=3291)),
             "organizer_raster_shape_mismatch")
        ]:
            with patch("rasterio.open",side_effect=altered):
                with self.assertRaisesRegex(ValueError,error):
                    validate_organizer_grid(Path("/not-used"))

    def test_unsafe_inputs_fail_closed(self):
        with self.assertRaises(ValueError):
            sample_indices([1,0],[1,1],[0,1],12)
        with self.assertRaises(ValueError):
            sample_indices([1,0],[1,1],[0,np.nan],0)
        with self.assertRaises(ValueError):
            sample_indices([0,0],[1,1],[2,3],0)

if __name__=='__main__':unittest.main()
