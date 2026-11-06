"""Audit composition identity leakage using only observed UCI SuperCon rows.

Random row splits can place equivalent composition vectors in both train and
test. A composition-group split blocks this exact-identity leakage. This is
NOT a trained model comparison or a test of physical generalizability.

Dataset: Hamidieh (2018), UCI Superconductivty, DOI 10.24432/C53P47.
"""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

import numpy as np
import pandas as pd

URL = "https://archive.ics.uci.edu/static/public/464/superconductivty%2Bdata.zip"
PINNED_SHA256 = "87f4490d73390ff94ee01dbf0d7d32abc80b22f2c803d471765cfc46a9f6371e"
SEED = 20261029


def read_original_rows():
    req = urllib.request.Request(URL, headers={"User-Agent": "Evercraft-Science-Audit/0.3"})
    with urllib.request.urlopen(req, timeout=120) as stream:
        raw_zip = stream.read()
    digest = hashlib.sha256(raw_zip).hexdigest()
    if digest != PINNED_SHA256:
        raise ValueError(f"Checksum mismatch: {digest}")
    with zipfile.ZipFile(io.BytesIO(raw_zip)) as archive:
        matches = [path for path in archive.namelist() if path.split("/")[-1] == "unique_m.csv"]
        if len(matches) != 1:
            raise ValueError(f"Expected one unique_m.csv, got {len(matches)}")
        df = pd.read_csv(io.BytesIO(archive.read(matches[0])))
    if len(df) != 21263 or list(df.columns[-2:]) != ["critical_temp", "material"]:
        raise ValueError("Unexpected source structure")
    elements = df.iloc[:, :-2].to_numpy(dtype=np.float64)
    if not np.isfinite(elements).all() or (elements < 0).any():
        raise ValueError("Invalid elemental counts")
    norm = elements.sum(axis=1)
    if not (norm > 0).all():
        raise ValueError("Missing/zero composition")
    return df, np.round(elements / norm[:, None], decimals=10), digest


def leakage_stats(group, train, test):
    n_groups = int(group.max()) + 1
    in_train = np.zeros(n_groups, dtype=bool)
    in_test = np.zeros(n_groups, dtype=bool)
    in_train[group[train]] = True
    in_test[group[test]] = True
    overlap = in_train & in_test
    # Independently count overlapping group IDs using sorted unique sets.
    independent = np.intersect1d(np.unique(group[train]), np.unique(group[test]))
    if int(overlap.sum()) != len(independent):
        raise AssertionError("Group overlap verification failed")
    test_overlap = np.isin(group[test], independent).sum()
    return {
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "overlapping_compositions": int(overlap.sum()),
        "test_rows_with_exact_composition_in_train": int(test_overlap),
        "test_row_leakage_fraction": float(test_overlap / len(test)),
    }


def main():
    df, fractions, digest = read_original_rows()
    _, group = np.unique(fractions, axis=0, return_inverse=True)
    n = len(group)
    n_groups = int(group.max()) + 1
    rng = np.random.default_rng(SEED)

    # The same actual observations under two split policies.
    randomized = rng.permutation(n)
    n_train = round(0.8 * n)
    random_train, random_test = randomized[:n_train], randomized[n_train:]
    random_stats = leakage_stats(group, random_train, random_test)

    # A shuffled unique-group split with close-to-80/20 row allocation.
    group_order = rng.permutation(n_groups)
    group_counts = np.bincount(group, minlength=n_groups)
    first_test_group = int(np.searchsorted(
        np.cumsum(group_counts[group_order]), n_train, side="left"
    )) + 1
    train_ids = group_order[:first_test_group]
    heldout_ids = group_order[first_test_group:]
    if not len(heldout_ids):
        raise AssertionError("No held-out groups")
    is_train = np.isin(group, train_ids)
    group_train, group_test = np.flatnonzero(is_train), np.flatnonzero(~is_train)
    grouped_stats = leakage_stats(group, group_train, group_test)
    if grouped_stats["overlapping_compositions"] or grouped_stats["test_rows_with_exact_composition_in_train"]:
        raise AssertionError("Composition-group split leaks an exact composition")

    # A deliberately simple composition memorizer diagnoses the leakage mechanism.
    # This is not an optimized ML model or a valid model-quality comparison.
    tc = df["critical_temp"].to_numpy(dtype=float)
    sums = np.bincount(group[random_train], weights=tc[random_train], minlength=n_groups)
    sizes = np.bincount(group[random_train], minlength=n_groups)
    global_train_mean = float(tc[random_train].mean())
    means = np.full(n_groups, global_train_mean, dtype=float)
    np.divide(sums, sizes, out=means, where=sizes > 0)
    predictions = means[group[random_test]]
    memorizer_rmse = float(np.sqrt(np.mean((tc[random_test] - predictions) ** 2)))

    result = {
        "schema": "evercraft.supercon.split-integrity.v1",
        "original_source": "UCI Superconductivty Data, DOI 10.24432/C53P47",
        "source_sha256": digest,
        "license": "CC BY 4.0",
        "synthetic_task_data_used": False,
        "random_seed": SEED,
        "n_original_rows": n,
        "n_composition_groups": n_groups,
        "grouping": "normalized elemental count vector rounded to 10 decimal places",
        "random_row_split": random_stats,
        "composition_group_split": grouped_stats,
        "random_split_simple_composition_memorizer_rmse_K": memorizer_rmse,
        "independent_overlap_verification_passed": True,
        "interpretation": (
            "Exact composition can leak between training and test in random row splits. "
            "The group split prevents that specific leakage only. Other family-level "
            "correlation and physics/provenance confounding remain."
        ),
        "limitations": (
            "No frontier-model test, no scientific expert review, no paired ML model "
            "evaluation, and no demonstrated paid-task acceptance."
        ),
    }
    Path("supercon_split_receipt.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
