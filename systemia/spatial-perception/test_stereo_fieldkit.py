"""V8 local field kit contract tests, Python stdlib only."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import stereo_fieldkit as kit


def fixture(root: Path):
    pairs=[]
    for i in range(10):
        left=f"pair_{i:02}_left.png"
        right=f"pair_{i:02}_right.png"
        for path in (left,right):
            (root/path).write_bytes(b"fixture-image-"+path.encode())
        pairs.append({"left":left,"right":right})
    return {
        "schema":kit.INPUT_SCHEMA,
        "sourceRights":"authorized_local_use",
        "rigId":"calibration-test-only",
        "checkerboard":{"columns":9,"rows":6,"squareSizeM":0.025},
        "pairs":pairs
    }


class StereoFieldKitContract(unittest.TestCase):
    def test_valid_private_manifest_filenames_and_board_size(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            data=fixture(root)
            rig,board,pairs=kit.calibration_inputs(data,root)
            self.assertEqual(rig,"calibration-test-only")
            self.assertEqual(board,(9,6,0.025))
            self.assertEqual(len(pairs),10)

    def test_traversal_and_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            data=fixture(root)
            data["pairs"][0]["left"]="../outside.png"
            with self.assertRaisesRegex(ValueError,"invalid_image_path"):
                kit.calibration_inputs(data,root)
            data=fixture(root)
            (root/"pair_00_left.png").unlink()
            (root/"pair_00_left.png").symlink_to(root/"pair_00_right.png")
            with self.assertRaisesRegex(ValueError,"missing_or_unsafe_image"):
                kit.calibration_inputs(data,root)

    def test_duplicate_pairs_fail_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            data=fixture(root)
            data["pairs"][1]["left"]=data["pairs"][0]["left"]
            with self.assertRaisesRegex(ValueError,"duplicate_or_self_pair"):
                kit.calibration_inputs(data,root)

    def test_missing_rights_or_insufficient_pairs_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            data=fixture(root)
            data["sourceRights"]="not_checked"
            with self.assertRaisesRegex(ValueError,"input_rights_or_schema_invalid"):
                kit.calibration_inputs(data,root)
            data=fixture(root)
            data["pairs"]=data["pairs"][:9]
            with self.assertRaisesRegex(ValueError,"invalid_pair_count"):
                kit.calibration_inputs(data,root)

    def test_malformed_board_dimensions_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            data=fixture(root)
            data["checkerboard"]["columns"]=True
            with self.assertRaisesRegex(ValueError,"invalid_checkerboard_columns"):
                kit.calibration_inputs(data,root)
            data=fixture(root)
            data["checkerboard"]["squareSizeM"]=float("nan")
            with self.assertRaisesRegex(ValueError,"invalid_square_size"):
                kit.calibration_inputs(data,root)

    def test_explicit_opt_ins_before_any_cv2_execution(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            src=root/"manifest.json";src.write_text(json.dumps(fixture(root)))
            out=root/"calibration.json"
            with self.assertRaisesRegex(ValueError,"source_authorization_required"):
                kit.calibrate(src,out,False)
            video=root/"video.avi";video.write_bytes(b"synthetic")
            with self.assertRaisesRegex(ValueError,"explicit_source_and_calibration_review_required"):
                kit.rectify(out,video,root/"rectified.avi",root/"receipt.json",False,True)
            with self.assertRaisesRegex(ValueError,"explicit_source_and_calibration_review_required"):
                kit.rectify(out,video,root/"rectified.avi",root/"receipt.json",True,False)

    def test_json_manifest_nonfinite_constant_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);p=root/"test.json"
            p.write_text('{"schema":"x","field":NaN}')
            with self.assertRaisesRegex(ValueError,"nonfinite_json"):
                kit.read_json(p)

    def test_sha256_uses_exact_local_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);p=root/"test.bin";p.write_bytes(b"camera-source")
            self.assertEqual(kit.sha256_file(p),hashlib.sha256(b"camera-source").hexdigest())


if __name__=="__main__":
    unittest.main()
