#!/usr/bin/env python3
"""Fail-closed smoke gate for the *owned PNW v0.15* AIW read-only service.

Run against a private loopback service. This is NOT a probe of the separate
national hosted prototype and does not prove public deployment or live alerts.
No third-party dependencies, no network calls except the explicitly provided
base URL. The tool never writes data to the service.
"""
import argparse
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def fetch(base, path, method="GET", timeout=5):
    request = Request(base + path, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.status, response.headers.get("Content-Type", ""), response.read(2_000_000)
    except HTTPError as exc:
        return exc.code, exc.headers.get("Content-Type", ""), exc.read(2_000_000)


def check_json(base, path, expected_status=200, method="GET"):
    status, content_type, raw = fetch(base, path, method=method)
    assert status == expected_status, f"{method} {path}: HTTP {status}, expected {expected_status}"
    assert "application/json" in content_type.lower(), f"{path}: unexpected content type"
    return json.loads(raw)


def audit(base):
    checks = []
    health = check_json(base, "/healthz")
    assert health.get("status") == "ready"
    assert health.get("dataset_rows") == 21590
    assert health.get("national_complete") is False
    assert health.get("live_alerts_connected") is False
    checks.append("health_and_no_live_alert_claim")

    coverage = check_json(base, "/api/v1/coverage")
    assert coverage.get("schema") == "evercraft.aiw.v015.derived.v1"
    assert coverage.get("raw_records") == 21590
    assert coverage.get("official_classified_records") == 21589
    assert coverage.get("unclassified_records") == 1
    assert coverage.get("national_import_complete") is False
    assert coverage.get("last_live_emergency_check") is None
    assert coverage.get("repair_funding_coverage") == "not_linked"
    assert coverage.get("source_asset_sha256") == "c29c079d04817f85657fa3e8f7c7ea0b83d6809f5ed2dfb09b592f1e430ed8f4"
    assert coverage.get("yakima_county_records") == 531
    assert coverage.get("yakima_county_poor_condition") == 27
    checks.append("provenance_counts_and_explicit_limits")

    yakima = check_json(base, "/api/v1/bridges?state=WA&county=077&condition=P&limit=5")
    assert yakima["total_matching"] == 27 and 0 < len(yakima["items"]) <= 5
    assert all(item["state"] == "WA" and item["county_code"] == "077" and item["condition"] == "P" for item in yakima["items"])
    assert all(item.get("current_imminent_danger_verified") is None for item in yakima["items"])
    checks.append("yakima_condition_not_emergency")

    unclassified = check_json(base, "/api/v1/bridges?state=OR&condition=N")
    assert unclassified["total_matching"] == 1
    assert len(unclassified["items"]) == 1
    assert unclassified["items"][0]["bridge_id"] == "000013570-00286"
    assert unclassified["items"][0].get("current_imminent_danger_verified") is None
    checks.append("unclassified_record_retained")

    for path in (
        "/api/v1/bridges?state=XX",
        "/api/v1/bridges?state=ID&county=077",
        "/api/v1/bridges?limit=99999",
    ):
        check_json(base, path, 400)
    check_json(base, "/api/v1/bridge?state=OR&id=not-a-real-id", 404)
    for method in ("POST", "PUT", "DELETE"):
        check_json(base, "/api/v1/bridges", 405, method=method)
    checks.append("input_rejection_and_read_only")

    status, content_type, raw = fetch(base, "/atlas")
    assert status == 200 and "text/html" in content_type.lower()
    assert len(raw) > 1000
    checks.append("atlas_served")

    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8786",
                        help="Explicit service origin; default is loopback.")
    parser.add_argument("--allow-remote", action="store_true",
                        help="Permit explicit non-loopback HTTPS probe. Never sends credentials.")
    args = parser.parse_args()
    parsed = urlsplit(args.base_url)
    origin = parsed.scheme in ("http", "https") and bool(parsed.netloc) and not parsed.path and not parsed.query and not parsed.fragment
    if not origin:
        parser.error("--base-url must be a bare http(s) origin, without path, query or fragment")
    if parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
        if not args.allow_remote or parsed.scheme != "https":
            parser.error("remote probing requires HTTPS and --allow-remote")
    try:
        checks = audit(args.base_url.rstrip("/"))
        print(json.dumps({"result": "PASS", "service": args.base_url,
                          "scope": "owned_pnw_v015_only", "checks": checks}, indent=2))
        return 0
    except (AssertionError, ValueError, KeyError, TypeError, URLError, OSError) as exc:
        print(json.dumps({"result": "FAIL", "service": args.base_url,
                          "scope": "owned_pnw_v015_only", "reason": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
