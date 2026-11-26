"""GEMS-006 independent-seed replication: fail-closed synthetic regression suite.

All geophysical arrays and model inputs are fabricated here. No original
competition data, candidate, scored submission, or remote source access.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
from scipy.ndimage import distance_transform_edt, maximum_filter

import gems_004_hard_negative_ablation as hard
import gems_006_seed_replication as repeat


class IndependentSeedReplicationTests(unittest.TestCase):
    def test_seed_is_fixed_and_independent_of_original(self):
        self.assertEqual(repeat.REPLICATION_SEED, 1306)
        self.assertNotEqual(repeat.REPLICATION_SEED, hard.SEED)

    def test_fixed_original_bin_target_is_replayed_without_hard_model(self):
        labels = np.zeros(150, bool)
        labels[[1, 7]] = True
        train = np.ones(150, bool)
        train[120:] = False
        distances = np.full(150, 18., dtype=float)
        pilot = np.array([1, 7, *range(10, 20)])
        distances[20:28] = [12., 13., 22., 24., 44., 42., 110., 109.]
        target = {"distance_matched_control_training": {
            "distance_bin_counts": [
                {"bin": 0, "hard_count": 1, "random_count": 1},
                {"bin": 2, "hard_count": 1, "random_count": 1},
                {"bin": 3, "hard_count": 1, "random_count": 1},
                {"bin": 5, "hard_count": 1, "random_count": 1}]}}
        a, evidence = repeat.sample_fixed_bin_control(
            labels, train, distances, pilot, target, 1)
        b, other = repeat.sample_fixed_bin_control(
            labels, train, distances, pilot, target, 1)
        self.assertTrue(np.array_equal(a, b))
        self.assertEqual(evidence, other)
        self.assertEqual(a.shape, (12,))
        self.assertTrue(np.array_equal(a[:8], [1, 7, 10, 11, 12, 13, 14, 15]))
        self.assertEqual(evidence["replicated_fixed_bin_counts"][0], 1)
        self.assertEqual(evidence["replicated_fixed_bin_counts"][2], 1)
        self.assertEqual(evidence["replicated_fixed_bin_counts"][3], 1)
        self.assertEqual(evidence["replicated_fixed_bin_counts"][5], 1)
        self.assertTrue(np.all(a < 120))
        self.assertEqual(len(np.unique(a)), len(a))

    def test_bad_fixed_quota_fails_closed(self):
        labels = np.zeros(80, bool)
        labels[[1, 7]] = True
        train = np.ones(80, bool)
        distances = np.full(80, 18.)
        pilot = np.array([1, 7, *range(10, 20)])
        wrong = {"distance_matched_control_training":
                 {"distance_bin_counts": [{"bin": 1, "hard_count": 5}]}}
        with self.assertRaisesRegex(ValueError, "replication_quota_total_invalid"):
            repeat.sample_fixed_bin_control(
                labels, train, distances, pilot, wrong, 0)

    def test_full_synthetic_original_and_new_seed_replay(self):
        shape = (130, 160)
        raw = np.zeros(shape, dtype=np.int8)
        for row, col in [(5, 10), (8, 55), (20, 90), (32, 120),
                         (45, 15), (55, 65), (60, 120), (70, 30),
                         (85, 100)]:
            raw[row:row+16, col] = 1
        raw[93:115, 140] = 1
        valid = np.ones(shape, bool)
        y, x = np.indices(shape)
        matrix = np.column_stack([
            np.sin((x.ravel()+2*j)/15)
            + .2*np.cos((y.ravel()+j)/12)
            + .03*j + .002*y.ravel()
            for j in range(34)]).astype("float32")

        class Raster:
            def __init__(self, arr):
                self.arr = arr
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self, band):
                return self.arr.copy()

        def open_raster(path):
            name = Path(path).name
            if name == "existing_faults.tif":
                return Raster(raw)
            if name == "example_submission.tif":
                return Raster(valid.astype("float32"))
            raise AssertionError("synthetic_raster_only")

        def predict(model, features, subset, cols):
            return model.predict_proba(features[subset, :cols])[:, 1].astype("float32")

        def render(prob, threshold, ridge):
            r = np.where(prob >= threshold, prob, 0).astype("float32")
            if ridge:
                r *= prob >= maximum_filter(prob, size=3)*.94
            return r

        def score_setup(truth, region):
            weights = np.maximum(0, 1-distance_transform_edt(~truth)/3)
            return (1-weights)[region].astype("float32")

        def dti(prob, truth, region, weights):
            peaks = np.zeros_like(prob)
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    weight = 1-np.hypot(dr, dc)/3
                    np.maximum(peaks, np.roll(prob, (dr, dc), (0, 1))*weight,
                               out=peaks)
            tp = peaks[truth].sum(dtype="float64")
            fp = np.dot(prob[region].astype("float64"), weights)
            fn = truth.sum()-tp
            return float(tp/(tp+.2*fp+.8*fn+1e-12))

        ref = SimpleNamespace(features=lambda mask: matrix, predict=predict,
                              render=render, score_setup=score_setup, dti=dti)
        synthetic_manifest = {"synthetic": True}
        synthetic_grid = {"synthetic": True}
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            with patch.object(hard, "verify_original_model_source",
                              return_value="a"*64), \
                 patch.object(repeat, "verify_original_model_source",
                              return_value="a"*64), \
                 patch.object(hard, "verify_inputs",
                              return_value=synthetic_manifest), \
                 patch.object(repeat, "verify_inputs",
                              return_value=synthetic_manifest), \
                 patch.object(hard, "validate_organizer_grid",
                              return_value=synthetic_grid), \
                 patch.object(repeat, "validate_organizer_grid",
                              return_value=synthetic_grid), \
                 patch.object(hard.rasterio, "open", side_effect=open_raster), \
                 patch.dict(sys.modules, {"run": ref}):
                prior = hard.execute(root, root/"original")
                original_json = root/"original/hard-negative-full-area.json"
                result = repeat.execute(root, original_json, root/"replication")
                self.assertEqual(
                    result["reference_gems004_report_sha256"],
                    __import__("hashlib").sha256(original_json.read_bytes()).hexdigest())
                self.assertEqual(len(result["fold_ledger"]), 3)
                self.assertFalse(result["new_geographic_validation"])
                self.assertFalse(result["scored_submission_made"])
                self.assertEqual(result["replication_sampling_seed"], 1306)
                self.assertEqual(result["fold_assignment_seed"], hard.SEED)
                self.assertTrue(result["sampling_indices_changed_from_original_each_fold"])
                for new, old in zip(result["fold_ledger"], prior["fold_ledger"]):
                    self.assertEqual(new["heldout_mapped_fault_pixels"],
                                     old["heldout_mapped_fault_pixels"])
                    self.assertNotEqual(new["baseline_training_indices_sha256"],
                                        old["baseline_training_indices_sha256"])
                    self.assertEqual(
                        new["distance_matched_control_training"][
                            "replicated_fixed_bin_counts"],
                        [next((item["hard_count"] for item in
                               old["distance_matched_control_training"][
                                   "distance_bin_counts"] if item["bin"] == b), 0)
                         for b in range(len(hard.DISTANCE_BIN_EDGES)+1)])
                    self.assertEqual(
                        new["baseline"]["full_terms"]["tp"]+
                        new["baseline"]["full_terms"]["fn"],
                        old["heldout_mapped_fault_pixels"])
                with self.assertRaisesRegex(FileExistsError,
                                            "replication_evidence_must_be_new"):
                    repeat.execute(root, original_json, root/"replication")
                corrupted = root/"corrupt_original.json"
                fake = json.loads(original_json.read_text())
                fake["fold_ledger"][0]["baseline"]["full_terms"]["tp"] += 2
                corrupted.write_text(json.dumps(fake))
                with self.assertRaisesRegex(ValueError,
                                            "fold_metric_mismatch_full"):
                    repeat.execute(root, corrupted, root/"corrupt-result")


if __name__ == "__main__":
    unittest.main()
