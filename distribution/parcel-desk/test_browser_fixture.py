"""Pinned actual-browser ZIP fixture: never silently skip cross-runtime acceptance.

Generated via index.html sender UI in headless Chromium using purely synthetic
bytes. The fixture is base64 because this GitHub text-only write path accepts
UTF-8 files, not raw ZIP binaries. No network, customer data, or credentials.
"""
import base64
import binascii
import hashlib
from pathlib import Path
import tempfile
import unittest

from evercraft_parcel import restore_zip

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "browser-generated-v04.zip.b64"
ARCHIVE_SHA256 = "9626421c07deda0129a857fd3490f3c7f3ae24427bb8356fc77c187a65603f50"
ORIGINAL = b"EVERCRAFT_BROWSER_TO_PYTHON_CANARY_v1\n" + bytes(range(32)) + b"\x00END\n"
ORIGINAL_SHA256 = "64a431c873a93f4830b717ee57196a94896b96556403c9d501825fa54a5111cc"


class BrowserFixtureConformance(unittest.TestCase):
    def test_original_browser_archive_restores_without_skip(self):
        # Missing fixture is a hard failure, never a skipped test.
        self.assertTrue(FIXTURE.is_file(), "Missing browser-generated ZIP fixture; cannot claim browser/CLI compatibility")
        try:
            archive = base64.b64decode(FIXTURE.read_text(encoding="ascii").strip(), validate=True)
        except (ValueError, binascii.Error) as exc:
            self.fail(f"Invalid archived browser fixture encoding: {exc}")
        self.assertEqual(hashlib.sha256(archive).hexdigest(), ARCHIVE_SHA256)
        self.assertEqual(hashlib.sha256(ORIGINAL).hexdigest(), ORIGINAL_SHA256)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            packaged = root / "real-browser-sender-output.zip"
            packaged.write_bytes(archive)
            recovered = restore_zip(packaged, root / "received")
            self.assertEqual(recovered.name, "synthetic_browser_original.bin")
            self.assertEqual(recovered.read_bytes(), ORIGINAL)
            self.assertEqual(hashlib.sha256(recovered.read_bytes()).hexdigest(), ORIGINAL_SHA256)


if __name__ == "__main__":
    unittest.main()
