#!/usr/bin/env python3
"""GEMS-006: predeclared independent-sampling-seed replication of GEMS-004
distance-matched random control vs 0m baseline.

Reuses GEMS-004's *training-only* hard-negative distance-bin histogram as a
FIXED geographic stratification target; no hard-negative candidate is fitted.
Replicates the training-sample draw, NOT unseen geographic validation.
Preserves GEMS-001/GEMS-002 and does not create a candidate or submit.
"""
import argparse
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import rasterio

import gems_004_hard_negative_ablation as hard
from gems_002_negative_ablation import (
    SEED, sample_indices, train_only_distances, verify_inputs,
    validate_organizer_grid, verify_original_model_source, score_pooled_terms)
from gems_002_segment_holdouts import (
    split_connected_faults, masks_for_fold, TRAIN_BUFFER, SCORE_CORRIDOR, FOLDS)
from gems_002_full_area_validation import full_scoreable_masks
from gems_cross_experiment_gate import (
    SCHEMA_004, validate_pooled, require, close)

REPLICATION_SEED = 1306  # Declared in source before seeing replication scores.
OUTPUT_SCHEMA = "evercraft.gems.independent-seed-matched-random-replication.v1"


def fingerprint(indices):
    return hashlib.sha256(np.asarray(indices, dtype="<i8").tobytes()).hexdigest()


def original_receipt_check(original):
    require(isinstance(original, dict) and
            original.get("schema") == SCHEMA_004 and
            original.get("seed") == SEED, "original_gems004_schema_or_seed_invalid")
    require(original.get("scored_submission_made") is False and
            original.get("model_promotion_allowed") is False and
            original.get("candidate_tif_created") is False and
            original.get("official_new_fault_dti") is None,
            "original_gems004_unsafe_claim")
    folds = original.get("fold_ledger")
    require(isinstance(folds, list) and len(folds) == FOLDS,
            "original_gems004_fold_count_invalid")
    for index, row in enumerate(folds):
        require(row.get("fold") == index and
                row.get("heldout_mapped_fault_pixels", 0) > 0,
                "original_gems004_fold_invalid")
        require(row.get("baseline_training_indices_sha256") and
                len(row["baseline_training_indices_sha256"]) == 64,
                "original_baseline_fingerprint_missing")
        counts = row.get("distance_matched_control_training", {})
        bins = counts.get("distance_bin_counts", [])
        require(isinstance(bins, list) and len(bins) > 0,
                "original_distance_bins_missing")
        seen = set()
        for bucket in bins:
            index_bin = bucket.get("bin")
            require(type(index_bin) is int and
                    0 <= index_bin <= len(hard.DISTANCE_BIN_EDGES) and
                    index_bin not in seen and
                    type(bucket.get("hard_count")) is int and
                    bucket["hard_count"] > 0 and
                    bucket["random_count"] == bucket["hard_count"],
                    "original_distance_bin_contract_invalid")
            seen.add(index_bin)
        require(sum(bucket["hard_count"] for bucket in bins) ==
                hard.HARD_PER_POSITIVE * row["baseline_training"]["positive_count"],
                "original_distance_bin_total_invalid")
    validate_pooled(original, "baseline", "full_area_baseline", "corridor_baseline")
    validate_pooled(original, "distance_matched_random",
                    "full_area_distance_matched_random_control",
                    "corridor_distance_matched_random")
    validate_pooled(original, "hard_mined", "full_area_hard_negative",
                    "corridor_hard_negative")


