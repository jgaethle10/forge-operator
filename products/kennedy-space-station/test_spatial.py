"""KSS preliminary-study unit and HTTP regression gates."""
import json
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import spatial
from test_shell import KennedyHomeTest


class ModelValidationTest(unittest.TestCase):
    def model(self):
        return {"schema": spatial.SCHEMA, "units": "meters",
                "measurement_basis": "assumed", "title": "Synthetic layout",
                "source_note": "Only fabricated dimensions", "parcel": {"width": 80, "depth": 65},
                "objects": [
                    {"id": "building-1", "kind": "building", "label": "Workshop",
                     "x": 8, "z": 8, "width": 28, "depth": 16},
                    {"id": "charger-1", "kind": "charging_bay", "label": "EV concept",
                     "x": 48, "z": 13, "width": 6, "depth": 5},
                ]}

    def test_bounds_collision_and_numeric_validation(self):
        model = self.model()
        self.assertEqual(spatial.validate(model, "SITE-A")["qa"]["georeferenced"], False)
        model["objects"][1]["x"] = 78
        with self.assertRaisesRegex(spatial.StudyError, "outside_parcel"):
            spatial.validate(model, "SITE-A")
        model["objects"][1]["x"] = 10
        with self.assertRaisesRegex(spatial.StudyError, "footprint_conflict"):
            spatial.validate(model, "SITE-A")
        model["objects"][1]["x"] = 48
        model["parcel"]["width"] = float("nan")
        with self.assertRaisesRegex(spatial.StudyError, "outside_bounds"):
            spatial.validate(model, "SITE-A")

    def test_zero_after_rounding_bad_kind_and_xml_controls(self):
        model = self.model()
        model["parcel"]["width"] = 0.00001
        with self.assertRaisesRegex(spatial.StudyError, "below_precision"):
            spatial.validate(model, "SITE-A")
        model = self.model()
        model["objects"][0]["kind"] = ["building"]
        with self.assertRaisesRegex(spatial.StudyError, "kind_invalid"):
            spatial.validate(model, "SITE-A")
        model = self.model()
        model["title"] = "Example\\u0000"
        model["title"] = model["title"].replace("\\u0000", chr(0))
        with self.assertRaisesRegex(spatial.StudyError, "invalid_characters"):
            spatial.validate(model, "SITE-A")

    def test_duplicate_and_injection_safe_svg(self):
        model = self.model()
        model["objects"][1]["id"] = "building-1"
        with self.assertRaisesRegex(spatial.StudyError, "duplicate"):
            spatial.validate(model, "SITE-A")
        model = self.model()
        model["title"] = '<script>alert("x")</script>'
        normalized = spatial.validate(model, "SITE-A")
        study = {"model": normalized, "revision": 1,
                 "model_sha256": spatial.digest(normalized)}
        content = spatial.svg(study).decode("utf-8")
        self.assertNotIn("<script>", content)
        self.assertIn("&lt;script&gt;", content)
        self.assertIn("NOT A SURVEY", content)


