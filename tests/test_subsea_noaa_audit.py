"""Offline guardrail tests for NOAA Dive 02 archive inspector."""
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
import zipfile

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "audit-noaa-subsea-sources.py"
spec = importlib.util.spec_from_file_location("subsea_noaa_audit", SOURCE)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditTests(unittest.TestCase):
    def test_allowlist_only_https_archival_origin(self):
        self.assertTrue(audit.trusted_url("https://oer.hpc.msstate.edu/okeanos/ex2306/a.zip"))
        for bad in ("http://oer.hpc.msstate.edu/a.zip", "https://evil.example/a.zip",
                    "https://oer.hpc.msstate.edu.evil.example/a.zip",
                    "file:///etc/passwd", "https://someone@oer.hpc.msstate.edu/a.zip"):
            self.assertFalse(audit.trusted_url(bad))

    def test_kml_metadata_only_does_not_certify_positions(self):
        kml = b'''<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document><Placemark><gx:Track>
<when>2023-08-25T18:30:00Z</when><when>2023-08-25T18:30:10Z</when>
<gx:coord>-149.55 56.92 -1900</gx:coord><gx:coord>-149.56 56.93 -1901</gx:coord>
</gx:Track></Placemark></Document></kml>'''
        result = audit.inspect_kml(kml)
        self.assertEqual(result["kml_placemarks"], 1)
        self.assertEqual(result["kml_when_count"], 2)
        self.assertEqual(result["kml_gxcoord_count"], 2)
        self.assertEqual(result["vertical_datum"], "UNKNOWN")
        self.assertFalse(result["eligible_for_3d_replay"])

    def test_no_kml_implicit_track_from_untimed_geometry(self):
        kml = b'<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><LineString><coordinates>-149,56,0 -148,57,0</coordinates></LineString></Placemark></kml>'
        result = audit.inspect_kml(kml)
        self.assertEqual(result["kml_when_count"], 0)
        self.assertEqual(result["kml_coordinates_tokens_estimate"], 2)
        self.assertFalse(result["eligible_for_3d_replay"])

    def test_dtd_and_non_kml_rejected(self):
        with self.assertRaises(ValueError):
            audit.inspect_kml(b'<!DOCTYPE kml><kml/>')
        with self.assertRaises(ValueError):
            audit.inspect_kml(b'<root/>')

    def test_zip_reads_headers_without_unpacking_or_certifying(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr("Dive02/telemetry.csv", "utc,depth_m,heading\n2023-08-25T18:30:00Z,1901,45\n")
            z.writestr("Dive02/readme.txt", "This is a test record\n")
        result = audit.inspect_zip(output.getvalue())
        self.assertEqual(result["member_count"], 2)
        self.assertTrue(any("utc" in x["header_field_hints"] for x in result["header_hints_first_8"]))
        self.assertFalse(result["schema_verified"])
        self.assertFalse(result["eligible_for_3d_replay"])
        self.assertFalse(result["files_extracted"])

    def test_zip_traversal_rejected(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as z:
            z.writestr("../danger.csv", "value\n1\n")
        with self.assertRaises(ValueError):
            audit.inspect_zip(output.getvalue())

    def test_download_limit_enforced_in_stream(self):
        class FakeResponse:
            status = 200
            headers = {"Content-Type": "application/zip"}
            def __init__(self):
                self.count = 0
            def geturl(self):
                return "https://oer.hpc.msstate.edu/test.zip"
            def read(self, size):
                self.count += 1
                return b"a" * 1024 if self.count <= 2 else b""
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
        class FakeOpener:
            def open(self, request, timeout):
                return FakeResponse()
        with self.assertRaisesRegex(ValueError, "exceeds configured"):
            audit.retrieve("https://oer.hpc.msstate.edu/test.zip", 1500, opener=FakeOpener())


if __name__ == "__main__":
    unittest.main()