def sample_fixed_bin_control(labels, train, distances, pilot, source_row, fold):
    """Same 3P pilot negatives + 2P fresh, seed-1306 distance-bin random draw.

    Bin quotas were fixed by ORIGINAL GEMS-004 hard-mining *training-only*
    scores. This does not independently test the choice of bin distribution.
    """
    labels = np.asarray(labels, dtype=bool)
    train = np.asarray(train, dtype=bool)
    pilot = np.asarray(pilot, dtype=np.int64)
    distances = np.asarray(distances, dtype=float)
    p = int(np.count_nonzero(train & labels))
    require(p > 0 and pilot.shape == (6*p,) and
            np.array_equal(pilot[:p], np.flatnonzero(train & labels)) and
            len(np.unique(pilot)) == len(pilot), "replication_pilot_invalid")
    eligible = hard.mining_indices(labels, train, distances, pilot)
    edges = np.asarray(hard.DISTANCE_BIN_EDGES, dtype=float)
    pool_bins = np.searchsorted(edges, distances[eligible], side="right")
    original_bins = source_row["distance_matched_control_training"]["distance_bin_counts"]
    quotas = np.zeros(len(edges)+1, dtype=np.int64)
    for item in original_bins:
        quotas[item["bin"]] = item["hard_count"]
    require(int(quotas.sum()) == hard.HARD_PER_POSITIVE*p,
            "replication_quota_total_invalid")
    rng = np.random.default_rng(REPLICATION_SEED + 1009 + fold)
    chosen = []
    availability = []
    for bucket, amount in enumerate(quotas):
        pool = eligible[pool_bins == bucket]
        require(pool.size >= amount, "replication_distance_bin_unavailable")
        if amount:
            chosen.append(rng.choice(pool, size=int(amount), replace=False))
        availability.append(int(pool.size))
    extra = np.concatenate(chosen)
    selected = np.concatenate((pilot[:p+hard.RANDOM_PER_POSITIVE*p], extra))
    require(len(selected) == 6*p and len(np.unique(selected)) == len(selected) and
            np.all(train[selected]) and not np.any(labels[selected[p:]]),
            "replication_control_leakage")
    actual = np.bincount(
        np.searchsorted(edges, distances[extra], side="right"),
        minlength=len(quotas))
    require(np.array_equal(quotas, actual),
            "replication_distance_bin_mismatch")
    return selected, {
        "random_sampling_seed": REPLICATION_SEED + 1009 + fold,
        "replicated_fixed_bin_counts": quotas.tolist(),
        "eligible_fresh_count_by_bin": availability,
        "fresh_index_sha256": fingerprint(extra),
        "total_train": int(len(selected)),
    }


