#!/usr/bin/env python3
"""Compatibility launcher. Lock ownership now belongs to local_mission_runner.py."""
import argparse
from pathlib import Path
import subprocess
import sys

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--mission-id", default="synthetic-generator-001")
    p.add_argument("--db", default="~/.local/state/evercraft/saban-local-research/missions.sqlite3")
    p.add_argument("--stop-after", choices=("analyst", "auditor", "supervisor"))
    p.add_argument("--endpoint", default="http://127.0.0.1:8080/v1/chat/completions")
    p.add_argument("--timeout", type=int, default=120)
    a = p.parse_args()
    command = [sys.executable, str(Path(__file__).with_name("local_mission_runner.py")),
               "--mission-id", a.mission_id, "--db", a.db,
               "--endpoint", a.endpoint, "--timeout", str(a.timeout)]
    if a.stop_after:
        command.extend(["--stop-after", a.stop_after])
    return subprocess.call(command)

if __name__ == "__main__":
    raise SystemExit(main())
