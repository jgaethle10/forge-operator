import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from emit_kaidance_quality_receipt import produce


class KennedyKaidanceReceiptTests(unittest.TestCase):
    def fixture(self, directory):
        root = Path(directory)
        pdf = b"%PDF-1.4\n/Count 2\nPRIVATE SOURCE REVIEW\nNOT FOR EXTERNAL DELIVERY\n"
        (root / "kennedy-private-review-synthetic.pdf").write_bytes(pdf)
        meta = {
            "schema": "evercraft.kss.private-source-review.qa.v1",
            "fixture": "entirely_synthetic_owned_local_only",
            "pages": 2,
            "actual_vault_stored_bytes_used": True,
            "real_site_address": False,
            "human_visual_review": "not_performed",
            "external_release_authorized": False,
            "source_rights_independently_verified": False,
            "pdf_sha256": hashlib.sha256(pdf).hexdigest(),
        }
        raster = {
            "schema": "evercraft.kss.two-sheet-render-qa.v1",
            "status": "automated_pixel_qa_passed",
            "human_visual_qa": "not_performed",
            "real_licensed_source_qa": "not_performed",
            "release_authorized": False,
            "pages": [
                {"sheet": "S-0", "automated_pixel_qa": "passed"},
                {"sheet": "A-0", "automated_pixel_qa": "passed"},
            ],
        }
        self.save(root, "private-source-review-qa-receipt.json", meta)
        self.save(root, "private-review-render-qa-receipt.json", raster)
        return root, meta, raster

    @staticmethod
    def save(root, filename, value):
        (root / filename).write_text(json.dumps(value), encoding="utf-8")

    def test_synthetic_receipt_never_claims_human_or_real_site_readiness(self):
        with TemporaryDirectory() as folder:
            root, _, _ = self.fixture(folder)
            receipt = produce(root, "a" * 40)
            self.assertTrue(receipt["tests"]["render_test_passed"])
            self.assertFalse(receipt["tests"]["pdf_visual_review_passed"])
            self.assertFalse(receipt["authority"]["actual_development_completed"])
            self.assertFalse(receipt["authority"]["production_release_authorized"])
            self.assertEqual(receipt["source_rights_state"], "synthetic_fixture")
            digest = receipt["receipt_hash"]
            receipt["receipt_hash"] = None
            encoded = json.dumps(receipt, separators=(",", ":"), ensure_ascii=False).encode()
            self.assertEqual(digest, "sha256:" + hashlib.sha256(encoded).hexdigest())

    def test_source_hash_or_release_claim_breaks_proof(self):
        with TemporaryDirectory() as folder:
            root, meta, raster = self.fixture(folder)
            meta["external_release_authorized"] = True
            self.save(root, "private-source-review-qa-receipt.json", meta)
            with self.assertRaises(ValueError):
                produce(root, "a" * 40)
            meta["external_release_authorized"] = False
            self.save(root, "private-source-review-qa-receipt.json", meta)
            raster["human_visual_qa"] = "passed"
            self.save(root, "private-review-render-qa-receipt.json", raster)
            with self.assertRaises(ValueError):
                produce(root, "a" * 40)
            raster["human_visual_qa"] = "not_performed"
            self.save(root, "private-review-render-qa-receipt.json", raster)
            (root / "kennedy-private-review-synthetic.pdf").write_bytes(b"bad")
            with self.assertRaises(ValueError):
                produce(root, "a" * 40)


if __name__ == "__main__":
    unittest.main()
