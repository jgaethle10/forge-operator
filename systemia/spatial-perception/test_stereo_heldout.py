"""Standard-library V9 held-out provenance and metric contract tests."""
import hashlib
from pathlib import Path
import tempfile
import unittest

import stereo_heldout as gate


def digest(value):
    return hashlib.sha256(value).hexdigest()


def inputs(root):
    pairs=[]
    for i in range(3):
        left=f"holdout-{i:02d}-left.png"
        right=f"holdout-{i:02d}-right.png"
        (root/left).write_bytes(f"heldout-left-{i}".encode())
        (root/right).write_bytes(f"heldout-right-{i}".encode())
        pairs.append({"left":left,"right":right})
    training={
        "schema":"evercraft.spatial-perception.stereo-calibration.v1",
        "rigId":"synthetic-rig",
        "checkerboard":{"columns":9,"rows":6,"squareSizeM":.025},
        "pairSources":[{
            "leftSha256":digest(f"training-l-{i}".encode()),
            "rightSha256":digest(f"training-r-{i}".encode())
        } for i in range(10)]
    }
    heldout={
        "schema":"evercraft.spatial-perception.heldout-checkerboards.v1",
        "rigId":"synthetic-rig","sourceRights":"authorized_local_use",
        "checkerboard":{"columns":9,"rows":6,"squareSizeM":.025},
        "pairs":pairs
    }
    return training,heldout


class HeldoutContractTests(unittest.TestCase):
    def test_separate_heldout_images_admitted(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            training,heldout=inputs(root)
            dims,files=gate.heldout_manifest(heldout,training,root)
            self.assertEqual(dims,(9,6))
            self.assertEqual(len(files),3)
            self.assertEqual(len(files[0][2]),64)

    def test_reusing_same_bytes_from_training_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            training,heldout=inputs(root)
            reused=(root/"holdout-00-left.png").read_bytes()
            training["pairSources"][1]["leftSha256"]=digest(reused)
            with self.assertRaisesRegex(ValueError,"heldout_reuses_calibration_images"):
                gate.heldout_manifest(heldout,training,root)

    def test_duplicate_heldout_image_bytes_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            training,heldout=inputs(root)
            (root/"holdout-01-left.png").write_bytes((root/"holdout-00-left.png").read_bytes())
            with self.assertRaisesRegex(ValueError,"heldout_duplicate_image_bytes"):
                gate.heldout_manifest(heldout,training,root)

    def test_rights_rig_and_checkerboard_mismatch_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            training,heldout=inputs(root)
            heldout["sourceRights"]="unchecked"
            with self.assertRaisesRegex(ValueError,"heldout_manifest_rights_or_schema"):
                gate.heldout_manifest(heldout,training,root)
            heldout["sourceRights"]="authorized_local_use"
            heldout["rigId"]="wrong"
            with self.assertRaisesRegex(ValueError,"heldout_rig_mismatch"):
                gate.heldout_manifest(heldout,training,root)
            heldout["rigId"]="synthetic-rig"
            heldout["checkerboard"]["rows"]=7
            with self.assertRaisesRegex(ValueError,"heldout_checkerboard_mismatch"):
                gate.heldout_manifest(heldout,training,root)

    def test_path_traversal_and_insufficient_pairs_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            training,heldout=inputs(root)
            heldout["pairs"][0]["left"]="../outside.png"
            with self.assertRaisesRegex(ValueError,"invalid_image_path"):
                gate.heldout_manifest(heldout,training,root)
            heldout["pairs"]=heldout["pairs"][:2]
            with self.assertRaisesRegex(ValueError,"heldout_pair_count"):
                gate.heldout_manifest(heldout,training,root)

    def test_finite_summary_reports_real_p95_including_max(self):
        x=gate.finite_summary([0,1,2,3,4])
        self.assertEqual(x["samples"],5)
        self.assertEqual(x["medianAbsVerticalPx"],2)
        self.assertEqual(x["meanAbsVerticalPx"],2)
        self.assertAlmostEqual(x["p95AbsVerticalPx"],3.8)
        self.assertEqual(x["maxAbsVerticalPx"],4)
        with self.assertRaisesRegex(ValueError,"invalid_epipolar_samples"):
            gate.finite_summary([])
        with self.assertRaisesRegex(ValueError,"invalid_epipolar_samples"):
            gate.finite_summary([0,float("nan")])

    def test_rights_and_heldout_attestation_before_model_loading(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            with self.assertRaisesRegex(ValueError,"heldout_rights_and_independence_attestation_required"):
                gate.evaluate(root/"notfound",root/"notfound2",root/"output",authorized_source=False)
            with self.assertRaisesRegex(ValueError,"heldout_rights_and_independence_attestation_required"):
                gate.evaluate(root/"notfound",root/"notfound2",root/"output",authorized_source=True)


if __name__=="__main__":
    unittest.main()
