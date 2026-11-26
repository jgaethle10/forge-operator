#!/usr/bin/env python3
"""Fungal Defense publication gate: no network access, no automatic deployment.

Status: preview_ready (source checks pass) is NOT public_approved.
For an owned node, run all validation scripts separately before requesting a
human review. A public release needs a signed-off, complete approval manifest.
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path

CHECKS = ("scientific", "privacy_security", "accessibility", "owned_runtime")
REQUIRED_EVIDENCE_PREFIX = "https://github.com/jgaethle10/forge-operator/"


def evaluate(manifest: object, requested_stage: str) -> dict:
    """Pure deterministic assessment. Missing, invalid, or vague evidence blocks."""
    reasons = []
    if not isinstance(manifest, dict):
        return {"status": "blocked", "can_publish": False,
                "reasons": ["Approval manifest must be an object"]}
    if manifest.get("schema") != "evercraft.fungal-defense.release-gates.v1":
        reasons.append("Manifest schema is not recognized")
    if manifest.get("project") != "FUNGAL-DEFENSE-001":
        reasons.append("Wrong project identity")
    if manifest.get("production_is_live") is True:
        reasons.append("Manifest may not assert production is live")
    if manifest.get("automated_publication") is not False:
        reasons.append("Automated publication must remain disabled")
    if manifest.get("dataset_not_live") is not True:
        reasons.append("Historical data must be explicitly marked non-live")
    reviews = manifest.get("reviews")
    if not isinstance(reviews, dict):
        reviews = {}
        reasons.append("Required review group missing")
    if requested_stage == "public":
        for name in CHECKS:
            review = reviews.get(name)
            if not isinstance(review, dict):
                reasons.append(f"{name}: review object missing")
                continue
            if review.get("approved") is not True:
                reasons.append(f"{name}: not approved")
            reviewer = review.get("reviewer")
            if not isinstance(reviewer, str) or len(reviewer.strip()) < 3:
                reasons.append(f"{name}: named reviewer missing")
            link = review.get("evidence_url")
            if not isinstance(link, str) or not link.startswith(REQUIRED_EVIDENCE_PREFIX):
                reasons.append(f"{name}: recorded repository evidence link missing")
            date = review.get("review_date")
            if not isinstance(date, str) or not re.fullmatch(r"20\d\d-\d\d-\d\d", date):
                reasons.append(f"{name}: dated review missing")
        if manifest.get("release_approval") is not True:
            reasons.append("Explicit public-release approval missing")
        if not isinstance(manifest.get("approved_commit"), str) or not re.fullmatch(r"[0-9a-f]{40}", manifest["approved_commit"]):
            reasons.append("Pinned reviewed 40-character Git commit missing")
    return {
        "schema": "evercraft.fungal-defense.release-decision.v1",
        "stage": requested_stage,
        "status": "blocked" if reasons else ("preview_ready" if requested_stage == "preview" else "public_approved"),
        "can_publish": requested_stage == "public" and not reasons,
        "reasons": reasons,
        "note": "This decision does not deploy anything and does not verify the authenticity of human approvals."
    }


def self_test() -> None:
    base = {"schema": "evercraft.fungal-defense.release-gates.v1",
            "project": "FUNGAL-DEFENSE-001",
            "production_is_live": False,
            "automated_publication": False,
            "dataset_not_live": True,
            "reviews": {k: {"approved": False, "reviewer": None,
                            "evidence_url": None, "review_date": None} for k in CHECKS},
            "release_approval": False,
            "approved_commit": None}
    assert evaluate(base, "preview")["status"] == "preview_ready"
    assert not evaluate(base, "preview")["can_publish"]
    assert evaluate(base, "public")["status"] == "blocked"
    complete = json.loads(json.dumps(base))
    for name in CHECKS:
        complete["reviews"][name] = {
            "approved": True, "reviewer": "Verified reviewer",
            "evidence_url": REQUIRED_EVIDENCE_PREFIX + "issues/1834",
            "review_date": "2026-11-09"}
    complete["release_approval"] = True
    complete["approved_commit"] = "0123456789012345678901234567890123456789"
    # This only proves the logic recognizes a fully populated fixture, not that
    # any real reviews occurred. The actual manifest remains unapproved.
    assert evaluate(complete, "public")["status"] == "public_approved"
    for key, value in [("dataset_not_live", False), ("automated_publication", True),
                       ("project", "WRONG"), ("production_is_live", True)]:
        invalid = json.loads(json.dumps(complete))
        invalid[key] = value
        assert evaluate(invalid, "public")["status"] == "blocked", key
    print("PASS: preview != release, public reviews required, invalid claims blocked")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest", type=Path,
                    default=Path(__file__).resolve().parent.parent / "release-gates.json")
    ap.add_argument("--stage", choices=("preview", "public"), default="public")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return 0
    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(json.dumps({"status": "blocked", "can_publish": False,
                          "reasons": ["Manifest unavailable or invalid: " + type(e).__name__]}, indent=2))
        return 2
    result = evaluate(manifest, args.stage)
    print(json.dumps(result, indent=2))
    return 0 if result["status"] != "blocked" else 2


if __name__ == "__main__":
    sys.exit(main())
