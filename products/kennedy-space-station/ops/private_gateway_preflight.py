#!/usr/bin/env python3
"""Read-only safety preflight for a private KSS HTTPS operator gateway.

Does NOT install anything, configure DNS/TLS, bind sockets, contact a
domain, collect passwords or read secret contents.
"""
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent
CADDY = ROOT / "kennedy-private.Caddyfile.example"
SERVICE = ROOT / "kennedy-private.service.example"


def preflight():
    findings = []
    config = CADDY.read_text(encoding="utf-8")
    unit = SERVICE.read_text(encoding="utf-8")
    root = ROOT.parent
    if "basic_auth {" not in config:
        findings.append("Caddy does not require operator authentication")
    if "reverse_proxy 127.0.0.1:8811" not in config:
        findings.append("Caddy upstream is not local Kennedy port 8811")
    if "http://" in "\n".join(
        row for row in config.splitlines()
        if not row.lstrip().startswith("#")
    ):
        findings.append("Plain HTTP found in Caddy stage")
    if "{$KENNEDY_DOMAIN}" not in config:
        findings.append("Caddy hostname not explicitly configurable")
    if "Strict-Transport-Security" not in config:
        findings.append("HSTS missing")
    if "Environment=EVERCRAFT_SITE_HOST=127.0.0.1" not in unit:
        findings.append("Service non-loopback binding is not refused")
    if "User=EVERCRAFT_SERVICE_USER" not in unit:
        findings.append("Dedicated service-user placeholder missing")
    if "NoNewPrivileges=true" not in unit or "ProtectSystem=strict" not in unit:
        findings.append("Service hardening missing")
    if not (root / "server.py").exists():
        findings.append("Kennedy server missing")
    if not (root.parent / "site-planner" / "server.py").exists():
        findings.append("Canonical Site Planner backend missing")
    for k in ("KENNEDY_DOMAIN", "KENNEDY_OPERATOR_USER", "KENNEDY_PASSWORD_BCRYPT"):
        # Only test presence; never print values.
        if not os.getenv(k):
            findings.append(k + " not configured in current operator environment")
    domain = os.getenv("KENNEDY_DOMAIN", "")
    if domain and not re.fullmatch(r"(?=.{4,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}",domain):
        findings.append("KENNEDY_DOMAIN has invalid hostname syntax")
    if os.getenv("KENNEDY_PASSWORD_BCRYPT") and not re.fullmatch(r"\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}",os.getenv("KENNEDY_PASSWORD_BCRYPT", "")):
        findings.append("KENNEDY_PASSWORD_BCRYPT must be a Caddy-compatible bcrypt hash")
    if findings:
        print("KENNEDY PRIVATE GATEWAY: HOLD (" + str(len(findings)) + " prerequisite(s))")
        for item in findings:
            print(" - " + item)
        return 2
    print("KENNEDY PRIVATE GATEWAY: TEMPLATE PREFLIGHT PASS")
    print("Host ownership, DNS, actual TLS, live authentication, server process and phone access NOT verified.")
    print("No files or infrastructure were changed.")
    return 0


if __name__ == "__main__":
    sys.exit(preflight())
