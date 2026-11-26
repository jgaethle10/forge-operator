#!/usr/bin/env python3
"""GEMS-007: frozen north-to-south matched-random geographic transfer stress test.

The southern region was ALREADY SCORED in GEMS-002. This is reused-geography
transfer evidence, not untouched independent validation, hidden-new-fault truth,
or authorization for a competition submission. No directional/hard model fits.
"""
import argparse
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import rasterio
from scipy import ndimage

from gems_002_negative_ablation import (
    SEED, sample_indices, train_only_distances, verify_inputs,
    validate_organizer_grid, verify_original_model_source)
from gems_002_segment_holdouts import (
    split_connected_faults, TRAIN_BUFFER, SCORE_CORRIDOR)
from gems_004_hard_negative_ablation import (
    DISTANCE_BIN_EDGES, HARD_MIN_DISTANCE_PIXELS, HARD_PER_POSITIVE,
    RANDOM_PER_POSITIVE, mining_indices, new_model, measure)
from gems_006_seed_replication import (
    REPLICATION_SEED, original_receipt_check, fingerprint)
from gems_cross_experiment_gate import validate_pooled, require

SCHEMA = "evercraft.gems.frozen-southern-transfer-stress.v1"
QUOTA_SOURCE = "pooled GEMS-004 train-only matched-control hard-distance-bin quotas"
SEEDS = (SEED, REPLICATION_SEED)


def load_frozen_preregistration(gems004, gems006):
    """Original north-only reports fix the quota distribution before south scoring."""
    path4, path6 = Path(gems004), Path(gems006)
    for path in (path4, path6):
        require(path.is_file() and not path.is_symlink() and
                path.stat().st_size <= 10 * 1024 * 1024,
                "preregistration_receipt_missing_unsafe_or_oversized")
    bytes4, bytes6 = path4.read_bytes(), path6.read_bytes()
    a, b = json.loads(bytes4), json.loads(bytes6)
    original_receipt_check(a)
    require(b.get("schema") ==
            "evercraft.gems.independent-seed-matched-random-replication.v1",
            "gems006_schema_invalid")
    require(b.get("reference_gems004_report_sha256") ==
            hashlib.sha256(bytes4).hexdigest(),
            "gems006_not_bound_to_this_gems004_receipt")
    require(b.get("source_sha256") == a["source_sha256"] and
            b.get("input_manifest") == a["input_manifest"] and
            b.get("grid") == a["grid"] and
            b.get("heldout_fold_counts") == a["fold_counts"] and
            b.get("fold_assignment_seed") == SEED and
            b.get("model_seed") == SEED and
            b.get("replication_sampling_seed") == REPLICATION_SEED,
            "gems006_research_protocol_drift")
    for key in ("scored_submission_made", "automatic_model_promotion_allowed",
                "candidate_geotiff_created", "unseen_new_fault_dti_known",
                "new_geographic_validation"):
        require(b.get(key) is False, "gems006_unsafe_or_unsupported_" + key)
    validate_pooled(b, "baseline", "full_area_baseline", "corridor_baseline")
    validate_pooled(b, "distance_matched_random",
                    "full_area_distance_matched_random_control",
                    "corridor_distance_matched_random")
    require(len(b.get("fold_ledger", [])) == 3,
            "gems006_fold_count_invalid")

    quotas = np.zeros(len(DISTANCE_BIN_EDGES) + 1, dtype=np.int64)
    for fold, (old, new) in enumerate(zip(a["fold_ledger"], b["fold_ledger"])):
        require(old.get("fold") == new.get("fold") == fold,
                "preregistration_fold_order_drift")
        per_fold = np.zeros_like(quotas)
        for bucket in old["distance_matched_control_training"]["distance_bin_counts"]:
            per_fold[bucket["bin"]] = bucket["hard_count"]
        require(new["distance_matched_control_training"][
            "replicated_fixed_bin_counts"] == per_fold.tolist(),
            "gems006_frozen_quota_mismatch")
        quotas += per_fold
    require(int(quotas.sum()) > 0, "empty_northern_bin_quota")
    return a, {
        "gems004_report_sha256": hashlib.sha256(bytes4).hexdigest(),
        "gems006_report_sha256": hashlib.sha256(bytes6).hexdigest(),
        "north_quota_counts": quotas.tolist(),
        "north_quota_total": int(quotas.sum()),
    }


