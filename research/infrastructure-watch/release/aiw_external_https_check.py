#!/usr/bin/env python3
"""Outside-in public website check, intended for a GitHub-hosted runner.

Reads only the public anonymous HTTPS endpoint. Requires valid public TLS.
Never touches a private Evercraft runtime or writes to the production edge.
"""
import json
import socket
import ssl
import sys
from urllib.request import Request, urlopen

HOST = "fabric.systemiacommandcenters.com"
BASE = f"https://{HOST}/infrastructure-watch/"
TIMEOUT = 12

def get(path):
    url = BASE + path
    req = Request(url, headers={"User-Agent":"Evercraft-AIW-External-Readiness-Check/1.0"})
    with urlopen(req, timeout=TIMEOUT, context=ssl.create_default_context()) as reply:
        body = reply.read(5_000_000)
        if len(body) >= 5_000_000: raise RuntimeError(f"{path} too large")
        print(f"OUTSIDE_IN_HTTP {path or '/'}={reply.status} bytes={len(body)}")
        if reply.status != 200: raise RuntimeError(f"{path}: non-200")
        return body

try:
    addrs = sorted(set(x[4][0] for x in socket.getaddrinfo(HOST, 443, type=socket.SOCK_STREAM)))
    print("PUBLIC_DNS_ADDRESSES=" + ",".join(addrs))
    page = get("").decode("utf8")
    if "American Infrastructure Watch" not in page:
        raise RuntimeError("Unexpected HTML: page title missing")
    if page.count('viewBox="0 0 64 64"') < 2:
        raise RuntimeError("Branded Evercraft icons missing from externally served HTML")
    states = json.loads(get("data/states.json"))
    if len(states.get("states",[])) != 52:
        raise RuntimeError("Expected 52 published state summaries")
    geo = json.loads(get("data/states.geojson"))
    if len(geo.get("features",[])) != 56:
        raise RuntimeError("Expected 56 boundaries")
    wa = json.loads(get("data/wa-summary.json"))
    if wa.get("records") != 8619 or wa.get("conditions",{}).get("P") != 403:
        raise RuntimeError("Expected Washington 2026 bridge summary")
    js = get("vendor/leaflet.js")
    if len(js) < 5000: raise RuntimeError("Mapping JavaScript unexpectedly short")
    print("PUBLIC_INTERNET_HTTPS=VERIFIED")
    print("PUBLIC_TLS_CERTIFICATE=VALIDATED")
    print("PUBLIC_BRANDING_AND_STATE_EVIDENCE=VERIFIED")
    print("NOTE: mobile layout and tap experience require separate browser QA")
except Exception as exc:
    print("PUBLIC_INTERNET_HTTPS=NOT_VERIFIED")
    print("EXTERNAL_ERROR=" + str(exc)[:400].replace("\n"," "))
    sys.exit(1)
