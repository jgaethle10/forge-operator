#!/usr/bin/env python3
"""Fail-closed integrity check for the distinct provisional NNDSS 2026 lane.

This checks an intentionally pinned, human-reviewed CDC snapshot. It does
not poll the CDC, derive infections from notifications or approve publication.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
PROVISIONAL = ROOT / "data" / "cdc-nndss-provisional-2026-w43.json"
HISTORICAL = ROOT / "data" / "cdc-cauris-clinical-annual.json"
PAGE = ROOT / "observatory-v0.3.html"
REQUIRED_CLINICAL = [(41, 6211, 5452), (42, 6379, 5584), (43, 6572, 5733)]
REQUIRED_SCREENING = [(43, 7202, 6896)]
EMBEDDED_RE = re.compile(r'<script type="application/json" id="([^"]+)">([\s\S]*?)</script>')


def validate(provisional: object, historical: object, html: str) -> list[str]:
    errors: list[str] = []

    def require(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    if not isinstance(provisional, dict) or not isinstance(historical, dict):
        return ["Dataset roots must be JSON objects"]

    require(provisional.get("schema") == "evercraft.fungal-defense.nndss-provisional.v1",
            "Provisional schema mismatch")
    require(provisional.get("status") == "provisional_not_final" and provisional.get("is_live") is False,
            "Provisional lane must be non-live and not final")
    require(provisional.get("scope") == "U.S. Residents, excluding U.S. Territories",
            "Provisional national reporting scope changed")
    require(provisional.get("reviewed_at") == "2026-11-09", "Pinned source review date changed")
    require(historical.get("schema") == "evercraft.fungal-defense.public-surveillance.v1"
            and historical.get("not_live") is True, "Historical source contract changed")
    require(set(item["id"] for item in historical.get("datasets", []))
            == {"cdc_tracking_public", "cdc_mmwr_2026_corrected"}, "Historical dataset identities changed")

    for category, expected in (("clinical", REQUIRED_CLINICAL), ("screening", REQUIRED_SCREENING)):
        entry = provisional.get(category)
        if not isinstance(entry, dict):
            errors.append(f"{category}: series missing")
            continue
        require(bool(entry.get("definition")), f"{category}: case definition missing")
        rows = entry.get("snapshots")
        if not isinstance(rows, list):
            errors.append(f"{category}: snapshots malformed")
            continue
        actual = []
        for row in rows:
            if not isinstance(row, dict):
                errors.append(f"{category}: malformed row")
                continue
            week = row.get("week")
            a, b = row.get("cumulative_2026"), row.get("same_week_cumulative_2025")
            require(all(type(x) is int and x >= 0 for x in (week, a, b)),
                    f"{category}: counts and week must be nonnegative integers")
            if not all(type(x) is int and x >= 0 for x in (week, a, b)):
                continue
            actual.append((week, a, b))
            url = urlparse(row.get("source_url") or "")
            require(url.scheme == "https" and url.hostname == "stacks.cdc.gov"
                    and url.path.startswith("/view/cdc/"), f"{category}: untrusted source URL")
            require(bool(re.fullmatch(r"2026-(?:10|11)-\d{2}", row.get("week_ending") or "")),
                    f"{category}: week-ending date missing")
        require(actual == expected, f"{category}: counts or weeks no longer match reviewed CDC snapshot")

    caveats = " ".join(provisional.get("caveats", []))
    for term in ("provisional", "decrease", "not directly comparable", "subtract", "jurisdiction"):
        require(term in caveats.lower(), f"Provisional caveat missing: {term}")

    policy = provisional.get("publication_policy", {})
    for setting in ("source_changes_require_manual_review", "no_automatic_case_updates",
                    "no_alarm_generation", "public_launch_approval_required",
                    "geographic_suppression_not_reconstructed"):
        require(policy.get(setting) is True, f"Safety flag disabled: {setting}")

    found = {}
    for key, data in EMBEDDED_RE.findall(html):
        if key in found:
            errors.append(f"Duplicate embedded dataset: {key}")
        try:
            found[key] = json.loads(data)
        except json.JSONDecodeError:
            errors.append(f"Embedded dataset malformed: {key}")
    require(found.get("dataset-json") == historical, "Historical embedded snapshot differs from canonical JSON")
    require(found.get("provisional-dataset") == provisional,
            "Provisional embedded snapshot differs from canonical JSON")
    for marker in ('id="provisionalType"', 'id="provisionalRows"', 'id="provisionalCurrent"',
                   'id="provisionalPrevious"', 'id="provisionalSource"',
                   "PROVISIONAL", "not finalized yearly cases"):
        require(marker in html, f"Provisional UI required marker missing: {marker}")
    require("Research Prototype 0.3" in html or "PROTOTYPE · 0.3" in html,
            "Expected prototype version missing")
    require(not re.search(r"<script\b[^>]*\bsrc\s*=", html, flags=re.I),
            "Remote JavaScript dependency in offline prototype")
    require(not re.search(r"\bfetch\s*\(", html), "Remote fetch in offline prototype")
    require(not re.search(r"<iframe\b", html, flags=re.I), "Embedded remote frame")
    return errors


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--provisional", type=Path, default=PROVISIONAL)
    ap.add_argument("--historical", type=Path, default=HISTORICAL)
    ap.add_argument("--page", type=Path, default=PAGE)
    args = ap.parse_args()
    try:
        provisional = json.loads(args.provisional.read_text(encoding="utf-8"))
        historical = json.loads(args.historical.read_text(encoding="utf-8"))
        html = args.page.read_text(encoding="utf-8")
        errors = validate(provisional, historical, html)
    except (OSError, ValueError, TypeError, KeyError) as e:
        errors = ["Unable to validate files: " + type(e).__name__]
    if errors:
        print("FAIL: NNDSS source separation and integrity")
        for e in errors:
            print("  - " + e)
        return 2
    print("PASS: distinct provisional NNDSS and historical series, official provenance and UI integrity")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