def allocate_frozen_quotas(north_bins, requested):
    """Largest-remainder allocation; stable tie break by ascending bin id."""
    counts = np.asarray(north_bins, dtype=np.int64)
    require(counts.shape == (len(DISTANCE_BIN_EDGES)+1,) and
            np.all(counts >= 0) and counts.sum() > 0 and
            type(requested) is int and requested > 0,
            "frozen_quota_inputs_invalid")
    fractions = counts.astype("float64") / int(counts.sum()) * requested
    chosen = np.floor(fractions).astype(np.int64)
    remainder = requested - int(chosen.sum())
    require(0 <= remainder <= len(counts), "quota_rounding_invalid")
    ranking = np.lexsort((np.arange(len(counts)), -(fractions-chosen)))
    chosen[ranking[:remainder]] += 1
    require(chosen.sum() == requested, "quota_allocation_sum_invalid")
    return chosen


def build_southern_masks(raw, valid):
    """No southern labels in training, with spatial and connected-fault embargo."""
    require(raw.shape == valid.shape and valid.ndim == 2 and
            valid.dtype == bool and np.array_equal(raw != -1, valid),
            "southern_raster_mask_invalid")
    south_start = int(np.quantile(np.where(valid)[0], .75))
    components, _, _, inventory = split_connected_faults(
        raw, valid, south_start, seed=SEED)
    southern = valid & (np.arange(valid.shape[0])[:, None] >= south_start)
    north = valid & ~southern
    truth = (raw == 1) & southern
    require(int(truth.sum()) >= 12, "insufficient_southern_mapped_fault_truth")
    # Entire crossing components are excluded, not just the portion south.
    crossing = np.unique(components[southern])
    crossing = crossing[crossing > 0]
    require(crossing.size > 0, "southern_fault_components_missing")
    heldout_components = np.isin(components, crossing)
    safe_from_components = (
        ndimage.distance_transform_edt(~heldout_components) > TRAIN_BUFFER)
    safe_from_south = (
        ndimage.distance_transform_edt(~southern) > TRAIN_BUFFER)
    train_map = north & safe_from_south & safe_from_components
    require(bool(np.any(train_map & (raw == 1))) and
            bool(np.any(train_map & (raw == 0))) and
            not bool(np.any(train_map & southern)) and
            not bool(np.any(train_map & heldout_components)),
            "southern_training_embargo_invalid")
    corridor = southern & (
        ndimage.distance_transform_edt(~truth) <= SCORE_CORRIDOR)
    require(np.all(truth <= corridor) and np.any(southern & ~truth),
            "southern_full_area_score_invalid")
    known = (raw == 1) & north
    return train_map, southern, truth, corridor, known, {
        "southern_start_row": south_start,
        "southern_scoreable_pixels": int(southern.sum()),
        "southern_mapped_fault_pixels": int(truth.sum()),
        "southern_corridor_pixels": int(corridor.sum()),
        "cross_boundary_or_southern_component_count": int(crossing.size),
        "train_buffer_pixels": TRAIN_BUFFER,
        "corridor_pixels": SCORE_CORRIDOR,
        "full_connected_component_southern_embargo": True,
        "training_pixels": int(train_map.sum()),
        "segment_inventory": inventory,
    }


