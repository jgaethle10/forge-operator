import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin

import gems_external_layer_gate as gate

class CrossDomainIntakeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base=Path(self.tmp.name)
        self.raster=self.base/"candidate.tif"

    def make(self,top=4508550,x=243350,res=100,dtype="float32",crs="EPSG:32611"):
        a=np.ones((20,20),dtype=dtype)
        profile={"driver":"GTiff","height":20,"width":20,"count":1,
                 "dtype":dtype,"transform":from_origin(x,top,res,res),"crs":crs}
        with rasterio.open(self.raster,"w",**profile) as out:out.write(a,1)
        return hashlib.sha256(self.raster.read_bytes()).hexdigest()

    def entry(self,sha,**overrides):
        data={"id":"sample-nevada-dem","title":"Nevada relief","source_project":"Review",
              "source_kind":"external_raster","source_reference":"https://example.org/source",
              "file_path":str(self.raster),"expected_sha256":sha,
              "competition_use_rights_declared":True,
              "sponsor_sharing_rights_declared":True,
              "rights_source":"https://example.org/license"}
        data.update(overrides)
        return data

    def test_method_only_cannot_be_mistaken_for_geologic_training_data(self):
        record={"id":"evermaps-methods","title":"GeoJSON QA",
                "source_project":"EverMaps","source_kind":"method_only",
                "source_reference":"https://github.com/jgaethle10/forge-operator/pull/1681"}
        r=gate.audit({"schema":"evercraft.gems.cross-domain-catalog.v1",
                      "sources":[record]})
        self.assertEqual(r["sources"][0]["status"],
                         "methods_reusable_no_geographic_training_data")
        self.assertEqual(r["sources_approved_for_training"],0)
        with self.assertRaisesRegex(ValueError,"method_only_must_not_supply_data"):
            gate.evaluate({**record,"file_path":"/tmp/a.tif"})

    def test_real_aligned_raster_is_still_not_auto_approved(self):
        digest=self.make()
        r=gate.evaluate(self.entry(digest))
        self.assertEqual(r["status"],"candidate_for_independent_rights_and_science_review_only")
        self.assertEqual(r["sha256"],digest)
        self.assertTrue(r["direct_100m_geodawn_alignment"])
        self.assertTrue(r["bounded_sample_contains_finite_values"])
        self.assertFalse(r["usable_for_training_now"])
        self.assertFalse(r["allowed_to_train_without_independent_review"])

    def test_wrong_region_and_wrong_crs_not_admitted(self):
        digest=self.make(top=5190000)
        r=gate.evaluate(self.entry(digest))
        self.assertEqual(r["status"],"outside_geodawn_study_area")
        digest=self.make(crs="EPSG:4326")
        r=gate.evaluate(self.entry(digest))
        self.assertEqual(r["status"],"different_crs_requires_bounded_transform_and_review")

    def test_license_and_resolution_require_review(self):
        digest=self.make()
        r=gate.evaluate(self.entry(digest,sponsor_sharing_rights_declared=False))
        self.assertEqual(r["status"],"rights_and_shareability_review_needed")
        digest=self.make(res=200)
        r=gate.evaluate(self.entry(digest))
        self.assertEqual(r["status"],"reprojection_or_resampling_review_needed")

    def test_byte_tampering_fails_and_integer_raster_is_safe(self):
        self.make()
        with self.assertRaisesRegex(ValueError,"external_raster_sha256_mismatch"):
            gate.evaluate(self.entry("0"*64))
        digest=self.make(dtype="uint16")
        r=gate.evaluate(self.entry(digest))
        self.assertTrue(r["bounded_sample_contains_finite_values"])

    def test_schema_and_duplicate_sources_fail_closed(self):
        record={"id":"x","title":"T","source_project":"Test",
                "source_kind":"method_only","source_reference":"source"}
        with self.assertRaisesRegex(ValueError,"duplicate_source_id"):
            gate.audit({"schema":"evercraft.gems.cross-domain-catalog.v1",
                        "sources":[record,record]})
        with self.assertRaisesRegex(ValueError,"catalog_schema_invalid"):
            gate.audit({"schema":"wrong","sources":[record]})

if __name__=="__main__":unittest.main()
