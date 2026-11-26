"""GEMS-008E direct HTTPS source capture against synthetic transport only."""
import datetime
import io
import json
import tempfile
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlencode

import gems_008e_direct_https_capture as x
import gems_008e_nbmg_response_import as importer
from gems_008d_nbmg_activefault_probe import FIELDS, LAYER_META_URL, QUERY_BASE

CLOCK=datetime.datetime(2026,11,26,20,0,0,tzinfo=datetime.timezone.utc)
ENVELOPE={
    "xmin":400000, "ymin":4230000, "xmax":410000,
    "ymax":4240000, "spatialReference":{"wkid":26911},
}

def frozen_plan():
    params={**x.FIXED_PARAMS,"geometry":json.dumps(ENVELOPE,separators=(",",":"))}
    return {
        "schema":x.PLAN_SCHEMA,
        "service_metadata_url":LAYER_META_URL,
        "target_layer":LAYER_META_URL[:-7],
        "source_pdf_sha256":x.PDF_SHA,
        "source_manifest_sha256":x.MANIFEST_SHA,
        "source_map_id":"nbmg-ofr-20-1-petrified-spring-sheet1-2020",
        "max_features":100,
        "geometry_requested":False,
        "query_envelope_epsg26911":ENVELOPE,
        "query_url":QUERY_BASE+"?"+urlencode(params),
    }

def layer():
    return {
        "type":"Feature Layer","geometryType":"esriGeometryPolyline",
        "maxRecordCount":1000,
        "fields":[{"name":name,"type":(
            "esriFieldTypeOID" if name=="OBJECTID" else "esriFieldTypeString")}
            for name in FIELDS],
    }

def feature(oid):
    return {"attributes":{f:(oid if f=="OBJECTID" else "source-map")
                          for f in FIELDS}}

class FakeResponse:
    def __init__(self,url,payload,status=200,content_type="application/json",
                 redirected_to=None):
        self.status=status
        self.location=redirected_to or url
        self.payload=io.BytesIO(json.dumps(payload).encode())
        self.headers=Message()
        self.headers["Content-Type"]=content_type
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def read(self,n=-1):return self.payload.read(n)
    def geturl(self):return self.location

class FakeOpener:
    def __init__(self, replies):
        self.replies=replies
        self.calls=[]
    def open(self,request,timeout):
        self.calls.append((request.full_url,request.get_method(),timeout))
        return self.replies[request.full_url]

