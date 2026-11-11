#!/usr/bin/env python3
"""Read-only source-drift sentinel for the official CDC C. auris overview.

Fetches only the allowlisted CDC URL in --online mode, or accepts a local
HTML fixture for deterministic tests. Reports whether the CDC overview's
headline year/count matches our *historical* pinned tracking snapshot.
Never updates the dataset, infers cases, or publishes health alerts.
"""
from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "cdc-cauris-clinical-annual.json"
CDC_URL = "https://www.cdc.gov/candida-auris/tracking-c-auris/index.html"
MAX_SOURCE_BYTES = 2_000_000
HEADLINE = re.compile(
    r"\bA total of\s+(?P<count>\d{1,3}(?:,\d{3})*|\d+)\s+clinical\s+cases\s+of\s+Candida\s+auris\b"
    r".{0,200}?\bwere reported to CDC in\s+(?P<year>20\d{2})\b",
    re.IGNORECASE,
)


class VisibleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skipped = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style", "noscript"):
            self.skipped += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript") and self.skipped:
            self.skipped -= 1

    def handle_data(self, data: str) -> None:
        if not self.skipped:
            self.parts.append(data)


def parse_headline(raw: bytes) -> tuple[int, int] | None:
    parser = VisibleText()
    parser.feed(raw.decode("utf-8", errors="replace"))
    text = " ".join(" ".join(parser.parts).split())
    match = HEADLINE.search(text)
    if not match:
        return None
    return int(match.group("year")), int(match.group("count").replace(",", ""))


def probe(raw: bytes, source_mode: str, checked_at: str) -> dict:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    tracking = next(item for item in data["datasets"] if item["id"] == "cdc_tracking_public")
    pinned = tracking["values"][-1]
    found = parse_headline(raw)
    status = "unverified"
    explanation = "CDC headline was not found in the expected format; manually review before making any change."
    if found:
        status = "match" if found == (pinned["year"], pinned["cases"]) else "source_drift"
        explanation = (
            "CDC overview headline matches the pinned historical tracking snapshot."
            if status == "match" else
            "Headline differs from pinned snapshot: investigate source date, revision and case definition manually."
        )
    return {
        "schema": "evercraft.fungal-defense.source-drift-receipt.v1",
        "checked_at": checked_at,
        "source_mode": source_mode,
        "source_url": CDC_URL,
        "source_content_sha256": hashlib.sha256(raw).hexdigest(),
        "pinned": {"year": pinned["year"], "clinical_cases": pinned["cases"]},
        "headline_observed": None if found is None else {"year": found[0], "clinical_cases": found[1]},
        "status": status,
        "explanation": explanation,
        "data_reviewed_at": data["reviewed_at"],
        "may_auto_publish": False,
        "is_outbreak_alert": False,
    }


def get_online() -> bytes:
    req = Request(CDC_URL, headers={"User-Agent": "EvercraftFungalDefenseSourceReview/0.1 (+public-data; read-only)"})
    with urlopen(req, timeout=15) as res:
        if res.status != 200:
            raise ValueError(f"Unexpected CDC HTTP status: {res.status}")
        ct = res.headers.get("Content-Type", "").lower()
        if "text/html" not in ct:
            raise ValueError(f"Unexpected CDC content type: {ct}")
        raw = res.read(MAX_SOURCE_BYTES + 1)
    if len(raw) > MAX_SOURCE_BYTES:
        raise ValueError("CDC source exceeds configured byte limit")
    return raw


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--fixture", type=Path, help="local CDC HTML snapshot (not live)")
    group.add_argument("--online", action="store_true", help="one read-only HTTPS request to the official CDC page")
    ap.add_argument("--output", type=Path, help="write local JSON receipt; never changes source data")
    args = ap.parse_args()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        raw = get_online() if args.online else args.fixture.read_bytes()
        if len(raw) > MAX_SOURCE_BYTES:
            raise ValueError("input source exceeds configured byte limit")
        receipt = probe(raw, "online" if args.online else "fixture", now)
    except (ValueError, OSError, HTTPError, URLError, json.JSONDecodeError) as exc:
        receipt = {
            "schema": "evercraft.fungal-defense.source-drift-receipt.v1",
            "checked_at": now,
            "source_mode": "online" if args.online else "fixture",
            "source_url": CDC_URL,
            "status": "source_unavailable",
            "explanation": f"No verified observation: {type(exc).__name__}",
            "may_auto_publish": False,
            "is_outbreak_alert": False,
        }
    output = json.dumps(receipt, indent=2) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    print(output, end="")
    return 0 if receipt["status"] == "match" else 2


if __name__ == "__main__":
    sys.exit(main())
