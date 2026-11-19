#!/usr/bin/env python3
"""Bounded, manually initiated source-access canary for AIW.

This is NOT a national dataset importer, a proof of new inspections, or an
emergency-alert feed. It checks access to a small explicitly pinned set of
official source pages and saves independently reviewable receipts.

Uses only Python stdlib; rejects private destinations and cross-host redirects.
Does not run on a schedule or change existing production services.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import socket
import urllib.error
import urllib.parse
import urllib.request
import ipaddress
import secrets
import tempfile
import os

import aiw_kaidance_receipts as receipts

MAX_BYTES = 2 * 1024 * 1024
TIMEOUT = 8
ALLOWED_HOSTS = {"www.fhwa.dot.gov", "www.eia.gov", "echo.epa.gov"}


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def allowed_url(url):
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != "https" or parsed.username is not None
        or parsed.password is not None or parsed.port not in (None, 443)
        or parsed.hostname not in ALLOWED_HOSTS or not parsed.path):
        raise ValueError("Unapproved official source URL")
    return parsed.hostname


def official_address_check(host):
    # DNS is re-resolved by urllib; this is a best-effort SSRF check, not a
    # proof of a pinned network route. Run on an isolated unprivileged host.
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses:
        raise ValueError("No public address")
    for info in addresses:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise ValueError("Nonpublic destination address")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def probe(url):
    host = allowed_url(url)
    try:
        official_address_check(host)
        request = urllib.request.Request(url, headers={
            "User-Agent": "Evercraft-AIW-source-access-canary/0.1 (public evidence status; no scraping)",
            "Accept": "text/html,application/json,text/plain",
        })
        opener = urllib.request.build_opener(NoRedirect)
        with opener.open(request, timeout=TIMEOUT) as response:
            if response.status != 200:
                return "failed", None, "HTTP_NON_200"
            content_type = response.headers.get("Content-Type", "").split(";")[0].lower()
            if content_type not in ("text/html", "application/json", "text/plain"):
                return "failed", None, "UNEXPECTED_CONTENT_TYPE"
            data = response.read(MAX_BYTES + 1)
            if not data or len(data) > MAX_BYTES:
                return "failed", None, "EMPTY_OR_OVERSIZED"
            return "ok", hashlib.sha256(data).hexdigest(), None
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
        return "unavailable", None, "FETCH_UNAVAILABLE"
    except ValueError:
        return "failed", None, "UNSAFE_DESTINATION"


def cycle(registry):
    sources = receipts.source_registry(registry)
    if len(sources) > 3:
        raise ValueError("Manual canary is intentionally limited to three official sources")
    for url in sources.values():
        allowed_url(url)
    start = utc_now()
    observations = []
    for sid, url in sources.items():
        result, digest, error = probe(url)
        observations.append({
            "id": sid,
            "url": url,
            "result": result,
            "checked_at": utc_now(),
            "content_sha256": digest,
            "error_code": error,
        })
    return {
        "cycle_id": "manual-" + secrets.token_hex(7),
        "collector_id": "aiw-official-manual-canary",
        "started_at": start,
        "finished_at": utc_now(),
        "sources": observations,
    }


def atomic_json(path, data):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temp = tempfile.mkstemp(prefix=".aiw-manual-", dir=target.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, target)
    finally:
        Path(temp).unlink(missing_ok=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--registry", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--receipts", required=True, help="Write-once verified source-cycle receipt folder")
    a = p.parse_args()
    observation = cycle(a.registry)
    verified = receipts.validate_cycle(observation, receipts.source_registry(a.registry))
    atomic_json(a.output, observation)
    saved = receipts.record_receipt(a.registry, a.output, a.receipts)
    print(json.dumps({
        "cycle_id": saved["cycle_id"],
        "source_access_ok": verified["source_count_ok"],
        "source_count": verified["source_count_expected"],
        "all_sources_accessible": verified["cycle_complete"],
        "verification_scope": "bounded_manual_access_checks_only_not_new_infrastructure_data",
        "scheduled": False,
        "public_release_ready": False,
    }, indent=2))


if __name__ == "__main__":
    main()