def execute(data, original_path, evidence):
    data, original_path, evidence = map(Path, (data, original_path, evidence))
    if evidence.exists() or evidence.is_symlink():
        raise FileExistsError("replication_evidence_must_be_new")
    original_bytes = original_path.read_bytes()
    original = json.loads(original_bytes)
    original_receipt_check(original)
    source = verify_original_model_source(Path(__file__).with_name("run.py"))
    manifest = verify_inputs(data)
    grid = validate_organizer_grid(data)
    require(original["source_sha256"] == source and
            original["input_manifest"] == manifest and
            original["grid"] == grid, "replication_source_drift")

    with rasterio.open(data/"existing_faults.tif") as f:
        raw = f.read(1)
    with rasterio.open(data/"example_submission.tif") as f:
        valid = np.isfinite(f.read(1))
    require(np.array_equal(valid, raw != -1), "replication_raster_mask_disagreement")
    south = int(np.quantile(np.where(valid)[0], .75))
    components, splits, fold_counts, inventory = split_connected_faults(
        raw, valid, south, seed=SEED)
    require(fold_counts == original["fold_counts"] and
            inventory == original["segment_inventory"],
            "replication_geographic_folds_drift")
    evidence.mkdir(parents=True, exist_ok=False)
    import run as reference
    reference.DATA = data
    reference.EVIDENCE = evidence
    matrix = reference.features(valid)
    require(matrix.shape == (int(valid.sum()), 34),
            "replication_34_feature_matrix_invalid")
    labels = raw[valid] == 1
    north = valid & (np.arange(valid.shape[0])[:, None] < south)
    north_flat = north[valid]
    ledger = []
    start = time.monotonic()
    for fold, ids in enumerate(splits):
        previous = original["fold_ledger"][fold]
        train_map, corridor, _, _ = masks_for_fold(
            components, ids, valid, south, TRAIN_BUFFER, SCORE_CORRIDOR)
        full, truth, known = full_scoreable_masks(
            components, ids, valid, south)
        require(int(truth.sum()) == previous["heldout_mapped_fault_pixels"] and
                len(ids) == previous["heldout_connected_segments"] and
                int(full.sum()) == previous["full_scoreable_pixels"] and
                int(corridor.sum()) == previous["corridor_scoreable_pixels"],
                "replication_holdout_geometry_drift")
        train = train_map[valid]
        require(not np.any(train & ~north_flat), "replication_south_training_leak")
        distances = train_only_distances(raw, valid, train)
        pilot, counts = sample_indices(
            labels, train, distances, 0, seed=REPLICATION_SEED)
        require(counts == previous["baseline_training"],
                "replication_training_population_drift")
        pilot_hash = fingerprint(pilot)
        require(pilot_hash != previous["baseline_training_indices_sha256"],
                "replication_seed_not_independent")
        model = hard.new_model()  # Hold the GEMS-001 architecture/seed fixed.
        model.fit(matrix[pilot], labels[pilot])
        baseline = hard.measure(
            reference, model, matrix, north_flat, north, truth, full,
            corridor, known)
        del model
        control, control_receipt = sample_fixed_bin_control(
            labels, train, distances, pilot, previous, fold)
        model = hard.new_model()
        model.fit(matrix[control], labels[control])
        matched = hard.measure(
            reference, model, matrix, north_flat, north, truth, full,
            corridor, known)
        del model
        ledger.append({
            "fold": fold, "heldout_mapped_fault_pixels": int(truth.sum()),
            "heldout_connected_segments": int(len(ids)),
            "full_scoreable_pixels": int(full.sum()),
            "corridor_scoreable_pixels": int(corridor.sum()),
            "baseline_training": counts,
            "original_baseline_training_indices_sha256":
                previous["baseline_training_indices_sha256"],
            "baseline_training_indices_sha256": pilot_hash,
            "distance_matched_control_training": control_receipt,
            "distance_matched_control_training_indices_sha256":
                fingerprint(control),
            "baseline": baseline, "distance_matched_random": matched,
        })
    def pooled(choice, region):
        terms = [row[choice][region+"_terms"] for row in ledger]
        return {"dti": score_pooled_terms(terms),
                **{key: sum(t[key] for t in terms)
                   for key in ("tp", "fp", "fn")}}
    b = pooled("baseline", "full")
    c = pooled("distance_matched_random", "full")
    result = {
        "schema": OUTPUT_SCHEMA,
        "reference_gems004_report_sha256":
            hashlib.sha256(original_bytes).hexdigest(),
        "source_sha256": source, "input_manifest": manifest, "grid": grid,
        "fold_assignment_seed": SEED, "model_seed": SEED,
        "replication_sampling_seed": REPLICATION_SEED,
        "heldout_fold_counts": fold_counts,
        "distance_quota_provenance":
            "FROZEN training-only hard-negative distance bin counts from original GEMS-004",
        "same_original_connected_fault_folds": True,
        "sampling_indices_changed_from_original_each_fold": True,
        "full_area_baseline": b,
        "full_area_distance_matched_random_control": c,
        "corridor_baseline": pooled("baseline", "corridor"),
        "corridor_distance_matched_random":
            pooled("distance_matched_random", "corridor"),
        "full_area_matched_minus_baseline": c["dti"]-b["dti"],
        "matched_control_wins_every_fold":
            all(r["distance_matched_random"]["full_dti"] >
                r["baseline"]["full_dti"] for r in ledger),
        "weighted_fp_outside_corridors": {
            choice: sum(row[choice]["full_terms"]["fp"] -
                        row[choice]["corridor_terms"]["fp"]
                        for row in ledger)
            for choice in ("baseline", "distance_matched_random")
        },
        "fold_ledger": ledger,
        "execution_elapsed_seconds": time.monotonic()-start,
        "new_geographic_validation": False,
        "unseen_new_fault_dti_known": False,
        "automatic_model_promotion_allowed": False,
        "scored_submission_made": False,
        "candidate_geotiff_created": False,
    }
    validate_pooled(result, "baseline", "full_area_baseline", "corridor_baseline")
    validate_pooled(result, "distance_matched_random",
                    "full_area_distance_matched_random_control",
                    "corridor_distance_matched_random")
    (evidence/"independent-seed-matched-control.json").write_text(
        json.dumps(result, indent=2, allow_nan=False)+"\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", required=True, type=Path)
    parser.add_argument("--original-gems004-report", required=True, type=Path)
    parser.add_argument("--evidence-dir", required=True, type=Path)
    args = parser.parse_args()
    receipt = execute(args.data_dir, args.original_gems004_report, args.evidence_dir)
    print(json.dumps({
        "baseline_proxy": receipt["full_area_baseline"]["dti"],
        "matched_random_proxy":
            receipt["full_area_distance_matched_random_control"]["dti"],
        "matched_minus_baseline":
            receipt["full_area_matched_minus_baseline"],
        "every_fold_matched_won":
            receipt["matched_control_wins_every_fold"],
        "new_geographic_validation": False,
        "scored_submission_made": False
    }, indent=2))
