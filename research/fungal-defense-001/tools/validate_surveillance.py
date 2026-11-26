#!/usr/bin/env python3
"""Validate publicly sourced, aggregate C. auris annual data. No network calls.

Run:
    python3 research/fungal-defense-001/tools/validate_surveillance.py
    python3 research/fungal-defense-001/tools/validate_surveillance.py --self-test

Guardrails: this does not claim live surveillance, estimate suppressed cells,
or infer fungal outbreaks from trends.
"""
from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data" / "cdc-cauris-clinical-annual.json"
TRACKING = {
    2016: 48, 2017: 170, 2018: 329, 2019: 477, 2020: 766,
    2021: 1559, 2022: 2915, 2023: 4523, 2024: 6304,
}
MMWR = {2022: 2882, 2023: 4428, 2024: 6197}


def validate(doc: dict) -> list[str]:
    errors = []

    def require(condition: bool, description: str) -> None:
        if not condition:
            errors.append(description)

    require(doc.get("schema") == "evercraft.fungal-defense.public-surveillance.v1", "schema mismatch")
    require(doc.get("not_live") is True, "must explicitly label data non-live")
    require("2025 or 2026 projections" in doc.get("exclusions", []),
            "must explicitly exclude unverified 2025–2026 estimates")
    require(isinstance(doc.get("reviewed_at"), str) and len(doc["reviewed_at"]) == 10,
            "reviewed_at missing or malformed")

    datasets = doc.get("datasets")
    if not isinstance(datasets, list) or len(datasets) != 2:
        return errors + ["expected exactly two independently labeled source datasets"]

    expected = {"cdc_tracking_public": TRACKING, "cdc_mmwr_2026_corrected": MMWR}
    seen = set()
    for dataset in datasets:
        if not isinstance(dataset, dict):
            errors.append("dataset is not an object")
            continue
        key = dataset.get("id")
        if key not in expected:
            errors.append(f"unknown dataset ID: {key!r}")
            continue
        require(key not in seen, f"duplicate source: {key}")
        seen.add(key)
        uri = urlparse(dataset.get("source_url") or "")
        require(uri.scheme == "https" and uri.hostname == "www.cdc.gov",
                f"{key}: source URL must be an official CDC HTTPS link")
        require(bool(dataset.get("case_definition")), f"{key}: case definition required")
        require(bool(dataset.get("caveat")), f"{key}: source caveat required")
        values = dataset.get("values")
        if not isinstance(values, list):
            errors.append(f"{key}: values must be a list")
            continue
        found: dict[int, int] = {}
        observed_year_order = []
        for item in values:
            if not isinstance(item, dict):
                errors.append(f"{key}: invalid row")
                continue
            year, cases = item.get("year"), item.get("cases")
            if type(year) is not int or type(cases) is not int or cases < 0:
                errors.append(f"{key}: invalid year or nonnegative integer case count")
                continue
            require(year not in found, f"{key}: duplicate year {year}")
            found[year] = cases
            observed_year_order.append(year)
        require(observed_year_order == sorted(observed_year_order),
                f"{key}: years must be strictly sorted")
        require(found == expected[key],
                f"{key}: count/year drift from CDC verified snapshot; investigate manually before updating")
        require(dataset.get("expected_total") == sum(expected[key].values()),
                f"{key}: independently checked total mismatch")

    require(seen == set(expected), "one or more required datasets missing")
    suppression = doc.get("suppression", {})
    require("1 to 10" in suppression.get("restricted_values", []),
            "small-cell suppression rule removed")
    require("Never infer exact small-cell counts" in suppression.get("policy", ""),
            "small-cell inference guardrail removed")
    interpretation = doc.get("interpretation", {})
    require(bool(interpretation.get("investigational")), "missing investigational evidence category")
    require(bool(interpretation.get("unsupported")), "missing unsupported claims category")
    return errors


def self_test(valid_doc: dict) -> list[str]:
    failures = []
    mutations = [
        ("altered clinical count", lambda d: d["datasets"][0]["values"][-1].update(cases=7000)),
        ("invented next-year count", lambda d: d["datasets"][0]["values"].append({"year": 2025, "cases": 7200})),
        ("corrupt MMWR count", lambda d: d["datasets"][1]["values"][0].update(cases=2915)),
        ("remove suppression", lambda d: d["suppression"].update(restricted_values=[])),
        ("mark as live", lambda d: d.update(not_live=False)),
        ("remove source caveat", lambda d: d["datasets"][0].update(caveat="")),
        ("swap official URL", lambda d: d["datasets"][0].update(source_url="https://example.com/data")),
    ]
    for label, mutation in mutations:
        candidate = copy.deepcopy(valid_doc)
        mutation(candidate)
        if not validate(candidate):
            failures.append(f"FAILED TO DETECT: {label}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, default=DATA)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    try:
        doc = json.loads(args.file.read_text(encoding="utf-8"))
        errors = validate(doc)
        if args.self_test and not errors:
            errors.extend(self_test(doc))
    except (OSError, ValueError, TypeError, KeyError) as exc:
        errors = [str(exc)]
    if errors:
        print("FAIL: Fungal Defense source integrity validation")
        for error in errors:
            print(f"  - {error}")
        return 1
    print("PASS: two independent CDC source series, counts, definitions, non-live flag, and suppression guardrails")
    if args.self_test:
        print("PASS: detected seven unsafe/corrupt fixture mutations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
