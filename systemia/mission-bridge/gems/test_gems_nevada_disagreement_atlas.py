import hashlib, json, tempfile, unittest, zipfile
from pathlib import Path
from unittest.mock import patch
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
import gems_nevada_disagreement_atlas as atlas

class PredictionDisagreementAtlasTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.base=Path(self.tmp.name)
        self.archive=self.base/"gems_001.zip";self.challenger=self.base/"gems_002.tif"
        self.old=np.zeros((121,130),np.float32);self.old[0,:3]=np.nan
        self.new=self.old.copy();self.old[2:20,5:15]=.5
        self.new[4:22,10:20]=.75
        self.profile={"driver":"GTiff","count":1,"width":130,"height":121,
            "crs":"EPSG:32611","dtype":"float32",
            "transform":from_origin(243350,4508550,100,100)}
        with MemoryFile() as mem:
            with mem.open(**self.profile) as dst:dst.write(self.old,1)
            self.old_bytes=mem.read()
        with zipfile.ZipFile(self.archive,"w") as z:
            z.writestr("gems_candidate.tif",self.old_bytes)
        self.save_challenger()
    def save_challenger(self):
        with rasterio.open(self.challenger,"w",**self.profile) as dst:dst.write(self.new,1)
        self.new_bytes=self.challenger.read_bytes()
    def pins(self):
        a=(self.old>=.2)&np.isfinite(self.old)
        b=(self.new>=.2)&np.isfinite(self.new)
        patches=[
            patch.object(atlas,"GEMS001_SHA",hashlib.sha256(self.old_bytes).hexdigest()),
            patch.object(atlas,"GEMS002_SHA",hashlib.sha256(self.new_bytes).hexdigest()),
            patch.object(atlas,"MIN_VALID",50),
            patch.object(atlas,"KNOWN_COUNTS",{
                "valid":int(np.isfinite(self.old).sum()),
                "old":int(a.sum()),"new":int(b.sum()),"overlap":int((a&b).sum())})]
        for x in patches:x.start();self.addCleanup(x.stop)
    def test_real_tiffs_and_wgs84_diagnostic_tiles(self):
        self.pins()
        out,report=atlas.analyze(self.archive,self.challenger,self.base/"new_output")
        self.assertEqual(report["valid_grid_pixels"],121*130-3)
        self.assertEqual(report["full_map_counts"]["old"],180)
        self.assertEqual(report["full_map_counts"]["new"],180)
        self.assertEqual(report["nonempty_10km_tiles"],4)
        geojson=json.loads((out/"gems_model_disagreement_tiles.geojson").read_text())
        self.assertEqual(geojson["type"],"FeatureCollection")
        self.assertEqual(geojson["metadata"]["crs"],"OGC:CRS84 (WGS84 longitude latitude)")
        self.assertEqual(len(geojson["features"]),4)
        for feature in geojson["features"]:
            self.assertTrue(feature["properties"]["no_fault_truth_or_geology_observed"])
            for longitude,latitude in feature["geometry"]["coordinates"][0]:
                self.assertTrue(-125<longitude<-110)
                self.assertTrue(35<latitude<45)
        self.assertFalse(report["new_scored_submission"])
        with self.assertRaises(FileExistsError):
            atlas.analyze(self.archive,self.challenger,out)
    def test_fails_on_modified_candidate_bytes(self):
        self.pins()
        self.challenger.write_bytes(self.new_bytes+b"modified")
        with self.assertRaisesRegex(ValueError,"GEMS002_CHALLENGER_HASH_MISMATCH"):
            atlas.analyze(self.archive,self.challenger,self.base/"output")
    def test_fails_on_mismatched_nan_mask(self):
        self.new[0,0]=0
        self.save_challenger();self.pins()
        with self.assertRaisesRegex(ValueError,"FINITE_MASK_MISMATCH"):
            atlas.analyze(self.archive,self.challenger,self.base/"output")
    def test_affine_utm_is_transformed_to_wgs84(self):
        ring=atlas.polygon_4326(self.profile["transform"],0,100,0,100)
        self.assertEqual(len(ring),5)
        self.assertEqual(ring[0],ring[-1])
        for longitude,latitude in ring:
            self.assertTrue(-125<longitude<-110)
            self.assertTrue(35<latitude<45)

if __name__=="__main__":unittest.main()
