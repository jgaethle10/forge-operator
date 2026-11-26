#!/usr/bin/env python3
"""Check the offline observatory HTML against the canonical reviewed JSON.

This is a STATIC artifact integrity check. It does not fetch CDC data,
interpret emerging disease trends, or constitute a live public-health feed.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "cdc-cauris-clinical-annual.json"
HTML = ROOT / "observatory-v0.2.html"


def main() -> int:
    errors = []
    dataset = json.loads(DATA.read_text(encoding="utf-8"))
    html = HTML.read_text(encoding="utf-8")
    embedded_match = re.search(
        r'<script type="application/json" id="dataset-json">([\s\S]*?)</script>',
        html,
    )
    if embedded_match is None:
        errors.append("no embedded, offline source manifest")
    else:
        try:
            embedded = json.loads(embedded_match.group(1))
            if embedded != dataset:
                errors.append("HTML dataset differs from canonical JSON")
        except json.JSONDecodeError:
            errors.append("HTML embedded manifest is malformed JSON")
    required = [
        'id="source"',
        'id="year"',
        'id="sourceinfo"',
        'id="datatable"',
        "These figures must not be combined.",
        "There are no invented 2025–2026 data",
        "Evidence reviewed " + dataset["reviewed_at"],
        "RESEARCH PROTOTYPE · 0.2",
    ]
    for marker in required:
        if marker not in html:
            errors.append("missing UI/safety marker: " + marker)
    if re.search(r"<script\b[^>]*\bsrc\s*=", html, flags=re.I):
        errors.append("unexpected external JavaScript dependency")
    if re.search(r"<iframe\b", html, flags=re.I):
        errors.append("unexpected embedded remote content")
    if re.search(r"\bfetch\s*\(", html):
        errors.append("unexpected network call in offline prototype")
    if errors:
        print("FAIL: Observatory integrity")
        for e in errors:
            print("  - " + e)
        return 1
    print("PASS: offline UI manifest matches source JSON; citations, source-switch controls and safety labels present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
