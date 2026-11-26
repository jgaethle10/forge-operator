"""Fail-closed receipt-comparability tests. All data here are synthetic."""
import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from unittest.mock import patch

import gems_cross_experiment_gate as gate


def terms(tp, fp, fn):
    return {"tp": float(tp), "fp": float(fp), "fn": float(fn)}


def measure(tp, fp, fn, footprint=10):
    full = terms(tp, fp, fn)
    corridor = terms(tp, fp / 2, fn)
    return {
        "full_terms": full, "corridor_terms": corridor,
        "full_dti": gate.metric(full),
        "corridor_dti": gate.metric(corridor),
        "northern_positive_predictions": footprint,
        "selected_northern_pixels": footprint
    }


def pool(rows, choice, zone):
    totals = {k: sum(row[choice][zone + "_terms"][k] for row in rows)
              for k in ("tp", "fp", "fn")}
    return {"dti": gate.metric(totals), **totals}


def pair():
    a = {
        "schema": gate.SCHEMA_004,
        "source_sha256": "a" * 64,
        "input_manifest": {"features": {"sha256": "b" * 64}},
        "grid": {"crs": "EPSG:32611", "width": 3292, "height": 3730},
        "fold_counts": [3, 3, 3],
        "segment_inventory": {"groups": 9},
        "seed": 306,
        "scored_submission_made": False,
        "model_promotion_allowed": False,
        "candidate_tif_created": False,
        "official_new_fault_dti": None,
        "fold_ledger": []
    }
    b = {
        "schema": gate.SCHEMA_005,
        "original_source_sha256": "a" * 64,
        "official_raster_sha256": copy.deepcopy(a["input_manifest"]),
        "organizer_grid": copy.deepcopy(a["grid"]),
        "fold_counts": copy.deepcopy(a["fold_counts"]),
        "segment_inventory": copy.deepcopy(a["segment_inventory"]),
        "original_feature_count": 34, "augmented_feature_count": 38,
        "identical_training_samples_and_positive_labels": True,
        "selection_threshold": 0.2, "ridge": True,
        "negative_sampling_radius_pixels": 0,
        "submission_made": False,
        "automatic_promotion_allowed": False,
        "new_candidate_created": False,
        "hidden_new_fault_score_known": False,
        "fold_ledger": []
    }
    for index in range(3):
        base = measure(4 + index, 60 + index, 50 - (4 + index))
        indices = np.arange(index*600, (index+1)*600, dtype="<i8")
        selected_fingerprint = hashlib.sha256(indices.tobytes()).hexdigest()
        control = measure(4 + index, 55 + index, 50 - (4 + index))
        hard = measure(4 + index, 45 + index, 50 - (4 + index))
        directional = measure(5 + index, 51 + index, 50 - (5 + index))
        a["fold_ledger"].append({
            "fold": index, "heldout_connected_segments": 5,
            "heldout_mapped_fault_pixels": 50,
            "full_scoreable_pixels": 100000,
            "baseline_training": {"positive_count": 100,
                                  "eligible_negative_count": 100000,
                                  "sampled_negative_count": 500,
                                  "buffer_pixels": 0},
            "baseline_training_indices_sha256": selected_fingerprint,
            "baseline": copy.deepcopy(base),
            "distance_matched_random": control,
            "hard_mined": hard
        })
        b["fold_ledger"].append({
            "fold": index, "heldout_component_count": 5,
            "heldout_fault_pixels": 50,
            "full_area_scoreable_pixels": 100000,
            "training": {"positive_count": 100,
                         "eligible_negative_count": 100000,
                         "sampled_negative_count": 500,
                         "buffer_pixels": 0},
            "baseline_training_indices_sha256": selected_fingerprint,
            "baseline_34": copy.deepcopy(base),
            "directional_38": directional
        })
    for choice, full, corridor in [
        ("baseline", "full_area_baseline", "corridor_baseline"),
        ("distance_matched_random",
         "full_area_distance_matched_random_control",
         "corridor_distance_matched_random"),
        ("hard_mined", "full_area_hard_negative", "corridor_hard_negative")
    ]:
        a[full] = pool(a["fold_ledger"], choice, "full")
        a[corridor] = pool(a["fold_ledger"], choice, "corridor")
    for choice, full, corridor in [
        ("baseline_34", "full_area_original_34", "corridor_original_34"),
        ("directional_38", "full_area_directional_38", "corridor_directional_38")
    ]:
        b[full] = pool(b["fold_ledger"], choice, "full")
        b[corridor] = pool(b["fold_ledger"], choice, "corridor")
    a["full_area_gain"] = a["full_area_hard_negative"]["dti"] - a["full_area_baseline"]["dti"]
    a["hard_mining_gain_over_distance_control"] = (
        a["full_area_hard_negative"]["dti"] -
        a["full_area_distance_matched_random_control"]["dti"])
    b["full_area_dti_difference"] = (
        b["full_area_directional_38"]["dti"] -
        b["full_area_original_34"]["dti"])
    return a, b


