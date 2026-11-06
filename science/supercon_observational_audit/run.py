"""UCI SuperCon observational consistency audit. Real data only.
Attribution: Hamidieh (2018), UCI Superconductivty Data, CC BY 4.0,
DOI 10.24432/C53P47. Independent scientific review still required.
"""
from __future__ import annotations
import hashlib
import io
import json
import pathlib
import urllib.request
import zipfile

import numpy as np
import pandas as pd

URL = "https://archive.ics.uci.edu/static/public/464/superconductivty%2Bdata.zip"
SHA256 = "87f4490d73390ff94ee01dbf0d7d32abc80b22f2c803d471765cfc46a9f6371e"


def main():
    request = urllib.request.Request(URL, headers={"User-Agent": "Evercraft-Science-Audit/0.2"})
    with urllib.request.urlopen(request, timeout=120) as stream:
        source = stream.read()
    digest = hashlib.sha256(source).hexdigest()
    if digest != SHA256:
        raise ValueError(f"Source checksum changed: {digest}")
    with zipfile.ZipFile(io.BytesIO(source)) as z:
        def load_csv(filename):
            paths = [name for name in z.namelist() if name.split("/")[-1] == filename]
            if len(paths) != 1:
                raise ValueError(f"Expected exactly one {filename}, found {len(paths)}")
            return pd.read_csv(io.BytesIO(z.read(paths[0])))
        raw, features = load_csv("unique_m.csv"), load_csv("train.csv")
    if len(raw) != 21263 or len(features) != 21263:
        raise ValueError("Unexpected dataset row count")
    if list(raw.columns[-2:]) != ["critical_temp", "material"] or features.columns[-1] != "critical_temp":
        raise ValueError("Unexpected dataset schema")
    y = raw["critical_temp"].to_numpy(dtype=float)
    if not np.allclose(y, features["critical_temp"].to_numpy(dtype=float), rtol=0, atol=1e-8):
        raise ValueError("Misaligned Tc values")
    counts = raw.iloc[:, :-2].to_numpy(dtype=float)
    if not np.isfinite(counts).all() or (counts < 0).any() or (counts.sum(axis=1) <= 0).any():
        raise ValueError("Invalid elemental composition")
    fractions = np.round(counts / counts.sum(axis=1, keepdims=True), 10)
    _, group = np.unique(fractions, axis=0, return_inverse=True)
    group_sizes = np.bincount(group)
    mean = np.bincount(group, weights=y) / group_sizes
    sse = float(np.dot(y - mean[group], y - mean[group]))
    mins = np.full(len(group_sizes), np.inf)
    maxs = np.full(len(group_sizes), -np.inf)
    np.minimum.at(mins, group, y)
    np.maximum.at(maxs, group, y)
    ranges = maxs - mins
    disagreement = (group_sizes > 1) & (ranges > 1e-8)
    independent_groups = {}
    for i in range(len(y)):
        independent_groups.setdefault(fractions[i].tobytes(), []).append(float(y[i]))
    independent_sse = float(sum(
        np.sum((np.asarray(values) - np.mean(values)) ** 2)
        for values in independent_groups.values()
    ))
    if len(independent_groups) != len(group_sizes) or not np.isclose(
        sse, independent_sse, rtol=1e-10, atol=1e-7
    ):
        raise AssertionError("Independent grouping/residual check failed")
    ranking = np.argsort(-ranges)
    examples = []
    for gid in ranking:
        if len(examples) >= 25:
            break
        if not disagreement[gid]:
            continue
        indices = np.flatnonzero(group == gid)
        examples.append({
            "row_ids_1_based": [int(i + 1) for i in indices[:30]],
            "formulas": sorted({str(raw["material"].iat[i]) for i in indices})[:12],
            "reported_Tc_values_K": sorted({float(y[i]) for i in indices})[:20],
            "range_K": float(ranges[gid]),
            "records": int(len(indices)),
        })
    result = {
        "schema": "evercraft.supercon.observed.v1",
        "dataset": "UCI Superconductivty Data",
        "doi": "10.24432/C53P47",
        "license": "CC BY 4.0",
        "source_sha256": digest,
        "synthetic_task_data_used": False,
        "n_rows": int(len(y)),
        "n_distinct_compositions": int(len(group_sizes)),
        "n_repeated_compositions": int((group_sizes > 1).sum()),
        "n_discordant_compositions": int(disagreement.sum()),
        "n_rows_in_discordant_compositions": int(group_sizes[disagreement].sum()),
        "n_zero_source_labels": int((y == 0).sum()),
        "best_in_sample_composition_only_RMSE_K": float(np.sqrt(sse / len(y))),
        "max_recorded_Tc_disagreement_K": float(max(ranges)),
        "independent_SSE_passed": True,
        "top_disagreement_groups": examples,
        "interpretation": "An in-sample dataset bound on one Tc value per stoichiometry, not a physical/generalization lower bound",
        "caveat": "Identical elemental composition does not imply identical phase, structure, pressure or measurement conditions",
    }
    pathlib.Path("supercon_audit_receipt.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "top_disagreement_groups"}, indent=2))


if __name__ == "__main__":
    main()