class DirectHTTPSCaptureTests(unittest.TestCase):
    def fixture(self,root):
        plan=Path(root)/"frozen.json"
        p=frozen_plan()
        plan.write_text(json.dumps(p))
        return plan,p

    def test_exact_transport_receipts_are_compatible_with_offline_import(self):
        with tempfile.TemporaryDirectory() as root:
            path,plan=self.fixture(root)
            opener=FakeOpener({
                plan["service_metadata_url"]: FakeResponse(
                    plan["service_metadata_url"],layer()),
                plan["query_url"]: FakeResponse(
                    plan["query_url"],{"features":[feature(1)]}),
            })
            result=x.execute(path,Path(root)/"captures",
                             opener=opener,clock=CLOCK)
            self.assertEqual([call[0] for call in opener.calls],
                             [plan["service_metadata_url"],plan["query_url"]])
            self.assertTrue(all(call[1]=="GET" and call[2]==12
                                for call in opener.calls))
            self.assertEqual(result["actual_feature_count"],1)
            self.assertFalse(result["independent_fault_ground_truth_verified"])
            self.assertFalse(result["submission_made"])
            a=Path(root)/"captures/layer-capture.json"
            b=Path(root)/"captures/query-capture.json"
            self.assertEqual(
                importer.inspect_capture(a,plan["service_metadata_url"])[0]["type"],
                "Feature Layer")
            self.assertEqual(
                importer.inspect_capture(b,plan["query_url"])[0]["features"][0]
                ["attributes"]["OBJECTID"],1)
            with patch.object(importer,"plan_from_private_source",
                              return_value={
                                  **plan, "schema":
                                      "evercraft.gems.nbmg-activefault-lineage-scout.v1"
                              }):
                analyzed=importer.evaluate("unavailable","unavailable",a,b)
            self.assertEqual(analyzed["feature_count"],1)
            self.assertFalse(analyzed["scored_submission_made"])
            self.assertTrue((Path(root)/"captures/transport-evidence.json").exists())
            with self.assertRaisesRegex(ValueError,
                                        "private_capture_dir_must_be_new"):
                x.execute(path,Path(root)/"captures",opener=opener,clock=CLOCK)

    def test_reject_tampered_url_bbox_source_and_limit_before_network(self):
        with tempfile.TemporaryDirectory() as root:
            path,p=self.fixture(root)
            variants=[]
            changed=dict(p);changed["source_manifest_sha256"]="0"*64
            variants.append(changed)
            changed=dict(p);changed["query_url"]=p["query_url"]+"&f=pjson"
            variants.append(changed)
            changed=dict(p);changed["query_url"]=p["query_url"].replace(
                "resultRecordCount=100","resultRecordCount=1000")
            variants.append(changed)
            changed=dict(p);changed["query_envelope_epsg26911"]={
                **ENVELOPE,"xmax":450000}
            variants.append(changed)
            changed=dict(p);changed["service_metadata_url"]+= "&extra=1"
            variants.append(changed)
            for variant in variants:
                path.write_text(json.dumps(variant))
                with self.subTest(variant=list(variant.items())[-1]),\
                     self.assertRaises(ValueError):
                    x.plan_from_file(path)

    def test_http_error_or_redirect_is_not_a_valid_capture(self):
        for changes in [
            {"status":404},
            {"content_type":"text/html"},
            {"redirected_to":LAYER_META_URL+"&unexpected=1"},
        ]:
            response=FakeResponse(LAYER_META_URL,layer(),**changes)
            with self.subTest(changes=changes),self.assertRaises(ValueError):
                x.get_capture(LAYER_META_URL,
                    opener=FakeOpener({LAYER_META_URL:response}),clock=CLOCK)

    def test_arcgis_error_or_wrong_metadata_never_sends_query(self):
        with tempfile.TemporaryDirectory() as root:
            path,p=self.fixture(root)
            for metadata in [
                {"error":{"code":404,"message":"Service not found"}},
                {**layer(),"fields":[]},
            ]:
                transport=FakeOpener({
                    LAYER_META_URL:FakeResponse(LAYER_META_URL,metadata),
                    p["query_url"]:FakeResponse(p["query_url"],
                                                {"features":[feature(1)]}),
                })
                out=Path(root)/"captures"
                with self.subTest(meta=metadata),self.assertRaises(ValueError):
                    x.execute(path,out,opener=transport,clock=CLOCK)
                self.assertEqual(len(transport.calls),1)
                self.assertFalse(out.exists())

    def test_truncated_or_duplicate_query_never_creates_success_receipt(self):
        with tempfile.TemporaryDirectory() as root:
            path,p=self.fixture(root)
            for records in [
                {"features":[feature(1)],"exceededTransferLimit":True},
                {"features":[feature(1),feature(1)]},
                {"features":[feature(1) for i in range(100)]},
            ]:
                transport=FakeOpener({
                    LAYER_META_URL:FakeResponse(LAYER_META_URL,layer()),
                    p["query_url"]:FakeResponse(p["query_url"],records),
                })
                out=Path(root)/"captures"
                with self.subTest(records=str(records)[:30]),\
                     self.assertRaises(ValueError):
                    x.execute(path,out,opener=transport,clock=CLOCK)
                self.assertEqual(len(transport.calls),2)
                self.assertFalse(out.exists())

if __name__=="__main__":
    unittest.main()
