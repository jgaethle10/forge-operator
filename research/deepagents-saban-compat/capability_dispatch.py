#!/usr/bin/env python3
"""Research-only capability-driven dispatcher for synthetic generator records.

Only analyst and auditor are executable. Researcher is explicitly unsupported.
No shell, arbitrary Python, web access, or production Systemia integration.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time

from authorized_mission import OBJECTIVE, verify_plan
from mission_planner import canonical
from local_mission_runner import RECORDS, infer, validate, digest

IMPLEMENTATIONS = {
    "analyst": ("analyze_supplied_evidence", "analyst"),
    "auditor": ("review_worker_outputs", "auditor"),
}
SCHEMA = "evercraft.saban.capability-dispatch.v1"

def dispatch_roles(plan):
    authorization = verify_plan(plan)
    roles = [w["role"] for w in authorization["workers"]]
    unsupported = [r for r in roles if r not in IMPLEMENTATIONS]
    if unsupported:
        raise ValueError("no executable implementation for: " + ", ".join(unsupported))
    if roles != ["analyst", "auditor"]:
        raise ValueError("requires ordered analyst then auditor")
    for worker in authorization["workers"]:
        capability, _ = IMPLEMENTATIONS[worker["role"]]
        if worker["capabilities"] != [capability]:
            raise ValueError("exact executable capability required for " + worker["role"])
    return authorization

def run(plan, mission_id, db, endpoint, timeout):
    authorization = dispatch_roles(plan)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,60}", mission_id):
        raise ValueError("invalid mission id")
    if not re.fullmatch(r"http://(?:127\.0\.0\.1|localhost):[0-9]{1,5}/v1/chat/completions", endpoint):
        raise ValueError("only local model endpoint allowed")
    full_id = mission_id + "-" + authorization["plan_sha256"][:12]
    db = Path(db).expanduser()
    db.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if db.is_symlink():
        raise ValueError("database symlink refused")
    lock_fd = os.open(db.parent / (full_id + ".lock"), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("MISSION BUSY", flush=True)
            return 75
        return _run_locked(plan, authorization, full_id, db, endpoint, timeout)
    finally:
        os.close(lock_fd)

def _run_locked(plan, authorization, mission_id, db, endpoint, timeout):
    evidence = {
        "schema": SCHEMA, "mission_id": mission_id, "plan": plan,
        "authorization": authorization,
        "dispatch": [{"role": w["role"], "capability": IMPLEMENTATIONS[w["role"]][0]}
                     for w in authorization["workers"]],
        "records_sha256": hashlib.sha256(RECORDS.encode()).hexdigest(),
    }
    auth_path = db.parent / (mission_id + ".dispatch-authorization.json")
    expected = canonical(evidence) + "\n"
    if auth_path.is_symlink():
        raise ValueError("authorization evidence symlink refused")
    if auth_path.exists():
        if auth_path.read_text(encoding="utf-8") != expected:
            raise ValueError("authorization evidence mismatch")
        print("REUSED DISPATCH AUTHORIZATION:", auth_path, flush=True)
    else:
        temp = auth_path.with_name(auth_path.name + "." + str(os.getpid()) + ".tmp")
        try:
            with open(temp, "x", encoding="utf-8") as f:
                f.write(expected)
                f.flush()
                os.fsync(f.fileno())
            try:
                os.link(temp, auth_path, follow_symlinks=False)
            except FileExistsError:
                if auth_path.is_symlink() or auth_path.read_text(encoding="utf-8") != expected:
                    raise ValueError("authorization evidence mismatch")
        finally:
            temp.unlink(missing_ok=True)
        print("COMMITTED DISPATCH AUTHORIZATION:", auth_path, flush=True)
    conn = sqlite3.connect(db)
    started = time.monotonic()
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS dispatch_missions (id TEXT PRIMARY KEY, evidence_sha256 TEXT NOT NULL)")
        conn.execute("""CREATE TABLE IF NOT EXISTS dispatch_stages
            (mission_id TEXT NOT NULL, role TEXT NOT NULL, payload TEXT NOT NULL,
             sha256 TEXT NOT NULL, PRIMARY KEY(mission_id,role))""")
        evidence_hash = hashlib.sha256(expected.encode()).hexdigest()
        row = conn.execute("SELECT evidence_sha256 FROM dispatch_missions WHERE id=?", (mission_id,)).fetchone()
        if row and row[0] != evidence_hash:
            raise ValueError("mission authorization mismatch")
        if not row:
            conn.execute("INSERT INTO dispatch_missions VALUES (?,?)", (mission_id, evidence_hash))
            conn.commit()
        prior = {}
        for worker in authorization["workers"]:
            role = worker["role"]
            capability, implementation = IMPLEMENTATIONS[role]
            saved = conn.execute("SELECT payload,sha256 FROM dispatch_stages WHERE mission_id=? AND role=?",
                                 (mission_id, role)).fetchone()
            if saved:
                value = json.loads(saved[0])
                if digest(value) != saved[1]:
                    raise ValueError(role + " checkpoint digest mismatch")
                validate(implementation, value, prior)
                print("REUSED WORKER:", role, capability, flush=True)
            else:
                value = infer(implementation, prior, endpoint, timeout)
                conn.execute("INSERT INTO dispatch_stages VALUES (?,?,?,?)",
                             (mission_id, role, canonical(value), digest(value)))
                conn.commit()
                print("COMMITTED WORKER:", role, capability, flush=True)
            prior[role] = value
        receipt = {"schema": SCHEMA, "mission_id": mission_id,
                   "authorization_sha256": evidence_hash,
                   "plan_sha256": authorization["plan_sha256"],
                   "executed_roles": list(prior),
                   "worker_digests": {role: digest(value) for role, value in prior.items()},
                   "discrepancy_kw": prior["auditor"]["discrepancy_kw"],
                   "elapsed_this_run_seconds": round(time.monotonic()-started, 2),
                   "state": "completed"}
        target = db.parent / (mission_id + ".dispatch-receipt.json")
        temp = target.with_name(target.name + "." + str(os.getpid()) + ".tmp")
        temp.write_text(canonical(receipt) + "\n", encoding="utf-8")
        os.replace(temp, target)
        print(json.dumps(receipt, indent=2))
        print("CAPABILITY DISPATCH: PASS")
        return 0
    finally:
        conn.close()

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--plan-file", required=True)
    p.add_argument("--mission-id", default="capability-generator-001")
    p.add_argument("--db", default="~/.local/state/evercraft/saban-local-research/missions.sqlite3")
    p.add_argument("--endpoint", default="http://127.0.0.1:8080/v1/chat/completions")
    p.add_argument("--timeout", type=int, default=120)
    a = p.parse_args()
    try:
        with open(a.plan_file, encoding="utf-8") as f:
            plan = json.load(f)
        return run(plan, a.mission_id, a.db, a.endpoint, a.timeout)
    except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print("DISPATCH REJECTED:", exc, file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