class StudyHTTPTest(KennedyHomeTest):
    """Inherits actual HTTP harness and original separation checks."""
    def api(self, method, path, data=None):
        body = json.dumps(data).encode() if data is not None else None
        request = Request(f"http://127.0.0.1:{self.port}{path}",
                          data=body, method=method,
                          headers={"Content-Type": "application/json"} if body else {})
        try:
            with urlopen(request, timeout=4) as response:
                return response.status, response.read(), dict(response.headers)
        except HTTPError as exc:
            return exc.code, exc.read(), dict(exc.headers)

    def test_save_load_export_immutable_and_site_scope(self):
        status, content, _ = self.api("POST", "/api/sites",
                  {"name": "Synth A", "address": "1 Synthetic Road"})
        self.assertEqual(status, 201)
        a = json.loads(content)["id"]
        status, content, _ = self.api("POST", "/api/sites",
                  {"name": "Synth B", "address": "2 Synthetic Road"})
        self.assertEqual(status, 201)
        b = json.loads(content)["id"]
        model = ModelValidationTest().model()
        status, content, _ = self.api("POST", f"/api/kss/sites/{a}/studies", model)
        self.assertEqual(status, 201, content)
        first = json.loads(content)
        self.assertEqual(first["revision"], 1)
        status, raw_events, _ = self.api("GET", "/api/kss/outbox")
        self.assertEqual(status, 200)
        events = json.loads(raw_events)
        # Other regression tests may share this class-level server and its
        # append-only outbox. Assert this study's receipt, not a global count.
        events_for_study = [e for e in events if e["study_id"] == first["id"]]
        self.assertEqual(len(events_for_study), 1)
        self.assertEqual(events_for_study[0]["event_type"], "kss.spatial.study.saved.v1")
        self.assertEqual(events_for_study[0]["state"], "pending")
        self.assertEqual(len(events_for_study[0]["payload_sha256"]), 64)
        url = f'/api/kss/sites/{a}/studies/{first["id"]}'
        status, content, _ = self.api("GET", url)
        self.assertEqual(status, 200)
        old = json.loads(content)
        self.assertEqual(old["model"]["parcel"]["width"], 80)
        status, svg, headers = self.api("GET", url+"/svg")
        self.assertEqual(status, 200)
        self.assertIn(b"PRELIMINARY CONCEPT ONLY", svg)
        self.assertIn(b"Workshop", svg)
        self.assertIn("attachment", headers["Content-Disposition"])
        status, pdf_content, pdf_headers = self.api("GET", url+"/pdf")
        self.assertEqual(status, 200)
        self.assertEqual(pdf_headers["Content-Type"], "application/pdf")
        self.assertTrue(pdf_content.startswith(b"%PDF-1.4"))
        self.assertIn(b"PRELIMINARY CONCEPT ONLY", pdf_content)
        self.assertIn(first["model_sha256"].encode(), pdf_content)
        self.assertIn(b"xref", pdf_content)
        self.assertIn("attachment", pdf_headers["Content-Disposition"])
        self.assertGreater(len(pdf_content), 1000)
        # Validate cross-reference offsets and object boundaries without
        # adding a third-party PDF dependency to the owned runtime.
        xref_at = int(pdf_content.split(b"startxref\n")[-1].split(b"\n")[0])
        self.assertEqual(pdf_content[xref_at:xref_at+4], b"xref")
        pdf_lines = pdf_content[xref_at:].split(b"\n")
        self.assertEqual(pdf_lines[1], b"0 7")
        for number in range(1, 7):
            offset = int(pdf_lines[number+2].split()[0])
            self.assertEqual(pdf_content[offset:offset+len(str(number))+6],
                             f"{number} 0 obj".encode())
        model["parcel"]["width"] = 100
        status, content, _ = self.api("POST", f"/api/kss/sites/{a}/studies", model)
        self.assertEqual(status, 201, content)
        self.assertEqual(json.loads(content)["revision"], 2)
        _, raw_events, _ = self.api("GET", "/api/kss/outbox")
        saved_events = [e for e in json.loads(raw_events) if e["site_id"] == a]
        self.assertEqual(len(saved_events), 2)
        self.assertEqual(len({e["study_id"] for e in saved_events}), 2)
        status, content, _ = self.api("GET", url)
        self.assertEqual(json.loads(content)["model"]["parcel"]["width"], 80)
        status, content, _ = self.api("GET", f"/api/kss/sites/{a}/studies")
        self.assertEqual([x["revision"] for x in json.loads(content)], [2, 1])
        status, _, _ = self.api("GET", f'/api/kss/sites/{b}/studies/{first["id"]}')
        self.assertEqual(status, 404)
        status, _, _ = self.api("GET", f'/api/kss/sites/{b}/studies/{first["id"]}/pdf')
        self.assertEqual(status, 404)
        status, _, _ = self.api("POST", "/api/kss/sites/SITE-NOTFOUND/studies", model)
        self.assertEqual(status, 404)

    def test_report_provenance_is_server_derived_site_scoped_and_frozen(self):
        a = json.loads(self.api("POST", "/api/sites",
                  {"name": "Report site A", "address": "11 Fiction Ave"})[1])["id"]
        b = json.loads(self.api("POST", "/api/sites",
                  {"name": "Report site B", "address": "12 Fiction Ave"})[1])["id"]
        status, payload, _ = self.api("POST", f"/api/sites/{a}/evidence",
                  {"category": "Aerial", "status": "verified",
                   "finding": "Operator classification, not independently audited"})
        self.assertEqual(status, 201, payload)
        status, payload, _ = self.api("POST", f"/api/sites/{a}/reports", {})
        self.assertEqual(status, 201, payload)
        ra = json.loads(payload)["id"]
        status, payload, _ = self.api("POST", f"/api/sites/{b}/reports", {})
        self.assertEqual(status, 201, payload)
        rb = json.loads(payload)["id"]
        path = f"/api/kss/sites/{a}/reports/{ra}/context"
        status, payload, _ = self.api("GET", path)
        self.assertEqual(status, 200, payload)
        context = json.loads(payload)
        self.assertEqual(len(context["snapshot_sha256"]), 64)
        self.assertEqual(context["evidence_counts"]["verified"], 1)
        self.assertEqual(context["evidence_status_authority"],
                         "site_planner_operator_recorded_not_independently_verified")
        self.assertFalse(context["spatial_ground_truth"])
        status, _, _ = self.api("GET", f"/api/kss/sites/{b}/reports/{ra}/context")
        self.assertEqual(status, 404)
        model = ModelValidationTest().model()
        model["source_report_id"] = rb
        status, _, _ = self.api("POST", f"/api/kss/sites/{a}/studies", model)
        self.assertEqual(status, 400)
        model["source_report_id"] = ra
        model["source_report_receipt"] = {
            "snapshot_sha256": "0" * 64,
            "evidence_counts": {"verified": 1000000}
        }
        status, payload, _ = self.api("POST", f"/api/kss/sites/{a}/studies", model)
        self.assertEqual(status, 201, payload)
        saved = json.loads(payload)
        self.assertEqual(saved["source_report_sha256"], context["snapshot_sha256"])
        status, payload, _ = self.api("GET",
                   f"/api/kss/sites/{a}/studies/{saved['id']}")
        self.assertEqual(status, 200, payload)
        frozen = json.loads(payload)
        receipt = frozen["model"]["source_report_receipt"]
        self.assertEqual(receipt["evidence_counts"]["verified"], 1)
        self.assertEqual(receipt["snapshot_sha256"], context["snapshot_sha256"])
        self.assertEqual(receipt["report_id"], ra)
        self.assertNotEqual(receipt["snapshot_sha256"], "0" * 64)
        status, payload, _ = self.api("POST", f"/api/sites/{a}/evidence",
                  {"category": "Topo", "status": "unverified",
                   "finding": "New evidence after snapshot"})
        self.assertEqual(status, 201, payload)
        _, payload, _ = self.api("GET", f"/api/kss/sites/{a}/studies/{saved['id']}")
        self.assertEqual(json.loads(payload)["model"]["source_report_receipt"],
                         receipt)
        _, payload, _ = self.api("GET", path)
        self.assertEqual(json.loads(payload)["evidence_counts"]["unverified"], 0)

    def test_wrong_source_report_is_rejected(self):
        status, content, _ = self.api("POST", "/api/sites",
                  {"name": "New Site", "address": "3 Synthetic Road"})
        sid = json.loads(content)["id"]
        model = ModelValidationTest().model()
        model["source_report_id"] = "REPORT-NOTREAL"
        code, content, _ = self.api("POST", f"/api/kss/sites/{sid}/studies", model)
        self.assertEqual(code, 400, content)
        model["source_report_id"] = ""
        model["objects"][0]["width"] = 1000
        code, content, _ = self.api("POST", f"/api/kss/sites/{sid}/studies", model)
        self.assertEqual(code, 400, content)


if __name__ == "__main__":
    unittest.main()
