#!/usr/bin/env python3
"""Offline contract checks for Vast read-only discovery. Never calls Vast."""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

WORKER = Path(__file__).with_name("vast-offer-discovery.py")
source = WORKER.read_text()
assert '"type": "ondemand"' in source
assert '"gpu_name": {"in": ["RTX 4090"]}' in source
assert '"reliability": {"gte": 0.95}' in source
assert 'method="POST"' in source
assert "Bearer " in source
assert "PUT" not in source and "DELETE" not in source
assert "urllib.request.urlopen" in source

env = dict(os.environ)
env.pop("VAST_API_KEY", None)
r = subprocess.run([sys.executable, str(WORKER)], env=env, capture_output=True, text=True, timeout=10)
assert r.returncode != 0
assert "not configured" in r.stderr
assert "No changes made" in r.stderr
print(json.dumps({"schema": "evercraft.fallen.vast-discovery-contract.v1",
                  "offline_checks_passed": True,
                  "live_api_tested": False,
                  "rental_started": False}))
