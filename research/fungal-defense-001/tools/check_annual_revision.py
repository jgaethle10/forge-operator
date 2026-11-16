#!/usr/bin/env python3
"""Validate the Nov 13, 2026 CDC annual revision and the evidence context in v0.4.

Runs entirely offline against pinned official-source snapshots. Does not
request CDC pages, update data, assess patient risk or approve a release.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
UPDATED = ROOT / "data" / "cdc-cauris-annual-2026-11-13.json"
ARCHIVE = ROOT / "data" / "cdc-cauris-clinical-annual.json"
PROVISIONAL = ROOT / "data" / "cdc-nndss-provisional-2026-w43.json"
PAGE = ROOT / "observatory-v0.4.html"
YEARS = list(range(2016, 2026))
COUNTS = [51, 171, 330, 477, 767, 1557, 2918, 4531, 6370, 8780]
JSON_SCRIPT = re.compile(
    r'<script type="application/json" id="([^"]+)">([\s\S]*?)</script>'
)


def validate(updated: object, archived: object, provisional: object, html: str) -> list[str]:
    errors: list[str] = []

    def check(condition: bool, reason: str) -> None:
        if not condition:
            errors.append(reason)

    if not all(isinstance(x, dict) for x in (updated, archived, provisional)):
        return ["Expected versioned CDC source documents as JSON objects"]

    check(updated.get("schema") == "evercraft.fungal-defense.cdc-annual-revision.v1",
          "Unexpected annual revision schema")
    check(updated.get("source_publication_date") == "2026-11-13",
          "Incorrect CDC publication date")
    check(updated.get("evidence_review_date") == "2026-11-15",
          "Incorrect source review date")
    parsed = urlparse(updated.get("source_url") or "")
    check(parsed.scheme == "https" and parsed.hostname == "www.cdc.gov"
          and parsed.path.rstrip("/") == "/candida-auris/tracking-c-auris",
          "Annual tracking source must be official CDC page")
    check(updated.get("is_live") is False and bool(updated.get("case_definition")),
          "Annual series misrepresented as live or case definition removed")
    check(updated.get("surveillance_years") == YEARS,
          "Annual year range changed without review")
    check(updated.get("yearly_clinical_cases") == COUNTS,
          "Revised CDC annual case counts drifted from pinned source")
    check(updated.get("total_2016_2025") == 25952
          and sum(COUNTS) == 25952, "Annual case series total wrong")
    check(updated.get("historical_archive_2024") == 6304
          and updated.get("revised_2024") == 6370
          and updated.get("difference_2024") == 66,
          "Old vs revised 2024 source figures confused")
    check(archived.get("schema") == "evercraft.fungal-defense.public-surveillance.v1"
          and archived.get("datasets", [{}])[0].get("values", [{}])[-1].get("cases") == 6304,
          "The immutable earlier tracking snapshot changed")
    check(provisional.get("schema") == "evercraft.fungal-defense.nndss-provisional.v1"
          and provisional.get("is_live") is False,
          "Provisional case category or scope changed")
    claim_states = {c.get("claim"):c.get("status") for c in updated.get("context", [])
                    if isinstance(c, dict)}
    check(claim_states.get("Candida auris is a newly discovered fungus in 2026") == "false",
          "Misleading brand-new fungus claim is no longer flagged")
    policy = updated.get("reporting_policy")
    check(isinstance(policy, dict)
          and all(policy.get(key) is True for key in
                  ("no_automatic_outbreak_alerts", "no_auto_publish",
                   "no_patient_or_facility_identification", "no_unsourced_forecasts")),
          "Evidence reporting safeguards missing")

    embedded = {}
    for key, text in JSON_SCRIPT.findall(html):
        if key in embedded:
            errors.append("Duplicate embedded dataset: " + key)
        try:
            embedded[key] = json.loads(text)
        except json.JSONDecodeError:
            errors.append("Invalid embedded JSON: " + key)
    for key, expected in (
        ("dataset-json", archived),
        ("provisional-dataset", provisional),
        ("revised-annual-data", updated),
    ):
        check(embedded.get(key) == expected, "Embedded source mismatch: " + key)

    for fragment in (
        "Research Prototype 0.4", 'id="revisedYear"',
        'id="revisedCaseCount"', 'id="revisedYearRows"',
        'id="revisedYearLabel"', "November 13, 2026",
        "2009", "November 2016", "not discovery of a new fungus",
        "8,780", "6,370", "6,304",
        "Archived surveillance snapshots",
    ):
        check(fragment in html, "Missing revision/time context marker: " + fragment)
    # The visible headline numbers must agree with the canonical latest source.
    # Static markup is checked separately from embedded JSON to catch an
    # accidentally stale or edited hero figure.
    check("<strong>8,780</strong>" in html,
          "Headline 2025 visible clinical count differs from reviewed CDC revision")
    check("<strong>6,370</strong>" in html,
          "Headline 2024 visible clinical count differs from reviewed CDC revision")
    check(not re.search(r"<script\b[^>]*\bsrc\s*=", html, flags=re.I),
          "Unexpected third-party JavaScript")
    check(not re.search(r"\bfetch\s*\(", html),
          "Unexpected frontend network request")
    check(not re.search(r"<iframe\b", html, flags=re.I),
          "Unexpected embedded iframe")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--updated", type=Path, default=UPDATED)
    parser.add_argument("--archived", type=Path, default=ARCHIVE)
    parser.add_argument("--provisional", type=Path, default=PROVISIONAL)
    parser.add_argument("--page", type=Path, default=PAGE)
    args = parser.parse_args()
    try:
        updated = json.loads(args.updated.read_text(encoding="utf-8"))
        archived = json.loads(args.archived.read_text(encoding="utf-8"))
        provisional = json.loads(args.provisional.read_text(encoding="utf-8"))
        html = args.page.read_text(encoding="utf-8")
        errors = validate(updated, archived, provisional, html)
    except (OSError, KeyError, ValueError, TypeError) as e:
        errors = ["Cannot validate files: " + type(e).__name__]
    if errors:
        print("FAIL: CDC Nov 13 revision / social claim context integrity")
        for error in errors:
            print(" - " + error)
        return 2
    print("PASS: newest annual revision separated from historic/provisional sources; origin and age of threat documented")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
