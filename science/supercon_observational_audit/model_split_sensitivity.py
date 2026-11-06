"""Measured-data sensitivity to holdout protocol, NOT a model-failure benchmark.

Source: UCI Superconductivty, Hamidieh (2018), DOI 10.24432/C53P47,
CC BY 4.0. Uses original real measurements only.

This script is evidence of the split's impact on this estimator/seed only.
It does not establish that exact-match leakage alone causes an accuracy gap,
nor prove physical or scientific generalization.
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
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error

URL = "https://archive.ics.uci.edu/static/public/464/superconductivty%2Bdata.zip"
SHA256 = "87f4490d73390ff94ee01dbf0d7d32abc80b22f2c803d471765cfc46a9f6371e"
SEED = 20261029


def source_rows():
    req = urllib.request.Request(URL, headers={"User-Agent": "Evercraft-Science-Audit/0.5"})
    with urllib.request.urlopen(req, timeout=120) as stream:
        payload = stream.read()
    digest = hashlib.sha256(payload).hexdigest()
    if digest != SHA256:
        raise ValueError("UCI source checksum mismatch")
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        def csv(name):
            matching = [p for p in archive.namelist() if p.split("/")[-1] == name]
            if len(matching) != 1:
                raise ValueError(f"Expected one {name}")
            return pd.read_csv(io.BytesIO(archive.read(matching[0])))
        source = csv("unique_m.csv")
        features = csv("train.csv")
    if len(source) != 21263 or len(features) != 21263:
        raise ValueError("Unexpected number of UCI source records")
    y = source["critical_temp"].to_numpy(dtype=float)
    if not np.allclose(y, features["critical_temp"].to_numpy(dtype=float), atol=1e-8, rtol=0):
        raise ValueError("Unaligned original measurements")
    x = source.iloc[:, :-2].to_numpy(dtype=float)
    if not np.isfinite(x).all() or (x < 0).any() or not (x.sum(axis=1) > 0).all():
        raise ValueError("Invalid elemental composition counts")
    fractions = np.round(x / x.sum(axis=1, keepdims=True), decimals=10)
    _, group = np.unique(fractions, axis=0, return_inverse=True)
    return fractions, y, group, digest


def make_splits(group):
    n = len(group)
    groups = int(group.max()) + 1
    rng = np.random.default_rng(SEED)
    perm = rng.permutation(n)
    ntrain = round(0.8 * n)
    train, test = perm[:ntrain], perm[ntrain:]
    yield "row_random", train, test
    order = rng.permutation(groups)
    counts = np.bincount(group, minlength=groups)
    first = int(np.searchsorted(np.cumsum(counts[order]), ntrain, side="left")) + 1
    train_groups = order[:first]
    is_train = np.isin(group, train_groups)
    train_g, test_g = np.flatnonzero(is_train), np.flatnonzero(~is_train)
    if len(train_g) != ntrain or len(test_g) != len(test):
        raise AssertionError("Group split size has drifted")
    yield "composition_group", train_g, test_g


def main():
    x, y, group, sha = source_rows()
    results = {}
    for name, train, test in make_splits(group):
        train_groups = np.unique(group[train])
        test_groups = np.unique(group[test])
        overlap = np.intersect1d(train_groups, test_groups)
        predictor = HistGradientBoostingRegressor(
            max_iter=100,
            max_depth=4,
            learning_rate=0.1,
            l2_regularization=1.0,
            random_state=SEED,
        )
        predictor.fit(x[train], y[train])
        pred = predictor.predict(x[test])
        results[name] = {
            "train_rows": len(train), "test_rows": len(test),
            "exact_composition_groups_shared": len(overlap),
            "test_rows_with_training_composition": int(np.isin(group[test], overlap).sum()),
            "RMSE_K": float(np.sqrt(mean_squared_error(y[test], pred))),
            "MAE_K": float(mean_absolute_error(y[test], pred)),
        }
    if results["composition_group"]["exact_composition_groups_shared"] != 0:
        raise AssertionError("Composition group split leaked")
    if results["row_random"]["test_rows_with_training_composition"] != 1556:
        raise AssertionError("Random seeded split drifted")
    out = {
        "schema": "evercraft.supercon.measured-model-sensitivity.v1",
        "data": "21,263 observed UCI Superconductivty measurements",
        "data_sha256": sha, "synthetic_measurements_used": False,
        "seed": SEED,
        "features": "Normalized elemental-count vectors; no target-derived columns",
        "estimator": "HistGradientBoostingRegressor(max_iter=100,max_depth=4,learning_rate=0.1,l2_regularization=1.0)",
        "splits": results,
        "interpretation_limit": (
            "Different sample partitions imply different test populations; an RMSE gap "
            "alone does not identify the causal contribution of exact-composition overlap."
        ),
        "frontier_model_failure_tested": False,
        "expert_review_complete": False,
    }
    Path("supercon_model_sensitivity_receipt.json").write_text(json.dumps(out, indent=2)+"\n")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
