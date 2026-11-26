#!/usr/bin/env python3
"""Verify that GEMS-004 and GEMS-005 measured the *same* full-area baseline.

Pure offline receipt audit. This does not access private rasters, fit a model,
estimate new-fault performance, create a candidate or submit to DrivenData.
"""
import argparse
import hashlib
import json
import math
import re
from pathlib import Path

SCHEMA_004 = "evercraft.gems.hard-negative-full-area-ablation.v1"
SCHEMA_005 = "evercraft.gems.directional-source-feature-ablation.v1"
OUTPUT_SCHEMA = "evercraft.gems.cross-experiment-verification.v1"


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def number(value):
    require(type(value) in (float, int) and math.isfinite(value) and value >= 0,
            "invalid_nonnegative_number")
    return float(value)


def close(a, b):
    return math.isclose(number(a), number(b), rel_tol=1e-10, abs_tol=1e-8)


def metric(terms):
    require(isinstance(terms, dict), "metric_terms_missing")
    tp, fp, fn = (number(terms[k]) for k in ("tp", "fp", "fn"))
    return tp / (tp + 0.2 * fp + 0.8 * fn + 1e-12)


def verify_measure(measure):
    require(isinstance(measure, dict), "fold_measure_missing")
    for zone in ("full", "corridor"):
        require(close(measure[zone + "_dti"], metric(measure[zone + "_terms"])),
                "fold_metric_mismatch_" + zone)
    return measure


def validate_pooled(report, choice, pooled_key, corridor_key):
    folds = report["fold_ledger"]
    measures = [verify_measure(row[choice]) for row in folds]
    for row, measure in zip(folds, measures):
        # Every model on a fold scores the SAME known held-out fault pixels.
        # DTI probability mass may move between TP/FN, but cannot invent or
        # remove ground-truth positives. Corridor contains the entire holdout.
        held = row.get("heldout_mapped_fault_pixels",
                       row.get("heldout_fault_pixels"))
        require(type(held) is int and held > 0, "heldout_fault_count_invalid")
        full = measure["full_terms"]
        corridor = measure["corridor_terms"]
        for zone, terms in (("full", full), ("corridor", corridor)):
            require(close(terms["tp"] + terms["fn"], held),
                    "heldout_truth_conservation_failed_" + choice + "_" + zone)
        require(close(full["tp"], corridor["tp"]) and
                close(full["fn"], corridor["fn"]),
                "heldout_truth_region_mismatch_" + choice)
        require(full["fp"] + 1e-8 >= corridor["fp"],
                "off_corridor_fp_negative_" + choice)
    for zone, key in (("full", pooled_key), ("corridor", corridor_key)):
        totals = {k: sum(number(m[zone + "_terms"][k]) for m in measures)
                  for k in ("tp", "fp", "fn")}
        actual = report[key]
        require(isinstance(actual, dict), "pooled_metric_missing")
        for k in ("tp", "fp", "fn"):
            require(close(actual[k], totals[k]), "pooled_component_mismatch_" + choice)
        require(close(actual["dti"], metric(totals)),
                "pooled_dti_mismatch_" + choice)
    return report[pooled_key]


def check_metadata(a, b):
    require(a.get("schema") == SCHEMA_004 and b.get("schema") == SCHEMA_005,
            "unexpected_ablation_schemas")
    for key in ("scored_submission_made", "model_promotion_allowed", "candidate_tif_created"):
        require(a.get(key) is False, "unsafe_gems004_state_" + key)
    for key in ("submission_made", "automatic_promotion_allowed",
                "new_candidate_created", "hidden_new_fault_score_known"):
        require(b.get(key) is False, "unsafe_gems005_state_" + key)
    require(a.get("official_new_fault_dti") is None, "hidden_score_claimed")
    for ka, kb in (("source_sha256", "original_source_sha256"),
                   ("input_manifest", "official_raster_sha256"),
                   ("grid", "organizer_grid"),
                   ("fold_counts", "fold_counts"),
                   ("segment_inventory", "segment_inventory")):
        require(a.get(ka) is not None and a[ka] == b.get(kb),
                "source_or_geography_mismatch_" + ka)
    require(b.get("original_feature_count") == 34 and
            b.get("augmented_feature_count") == 38 and
            b.get("identical_training_samples_and_positive_labels") is True,
            "directional_feature_contract_mismatch")
    require(a.get("seed") == 306 and b.get("selection_threshold") == 0.2,
            "model_protocol_mismatch")
    require(b.get("ridge") is True and b.get("negative_sampling_radius_pixels") == 0,
            "directional_baseline_protocol_mismatch")


