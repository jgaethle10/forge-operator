#!/usr/bin/env python3
"""Research-only planner-to-runtime bridge for the fixed synthetic generator case.

The model proposes roles; policy checks the exact plan; the existing runner
executes its fixed analyst/auditor/supervisor pipeline. No dynamic tool dispatch.
"""
import argparse
import hashlib
import os
import json
from pathlib import Path
import re
import subprocess
import sys

from mission_planner import authorize, canonical

OBJECTIVE = "Investigate conflicting generator measurements, analyze the discrepancy, and independently review the findings."
REQUIRED_ROLES = {"analyst", "auditor"}
ALLOWED_ROLES = {"researcher", "analyst", "auditor"}

def verify_plan(plan):
    receipt = authorize(plan, OBJECTIVE)
    roles = {w["role"] for w in receipt["workers"]}
    if not REQUIRED_ROLES.issubset(roles) or not roles.issubset(ALLOWED_ROLES):
        raise ValueError("synthetic mission requires analyst and auditor")
    # Researcher is an unimplemented role, so refuse its execution.
    return receipt

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--plan-file", required=True, help="JSON plan, not an authorization receipt")
    p.add_argument("--mission-id", default="authorized-generator-001")
    p.add_argument("--db", default="~/.local/state/evercraft/saban-local-research/missions.sqlite3")
    p.add_argument("--endpoint", default="http://127.0.0.1:8080/v1/chat/completions")
    p.add_argument("--timeout", type=int, default=120)
    a = p.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", a.mission_id):
        p.error("invalid mission id")
    try:
        with open(a.plan_file, encoding="utf-8") as f:
            plan = json.load(f)
        receipt = verify_plan(plan)
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print(f"PLAN REJECTED: {exc}", file=sys.stderr)
        return 1
    # Bind plan identity to the mission ID, so a changed plan gets a different ID.
    derived_id = a.mission_id + "-" + receipt["plan_sha256"][:12]
    if len(derived_id) > 80:
        p.error("mission id too long after plan binding")
    # Persist authorization evidence before any model-backed execution.
    # On recovery, refuse a changed authorization receipt for the same mission.
    db_path = Path(a.db).expanduser()
    db_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    auth_path = db_path.parent / (derived_id + ".authorization.json")
    evidence = {
        "schema": "evercraft.saban.authorization-evidence.v1",
        "mission_id": derived_id,
        "objective": OBJECTIVE,
        "plan": plan,
        "authorization": receipt,
        "dispatch_mode": "fixed_synthetic_only",
        "executed_roles": ["analyst", "auditor", "supervisor"],
        "not_executed_roles": [w["role"] for w in receipt["workers"] if w["role"] == "researcher"],
    }
    serialized = canonical(evidence) + "\\n"
    if auth_path.exists():
        if auth_path.is_symlink() or auth_path.read_text(encoding="utf-8") != serialized:
            print("AUTHORIZATION EVIDENCE MISMATCH: refusing resume", file=sys.stderr)
            return 1
        print("REUSED AUTHORIZATION EVIDENCE:", auth_path, flush=True)
    else:
        temp_path = auth_path.with_name(auth_path.name + "." + str(os.getpid()) + ".tmp")
        try:
            # Exclusive create prevents replacing a preexisting temporary file.
            with open(temp_path, "x", encoding="utf-8") as f:
                f.write(serialized)
                f.flush()
                os.fsync(f.fileno())
            # Hard link gives create-if-absent behavior without replacing an existing authorization.
            try:
                os.link(temp_path, auth_path, follow_symlinks=False)
                print("COMMITTED AUTHORIZATION EVIDENCE:", auth_path, flush=True)
            except FileExistsError:
                if auth_path.is_symlink() or auth_path.read_text(encoding="utf-8") != serialized:
                    print("AUTHORIZATION EVIDENCE MISMATCH: refusing resume", file=sys.stderr)
                    return 1
        finally:
            temp_path.unlink(missing_ok=True)
    print("PLAN AUTHORIZED:", receipt["plan_sha256"], flush=True)
    print("DISPATCH: fixed synthetic analyst/auditor/supervisor pipeline", flush=True)
    print("RESEARCHER: plan-only; no evidence retrieval implemented", flush=True)
    command = [sys.executable, str(Path(__file__).with_name("local_mission_runner.py")),
               "--mission-id", derived_id, "--db", a.db, "--endpoint", a.endpoint,
               "--timeout", str(a.timeout)]
    return subprocess.call(command)

if __name__ == "__main__":
    raise SystemExit(main())
