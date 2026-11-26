import hashlib, tempfile, unittest, zipfile
from pathlib import Path
from unittest.mock import patch
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
import audit_candidate_comparison as qc

class ComparisonTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.base=Path(self.tmp.name);self.p=self.base/"original.zip";self.q=self.base/"new.tif"
  self.profile={"driver":"GTiff","width":18,"height":20,"count":1,
   "dtype":"float32","crs":"EPSG:32611","transform":from_origin(243350,4508550,100,100)}
  self.old=np.zeros((20,18),np.float32);self.old[0,0]=np.nan
  self.old[3:8,4]=.5;self.old[12:15,9]=.3
  self.new=self.old.copy();self.new[3:8,4]=.65;self.new[10:12,16]=.7
  with MemoryFile() as mem:
   with mem.open(**self.profile) as dst:dst.write(self.old,1)
   raw=mem.read()
  self.original_sha=hashlib.sha256(raw).hexdigest()
  with zipfile.ZipFile(self.p,"w") as z:z.writestr("gems_candidate.tif",raw)
  self.write_new()
 def write_new(self):
  with rasterio.open(self.q,"w",**self.profile) as dst:dst.write(self.new,1)
 def test_compares_density_overlap_and_component_changes(self):
  with patch.object(qc,"ORIGINAL_CANDIDATE_SHA256",self.original_sha):
   a=qc.compare(self.p,self.q)
  self.assertTrue(a["grid_and_nan_mask_match"])
  self.assertEqual(a["finite_cells"],20*18-1)
  self.assertGreater(a["gems_002"]["thresholds"]["0.5"]["cells"],a["gems_001"]["thresholds"]["0.5"]["cells"])
  self.assertEqual(a["geographic_overlap"]["0.5"]["new_only_cells"],2)
  self.assertFalse(a["submission_made"])
 def test_rejects_bad_raster_hash(self):
  with patch.object(qc,"ORIGINAL_CANDIDATE_SHA256",self.original_sha):
   with self.assertRaisesRegex(ValueError,"gems_002_candidate_hash_mismatch"):
    qc.compare(self.p,self.q,"0"*64)
 def test_rejects_invalid_mask_and_grid(self):
  self.new[0,0]=0;self.write_new()
  with patch.object(qc,"ORIGINAL_CANDIDATE_SHA256",self.original_sha):
   with self.assertRaisesRegex(ValueError,"candidate_valid_mask_mismatch"):
    qc.compare(self.p,self.q)
 def test_rejects_tampered_archived_candidate(self):
  with self.assertRaisesRegex(ValueError,"gems_001_original_candidate_hash_mismatch"):
   qc.compare(self.p,self.q)
 def test_rejects_probability_over_one(self):
  self.new[2,2]=1.5;self.write_new()
  with patch.object(qc,"ORIGINAL_CANDIDATE_SHA256",self.original_sha):
   with self.assertRaisesRegex(ValueError,"candidate_values_invalid"):
    qc.compare(self.p,self.q)
if __name__=="__main__":unittest.main()