def fresh_control_indices(labels, train, distances, pilot, quotas, seed):
    """3P seed-specific pilot negatives plus new 2P quota-stratified negatives."""
    labels = np.asarray(labels, dtype=bool)
    train = np.asarray(train, dtype=bool)
    pilot = np.asarray(pilot, dtype=np.int64)
    p = int((labels & train).sum())
    require(p > 0 and pilot.shape == (6*p,) and
            np.array_equal(pilot[:p], np.flatnonzero(labels & train)) and
            np.unique(pilot).size == pilot.size,
            "southern_pilot_identity_invalid")
    eligible = mining_indices(labels, train, distances, pilot)
    bins = np.searchsorted(
        np.asarray(DISTANCE_BIN_EDGES), distances[eligible], side="right")
    require(len(quotas) == len(DISTANCE_BIN_EDGES)+1 and
            int(np.sum(quotas)) == HARD_PER_POSITIVE*p,
            "southern_quota_total_invalid")
    rng = np.random.default_rng(seed + 1009 + 3)
    fresh, availability = [], []
    for bucket, count in enumerate(quotas):
        pool = eligible[bins == bucket]
        availability.append(int(pool.size))
        require(pool.size >= int(count), "frozen_bin_not_available_in_south_train")
        if count:
            fresh.append(rng.choice(pool, size=int(count), replace=False))
    extra = np.concatenate(fresh)
    control = np.concatenate((pilot[:p+RANDOM_PER_POSITIVE*p], extra))
    require(control.size == 6*p and
            np.unique(control).size == control.size and
            np.all(train[control]) and not np.any(labels[control[p:]]) and
            not np.intersect1d(extra, pilot).size and
            not np.any(distances[extra] <= HARD_MIN_DISTANCE_PIXELS),
            "southern_control_leakage_or_count_invalid")
    actual = np.bincount(np.searchsorted(
        np.asarray(DISTANCE_BIN_EDGES), distances[extra], side="right"),
        minlength=len(quotas))
    require(np.array_equal(actual, quotas),
            "frozen_southern_bins_changed")
    return control, {
        "pilot_indices_sha256": fingerprint(pilot),
        "control_indices_sha256": fingerprint(control),
        "fresh_indices_sha256": fingerprint(extra),
        "quota_counts": np.asarray(quotas, dtype=int).tolist(),
        "eligible_count_per_bin": availability,
        "sampling_seed": seed,
        "fresh_random_seed": seed + 1009 + 3,
    }


