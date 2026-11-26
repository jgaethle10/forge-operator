"""GEMS-008E no-network browser capture import scientific integrity tests."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import gems_008e_nbmg_response_import as x
from gems_008d_nbmg_activefault_probe import FIELDS,LAYER_META_URL,QUERY_BASE

PLAN={
    "schema":"evercraft.gems.nbmg-activefault-lineage-scout.v1",
    "source_map_id":"synthetic-fault-map",
    "source_pdf_sha256":"a"*64,
    "source_manifest_sha256":"b"*64,
    "service_metadata_url":LAYER_META_URL,
    "query_url":QUERY_BASE+"?geometry=exact_frozen_test_envelope",
}
def layer():
    return {"type":"Feature Layer","geometryType":"esriGeometryPolyline",
            "maxRecordCount":1000,"fields":[
                {"name":name,"type":("esriFieldTypeOID" if name=="OBJECTID"
                                     else "esriFieldTypeString")}
                for name in FIELDS]}
def features():
    return {"features":[{"attributes":{
        name:(1 if name=="OBJECTID" else "verified_public_source_citation")
        for name in FIELDS}}]}
def capture(url,body):
    return {"schema":x.CAPTURE_SCHEMA,"method":"GET",
            "http_status":200,"redirects_followed":False,
            "content_type":"application/json",
            "captured_at_utc":"2026-11-26T20:00:00Z",
            "requested_url":url,"response":body}

class BrowserCaptureImportTests(unittest.TestCase):
    def make_files(self,root,left=None,right=None):
        a=Path(root)/"layer.json";b=Path(root)/"query.json"
        a.write_text(json.dumps(left if left is not None else
                                capture(PLAN["service_metadata_url"],layer())))
        b.write_text(json.dumps(right if right is not None else
                                capture(PLAN["query_url"],features())))
        return a,b

    def test_exact_pinned_two_response_import_is_metadata_only(self):
        with tempfile.TemporaryDirectory() as root:
            a,b=self.make_files(root)
            with patch.object(x,"plan_from_private_source",return_value=PLAN):
                result=x.evaluate("manifest","pdf",a,b)
            self.assertEqual(result["feature_count"],1)
            self.assertEqual(result["field_distributions"]["Source"],
                             {"verified_public_source_citation":1})
            self.assertTrue(result["external_capture_transport_not_independently_authenticated"])
            self.assertFalse(result["scored_submission_made"])
            self.assertFalse(result["independent_fault_ground_truth_verified"])
            self.assertNotIn("query_url",result)
            self.assertNotIn("query_envelope",result)
            self.assertEqual(result["layer_capture"]["captured_file_sha256"],
                             hashlib.sha256(a.read_bytes()).hexdigest())

    def test_refuse_bad_or_redirected_or_altered_bounded_request(self):
        with tempfile.TemporaryDirectory() as root:
            for item in [
                dict(capture(PLAN["query_url"]+"-widened",features())),
                dict(capture(PLAN["query_url"],features()),
                     redirects_followed=True),
                dict(capture(PLAN["query_url"],features()),
                     http_status=404),
                dict(capture(PLAN["query_url"],features()),
                     method="POST"),
                dict(capture(PLAN["query_url"],features()),
                     content_type="text/html"),
            ]:
                a,b=self.make_files(root,right=item)
                with self.subTest(case=list(item.items())[:2]),\
                     patch.object(x,"plan_from_private_source",return_value=PLAN),\
                     self.assertRaises(ValueError):
                    x.evaluate("manifest","pdf",a,b)

    def test_refuse_arcgis_error_truncation_duplicate_geometry(self):
        with tempfile.TemporaryDirectory() as root:
            originals=features()
            cases=[
                {"error":{"code":404,"message":"Service not found"}},
                {**originals,"exceededTransferLimit":True},
                {"features":originals["features"]*2},
                {"features":[{**originals["features"][0],
                              "geometry":{"paths":[]}}]},
                {"features":[{"attributes":{"OBJECTID":1}}]},
            ]
            for body in cases:
                a,b=self.make_files(root,right=capture(PLAN["query_url"],body))
                with self.subTest(case=str(body)[:30]),\
                     patch.object(x,"plan_from_private_source",return_value=PLAN),\
                     self.assertRaises(ValueError):
                    x.evaluate("manifest","pdf",a,b)

    def test_wrong_layer_schema_and_invalid_capture_envelope(self):
        with tempfile.TemporaryDirectory() as root:
            invalid_layer=layer()
            invalid_layer["fields"]=invalid_layer["fields"][:-1]
            a,b=self.make_files(root,left=capture(
                PLAN["service_metadata_url"],invalid_layer))
            with patch.object(x,"plan_from_private_source",return_value=PLAN),\
                 self.assertRaises(ValueError):
                x.evaluate("manifest","pdf",a,b)
            good=capture(PLAN["service_metadata_url"],layer())
            good["schema"]="untrusted.capture.v1"
            a,b=self.make_files(root,left=good)
            with patch.object(x,"plan_from_private_source",return_value=PLAN),\
                 self.assertRaises(ValueError):
                x.evaluate("manifest","pdf",a,b)

if __name__=="__main__":
    unittest.main()