def verify(a, b, sha004, sha005):
    check_metadata(a, b)
    la, lb = a.get("fold_ledger"), b.get("fold_ledger")
    require(isinstance(la, list) and isinstance(lb, list) and
            len(la) == len(lb) == 3, "fold_count_invalid")
    for index, (fa, fb) in enumerate(zip(la, lb)):
        require(fa.get("fold") == fb.get("fold") == index,
                "fold_order_mismatch")
        for ka, kb in (("heldout_connected_segments", "heldout_component_count"),
                       ("heldout_mapped_fault_pixels", "heldout_fault_pixels"),
                       ("full_scoreable_pixels", "full_area_scoreable_pixels")):
            require(fa.get(ka) == fb.get(kb), "fold_geography_mismatch_" + ka)
        for key in ("positive_count", "eligible_negative_count",
                    "sampled_negative_count", "buffer_pixels"):
            require(fa["baseline_training"][key] == fb["training"][key],
                    "fold_training_population_mismatch_" + key)
        # Equal counts and equal aggregate DTI do NOT prove identical pixels.
        # Reject older receipts that omit this evidence; require canonical
        # ordered little-endian i8 flattened-index SHA256 from both scripts.
        digest4 = fa.get("baseline_training_indices_sha256")
        digest5 = fb.get("baseline_training_indices_sha256")
        require(isinstance(digest4, str) and
                re.fullmatch(r"[0-9a-f]{64}", digest4) is not None and
                isinstance(digest5, str) and
                re.fullmatch(r"[0-9a-f]{64}", digest5) is not None,
                "baseline_training_fingerprint_missing_or_malformed")
        require(digest4 == digest5,
                "baseline_training_pixel_identity_mismatch")
        aa, bb = verify_measure(fa["baseline"]), verify_measure(fb["baseline_34"])
        require(fa["baseline"]["northern_positive_predictions"] ==
                fb["baseline_34"]["selected_northern_pixels"],
                "baseline_footprint_mismatch")
        for zone in ("full", "corridor"):
            for key in ("tp", "fp", "fn"):
                require(close(aa[zone + "_terms"][key], bb[zone + "_terms"][key]),
                        "baseline_fold_terms_mismatch_" + zone + "_" + key)

    baseline004 = validate_pooled(a, "baseline", "full_area_baseline", "corridor_baseline")
    control = validate_pooled(a, "distance_matched_random",
                              "full_area_distance_matched_random_control",
                              "corridor_distance_matched_random")
    hard = validate_pooled(a, "hard_mined", "full_area_hard_negative",
                           "corridor_hard_negative")
    baseline005 = validate_pooled(b, "baseline_34", "full_area_original_34",
                                  "corridor_original_34")
    directional = validate_pooled(b, "directional_38", "full_area_directional_38",
                                  "corridor_directional_38")
    for key in ("dti", "tp", "fp", "fn"):
        require(close(baseline004[key], baseline005[key]),
                "pooled_baseline_mismatch_" + key)
    # The full-area region is the consequential evaluation, not the 1.5km
    # corridor. Quantify additional weighted false-positive mass outside it.
    off_corridor_fp = {}
    for label, report, choice in (
        ("baseline", a, "baseline"),
        ("distance_matched_random", a, "distance_matched_random"),
        ("hard_negative", a, "hard_mined"),
        ("directional", b, "directional_38")):
        outside = sum(
            row[choice]["full_terms"]["fp"] -
            row[choice]["corridor_terms"]["fp"]
            for row in report["fold_ledger"])
        require(outside >= -1e-8, "off_corridor_fp_pooled_negative")
        off_corridor_fp[label] = max(0., outside)
    for reported, actual, reason in (
        (a["full_area_gain"], hard["dti"] - baseline004["dti"],
         "gems004_delta_mismatch"),
        (a["hard_mining_gain_over_distance_control"],
         hard["dti"] - control["dti"], "gems004_control_delta_mismatch"),
        (b["full_area_dti_difference"],
         directional["dti"] - baseline005["dti"], "gems005_delta_mismatch")):
        require(type(reported) in (int, float) and math.isfinite(reported)
                and math.isclose(reported, actual, rel_tol=1e-10, abs_tol=1e-8),
                reason)

    return {
        "schema": OUTPUT_SCHEMA,
        "gems004_evidence_sha256": sha004,
        "gems005_evidence_sha256": sha005,
        "official_input_sha256_verified_by_experiments": a["input_manifest"],
        "original_model_sha256": a["source_sha256"],
        "same_source_grid_folds_samples_and_baseline": True,
        "all_three_folds_exact_ordered_training_pixels_sha256_matched": True,
        "baseline_known_fault_proxy_dti": baseline004["dti"],
        "hard_negative_proxy_dti": hard["dti"],
        "distance_matched_random_proxy_dti": control["dti"],
        "directional_proxy_dti": directional["dti"],
        "hard_minus_distance_control": hard["dti"] - control["dti"],
        "directional_minus_baseline": directional["dti"] - baseline004["dti"],
        "weighted_fp_outside_heldout_1_5km_corridors": off_corridor_fp,
        "fault_truth_conservation_verified_all_variants_and_regions": True,
        "hard_fold_wins_vs_distance_control": sum(
            r["hard_mined"]["full_dti"] > r["distance_matched_random"]["full_dti"]
            for r in la),
        "directional_fold_wins_vs_baseline": sum(
            r["directional_38"]["full_dti"] > r["baseline_34"]["full_dti"]
            for r in lb),
        "only_reused_mapped_fault_development_folds": True,
        "independent_new_fault_confirmation": False,
        "official_dti_known_from_these_receipts": False,
        "automatic_selection_or_submission_allowed": False,
        "result": "comparable_proxy_research_only"
    }


def read_receipt(path):
    raw = Path(path).read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gems004", required=True, type=Path)
    parser.add_argument("--gems005", required=True, type=Path)
    parser.add_argument("--receipt", required=True, type=Path)
    args = parser.parse_args()
    require(not args.receipt.exists() and not args.receipt.is_symlink(),
            "output_must_be_new")
    a, h4 = read_receipt(args.gems004)
    b, h5 = read_receipt(args.gems005)
    result = verify(a, b, h4, h5)
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    with args.receipt.open("x", encoding="utf-8") as file:
        json.dump(result, file, indent=2, allow_nan=False)
        file.write("\n")
    print(json.dumps({"result": result["result"],
                      "baseline_verified": True,
                      "output": str(args.receipt),
                      "submission_made": False}))


if __name__ == "__main__":
    main()