def execute(data_dir, original004, original006, evidence_dir):
    data, output = Path(data_dir), Path(evidence_dir)
    require(not output.exists() and not output.is_symlink(),
            "southern_evidence_output_must_be_new")
    a, freeze = load_frozen_preregistration(original004, original006)
    source = verify_original_model_source(Path(__file__).with_name("run.py"))
    manifest = verify_inputs(data)
    grid = validate_organizer_grid(data)
    require(source == a["source_sha256"] and
            manifest == a["input_manifest"] and grid == a["grid"],
            "southern_verified_source_drift")
    with rasterio.open(data/"existing_faults.tif") as f:
        raw = f.read(1)
    with rasterio.open(data/"example_submission.tif") as f:
        valid = np.isfinite(f.read(1))
    train_map, southern, truth, corridor, known, geography = (
        build_southern_masks(raw, valid))
    output.mkdir(parents=True, exist_ok=False)
    import run as reference
    reference.DATA = data
    reference.EVIDENCE = output
    matrix = reference.features(valid)
    require(matrix.shape == (int(valid.sum()), 34),
            "original_34_features_drift")
    labels = raw[valid] == 1
    train = train_map[valid]
    distances = train_only_distances(raw, valid, train)
    south_flat = southern[valid]
    ledger = []
    started = time.monotonic()
    for seed in SEEDS:
        pilot, sampling_counts = sample_indices(
            labels, train, distances, 0, seed=seed)
        p = sampling_counts["positive_count"]
        require(sampling_counts["sampled_negative_count"] == 5*p,
                "southern_5p_negative_population_shortfall")
        quota = allocate_frozen_quotas(
            freeze["north_quota_counts"], int(2*p))
        indices, control_receipt = fresh_control_indices(
            labels, train, distances, pilot, quota, seed)
        baseline_model = new_model()
        baseline_model.fit(matrix[pilot], labels[pilot])
        baseline = measure(reference, baseline_model, matrix, south_flat,
                           southern, truth, southern, corridor, known)
        del baseline_model
        control_model = new_model()
        control_model.fit(matrix[indices], labels[indices])
        matched = measure(reference, control_model, matrix, south_flat,
                          southern, truth, southern, corridor, known)
        del control_model
        # Do not pool two scores on the same geographic area as independent data.
        fold = {
            "fold": 0, "heldout_mapped_fault_pixels": int(truth.sum()),
            "baseline": baseline, "distance_matched_random": matched}
        per_seed = {
            "fold_ledger": [fold],
            "full_area_baseline": {
                "dti": baseline["full_dti"], **baseline["full_terms"]},
            "full_area_distance_matched_random_control": {
                "dti": matched["full_dti"], **matched["full_terms"]},
            "corridor_baseline": {
                "dti": baseline["corridor_dti"],
                **baseline["corridor_terms"]},
            "corridor_distance_matched_random": {
                "dti": matched["corridor_dti"],
                **matched["corridor_terms"]}}
        validate_pooled(per_seed, "baseline",
                        "full_area_baseline", "corridor_baseline")
        validate_pooled(per_seed, "distance_matched_random",
                        "full_area_distance_matched_random_control",
                        "corridor_distance_matched_random")
        ledger.append({
            "sampling_seed": seed,
            "model_seed": SEED,
            "training_counts": sampling_counts,
            "baseline_indices_sha256": fingerprint(pilot),
            "matched_training": control_receipt,
            "metrics": per_seed,
            "dti_delta": matched["full_dti"]-baseline["full_dti"],
            "weighted_fp_outside_corridors": {
                choice: measure_row["full_terms"]["fp"] -
                        measure_row["corridor_terms"]["fp"]
                for choice, measure_row in (
                    ("baseline", baseline),
                    ("distance_matched_random", matched))},
        })
    require(ledger[0]["baseline_indices_sha256"] !=
            ledger[1]["baseline_indices_sha256"],
            "southern_sample_seeds_failed_to_change_indices")
    report = {
        "schema": SCHEMA,
        "original_004_and_006_receipts": freeze,
        "source_sha256": source, "input_manifest": manifest,
        "grid": grid, "geography": geography,
        "model": "GEMS-001 34-feature HGB 100/.10/23 model seed 306",
        "training_sampling_seeds": list(SEEDS),
        "control_distance_bin_scheme": QUOTA_SOURCE,
        "full_area_scoring_region": "southern valid pixels, mapped faults only",
        "southern_previously_evaluated_in_gems002": True,
        "independent_geographic_holdout": False,
        "newly_discovered_fault_truth_available": False,
        "tuning_from_southern_scores_allowed": False,
        "candidate_created": False,
        "automatic_selection_allowed": False,
        "scored_submission_made": False,
        "seed_runs": ledger,
        "execution_elapsed_seconds": time.monotonic()-started,
    }
    (output/"southern-transfer-stress.json").write_text(
        json.dumps(report, indent=2, allow_nan=False)+"\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--gems004-report", type=Path, required=True)
    parser.add_argument("--gems006-report", type=Path, required=True)
    parser.add_argument("--evidence-dir", type=Path, required=True)
    args = parser.parse_args()
    result = execute(args.data_dir, args.gems004_report,
                     args.gems006_report, args.evidence_dir)
    print(json.dumps({
        "schema": result["schema"],
        "per_seed_dti_delta": {
            str(row["sampling_seed"]): row["dti_delta"]
            for row in result["seed_runs"]},
        "independent_geographic_holdout": False,
        "scored_submission_made": False,
        "no_automatic_selection": True,
    }, indent=2))
