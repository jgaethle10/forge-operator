"""GEMS-008D synthetic-only NBMG ActiveFault source-provenance tests."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import gems_008d_nbmg_activefault_probe as x


def synthetic_plan():
    return {
        "schema": x.SCHEMA,
        "source_map_id": "synthetic-map",
        "source_pdf_sha256": "a"*64,
        "source_manifest_sha256": "b"*64,
        "target_layer": x.SERVICE,
        "service_metadata_url": x.LAYER_META_URL,
        "query_url": x.QUERY_BASE + "?f=json",
    }


def valid_layer():
    return {
        "type": "Feature Layer",
        "geometryType": "esriGeometryPolyline",
        "fields": [
            {"name": f, "type": ("esriFieldTypeOID" if f == "OBJECTID"
                                  else "esriFieldTypeString")}
            for f in x.FIELDS
        ],
        "maxRecordCount": 1000,
    }


def feature(index=1):
    attrs = {field: ("sample" if field != "OBJECTID" else index)
             for field in x.FIELDS}
    attrs["Source"] = "historical NGDS source, lineage not verified"
    return {"attributes": attrs}


class ActiveFaultProbeTests(unittest.TestCase):
    def test_layer_metadata_requires_exact_known_fields_and_polyline(self):
        result = x.verify_service_metadata(valid_layer())
        self.assertTrue(result["verified_feature_layer"])
        altered = valid_layer()
        altered["fields"] = altered["fields"][:-1]
        with self.assertRaisesRegex(ValueError,
                                    "nbmg_activefault_field_schema_changed"):
            x.verify_service_metadata(altered)
        altered = valid_layer()
        altered["geometryType"] = "esriGeometryPolygon"
        with self.assertRaisesRegex(ValueError,
                                    "unexpected_fault_geometry_type"):
            x.verify_service_metadata(altered)

    def test_metadata_scoring_prohibitions_and_counts(self):
        report = x.analyze_response(
            synthetic_plan(),
            {"features":[feature(1), feature(2)]},
            x.verify_service_metadata(valid_layer()))
        self.assertEqual(report["feature_count"], 2)
        self.assertEqual(report["field_distributions"]["Source"],
                         {"historical NGDS source, lineage not verified":2})
        self.assertFalse(report["source_independence_verified"])
        self.assertFalse(report["exact_valid_mask_intersections_verified"])
        self.assertFalse(report["scored_submission_made"])
        self.assertNotIn("query_url", report)
        with self.assertRaisesRegex(ValueError,
                                    "geometry_disclosure_in_metadata_only_query"):
            x.analyze_response(synthetic_plan(),
                {"features":[dict(feature(1), geometry={"paths":[[]]})]},{})

    def test_error_truncation_duplicate_and_cap_fail_closed(self):
        for response in [
            {"error":{"code":404,"message":"Service not found"}},
            {"features":[feature(1)],"exceededTransferLimit":True},
            {"features":[feature(1),feature(1)]},
            {"features":[feature(i) for i in range(x.LIMIT)]},
            {"features":[{"attributes":{"OBJECTID":1}}]},
        ]:
            with self.subTest(key=str(response)[:35]):
                if "error" in response:
                    with self.assertRaisesRegex(ValueError,
                                                "arcgis_200_or_http_error"):
                        x.safe_get_json(x.LAYER_META_URL,
                                        transport=lambda _:response)
                else:
                    with self.assertRaises(ValueError):
                        x.analyze_response(synthetic_plan(),response,{})
        with self.assertRaisesRegex(ValueError,"nonallowlisted_nbmg_url"):
            x.safe_get_json("https://some.other.host/?f=json",
                            transport=lambda _:valid_layer())

    def test_one_bounded_source_preflight_then_query_and_write_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            receipt = Path(tmp)/"result.json"
            calls=[]
            def transport(url):
                calls.append(url)
                if url==x.LAYER_META_URL:return valid_layer()
                if url.startswith(x.QUERY_BASE+"?"):
                    return {"features":[feature(1)]}
                raise AssertionError("unallowlisted request")
            with patch.object(x, "plan_from_private_source",
                              return_value=synthetic_plan()):
                r=x.execute("unused_manifest","unused_pdf",receipt,
                            allow_live=True,transport=transport)
                self.assertEqual(calls,[x.LAYER_META_URL,
                                       x.QUERY_BASE+"?f=json"])
                self.assertTrue(receipt.is_file())
                self.assertEqual(r["feature_count"],1)
                with self.assertRaisesRegex(ValueError,
                                            "receipt_must_be_new_and_private"):
                    x.execute("unused_manifest","unused_pdf",receipt,
                              allow_live=True,transport=transport)
            receipt2=Path(tmp)/"error.json"
            def error_transport(url):
                if url==x.LAYER_META_URL:return valid_layer()
                return {"error":{"code":404,"message":"Service not found"}}
            with patch.object(x, "plan_from_private_source",
                              return_value=synthetic_plan()):
                with self.assertRaisesRegex(ValueError,
                                            "arcgis_200_or_http_error"):
                    x.execute("unused","unused",receipt2,
                              allow_live=True,transport=error_transport)
            self.assertFalse(receipt2.exists())

    def test_offline_mode_has_no_network_and_no_feature_claims(self):
        with tempfile.TemporaryDirectory() as tmp:
            receipt=Path(tmp)/"offline.json"
            with patch.object(x,"plan_from_private_source",
                              return_value=synthetic_plan()):
                r=x.execute("unused","unused",receipt)
            self.assertFalse(r["actual_arcgis_records_received"])
            self.assertEqual(r["mode"],"offline_source_request_plan")


if __name__ == "__main__":
    unittest.main()
