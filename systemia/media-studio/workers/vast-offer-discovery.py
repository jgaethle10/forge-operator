#!/usr/bin/env python3
"""Evercraft Vast.ai offer discovery. READ ONLY. No rentals, deletes, or charges.

Use VAST_API_KEY from a secure runtime environment, never from chat, git, or argv.
Requires Python 3 stdlib only. Vast API endpoint is configurable to accommodate
provider API revisions. Prints a sanitized summary of matching offers.
"""
import json
import os
import sys
import urllib.request
import urllib.error

API = os.environ.get("VAST_OFFERS_URL", "https://console.vast.ai/api/v0/bundles/")
KEY = os.environ.get("VAST_API_KEY", "")
if not KEY:
    sys.exit("VAST_API_KEY not configured; refusing to query. No changes made.")
if not API.startswith("https://"):
    sys.exit("VAST_OFFERS_URL must use HTTPS")
payload = {
    "verified": {"eq": True},
    "rentable": {"eq": True},
    "num_gpus": {"eq": 1},
    "gpu_name": {"eq": "RTX 4090"},
    "gpu_ram": {"gte": 23000},
    "cpu_ram": {"gte": 32000},
    "disk_space": {"gte": 100},
    "order": [["dph_total", "asc"]],
    "type": "on-demand",
    "limit": 25,
}
req = urllib.request.Request(
    API,
    data=json.dumps(payload).encode(),
    headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=20) as response:
        raw = json.load(response)
except urllib.error.HTTPError as exc:
    sys.exit(f"Vast offer discovery HTTP {exc.code}; no changes made")
except (urllib.error.URLError, TimeoutError, ValueError) as exc:
    sys.exit(f"Vast offer discovery failed ({type(exc).__name__}); no changes made")
offers = raw.get("offers", raw.get("instances", [])) if isinstance(raw, dict) else []
if not isinstance(offers, list):
    sys.exit("Unrecognized Vast offers response; no changes made")
def num(v):
    try: return round(float(v), 4)
    except (TypeError, ValueError): return None
summary = []
for x in offers:
    if not isinstance(x, dict): continue
    summary.append({
        "offer_id": x.get("id"),
        "gpu": x.get("gpu_name"),
        "gpu_count": x.get("num_gpus"),
        "vram_mb": x.get("gpu_ram"),
        "ram_mb": x.get("cpu_ram"),
        "disk_gb": x.get("disk_space"),
        "compute_usd_per_hour": num(x.get("dph_total")),
        "storage_usd_per_gb_month": num(x.get("storage_cost")),
        "reliability": num(x.get("reliability2")),
        "verified": x.get("verified"),
    })
print(json.dumps({"mode": "READ_ONLY", "rental_started": False,
                  "offers": summary}, indent=2))