class CrossExperimentTests(unittest.TestCase):
    def check(self, a, b):
        return gate.verify(a, b, "1" * 64, "2" * 64)

    def test_valid_identical_pooled_baseline_and_fold_geography(self):
        a, b = pair()
        result = self.check(a, b)
        self.assertTrue(result["same_source_grid_folds_samples_and_baseline"])
        self.assertTrue(result["all_three_folds_exact_ordered_training_pixels_sha256_matched"])
        self.assertTrue(result["fault_truth_conservation_verified_all_variants_and_regions"])
        self.assertEqual(
            set(result["weighted_fp_outside_heldout_1_5km_corridors"]),
            {"baseline","distance_matched_random","hard_negative","directional"})
        self.assertGreater(
            result["weighted_fp_outside_heldout_1_5km_corridors"]["baseline"], 0)
        self.assertEqual(result["hard_fold_wins_vs_distance_control"], 3)
        self.assertEqual(result["directional_fold_wins_vs_baseline"], 3)
        self.assertFalse(result["independent_new_fault_confirmation"])
        self.assertFalse(result["automatic_selection_or_submission_allowed"])

    def test_equal_counts_and_equal_scores_are_insufficient_for_pixel_identity(self):
        a, b = pair()
        # Only training-pixel identity changed. Every score/size stays identical.
        b["fold_ledger"][1]["baseline_training_indices_sha256"] = "f" * 64
        with self.assertRaisesRegex(ValueError, "baseline_training_pixel_identity_mismatch"):
            self.check(a, b)

    def test_missing_or_malformed_training_fingerprint_fails_closed(self):
        for invalid in (None, "", "A" * 64, "x" * 64, "a" * 63):
            with self.subTest(invalid=invalid):
                a, b = pair()
                b["fold_ledger"][0]["baseline_training_indices_sha256"] = invalid
                with self.assertRaisesRegex(ValueError,
                        "baseline_training_fingerprint_missing_or_malformed"):
                    self.check(a, b)
        a, b = pair()
        del a["fold_ledger"][0]["baseline_training_indices_sha256"]
        with self.assertRaisesRegex(ValueError,
                "baseline_training_fingerprint_missing_or_malformed"):
            self.check(a, b)

    def test_rejects_negative_delta_tampering_without_arithmetic_exception(self):
        a, b = pair()
        a["full_area_gain"] = -0.2
        with self.assertRaisesRegex(ValueError, "gems004_delta_mismatch"):
            self.check(a, b)
        a, b = pair()
        b["full_area_dti_difference"] = float("nan")
        with self.assertRaisesRegex(ValueError, "gems005_delta_mismatch"):
            self.check(a, b)

    def test_refuses_false_fault_detections_created_from_nothing(self):
        a, b = pair()
        # A fraudulently higher TP without the necessary corresponding lower FN
        # must fail even if the attacker recalculates the DTI consistently.
        row = a["fold_ledger"][0]["hard_mined"]
        row["full_terms"]["tp"] += 3.
        row["full_dti"] = gate.metric(row["full_terms"])
        with self.assertRaisesRegex(ValueError,
                "heldout_truth_conservation_failed_hard_mined_full"):
            self.check(a, b)

    def test_refuses_geography_dependent_truth_or_negative_off_corridor_fp(self):
        a, b = pair()
        row = b["fold_ledger"][1]["directional_38"]
        row["corridor_terms"]["tp"] -= 1.
        row["corridor_terms"]["fn"] += 1.
        row["corridor_dti"] = gate.metric(row["corridor_terms"])
        with self.assertRaisesRegex(ValueError, "heldout_truth_region_mismatch"):
            self.check(a, b)
        a, b = pair()
        row = a["fold_ledger"][0]["distance_matched_random"]
        row["corridor_terms"]["fp"] = row["full_terms"]["fp"] + 10.
        row["corridor_dti"] = gate.metric(row["corridor_terms"])
        with self.assertRaisesRegex(ValueError, "off_corridor_fp_negative"):
            self.check(a, b)

    def test_fails_if_baseline_differs_despite_positive_proxy_uplift(self):
        a, b = pair()
        b["fold_ledger"][1]["baseline_34"]["full_terms"]["fp"] += 1
        b["fold_ledger"][1]["baseline_34"]["full_dti"] = gate.metric(
            b["fold_ledger"][1]["baseline_34"]["full_terms"])
        with self.assertRaisesRegex(ValueError, "baseline_fold_terms_mismatch"):
            self.check(a, b)

    def test_rejects_mismatched_inputs_geometry_and_population(self):
        for path, value, error in [
            (("official_raster_sha256",), {"features": {"sha256": "bad"}}, "source_or_geography"),
            (("organizer_grid",), {"crs": "EPSG:4326"}, "source_or_geography"),
            (("fold_ledger", 1, "full_area_scoreable_pixels"), 999, "fold_geography"),
            (("fold_ledger", 1, "training", "sampled_negative_count"), 499, "fold_training")
        ]:
            with self.subTest(path=path):
                a, b = pair()
                target = b
                for part in path[:-1]:
                    target = target[part]
                target[path[-1]] = value
                with self.assertRaisesRegex(ValueError, error):
                    self.check(a, b)

    def test_rejects_fake_pooled_metric_and_modified_reported_delta(self):
        a, b = pair()
        a["full_area_baseline"]["fp"] += 10
        with self.assertRaisesRegex(ValueError, "pooled_component_mismatch"):
            self.check(a, b)
        a, b = pair()
        b["full_area_dti_difference"] += .03
        with self.assertRaisesRegex(ValueError, "gems005_delta_mismatch"):
            self.check(a, b)

    def test_rejects_bad_submission_and_hidden_score_claims(self):
        for key, value in (
            ("submission_made", True),
            ("hidden_new_fault_score_known", True),
            ("automatic_promotion_allowed", True)
        ):
            a, b = pair()
            b[key] = value
            with self.assertRaisesRegex(ValueError, "unsafe_gems005_state"):
                self.check(a, b)
        a, b = pair()
        a["official_new_fault_dti"] = .9
        with self.assertRaisesRegex(ValueError, "hidden_score_claimed"):
            self.check(a, b)

    def test_rejects_malformed_metrics_or_unmatched_fold_count(self):
        for bad in (float("nan"), float("inf"), -2, True):
            a, b = pair()
            a["fold_ledger"][0]["hard_mined"]["full_terms"]["fp"] = bad
            with self.assertRaises(ValueError):
                self.check(a, b)
        a, b = pair()
        b["fold_ledger"].pop()
        with self.assertRaisesRegex(ValueError, "fold_count_invalid"):
            self.check(a, b)

    def test_offline_cli_emits_once_only(self):
        a, b = pair()
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            g4, g5, out = (root / k for k in ("g4.json", "g5.json", "audit.json"))
            g4.write_text(json.dumps(a))
            g5.write_text(json.dumps(b))
            args = ["cross", "--gems004", str(g4), "--gems005", str(g5),
                    "--receipt", str(out)]
            with patch("sys.argv", args):
                gate.main()
                with self.assertRaisesRegex(ValueError, "output_must_be_new"):
                    gate.main()
            self.assertEqual(json.loads(out.read_text())["result"],
                             "comparable_proxy_research_only")


if __name__ == "__main__":
    unittest.main()
