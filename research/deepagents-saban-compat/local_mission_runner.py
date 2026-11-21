#!/usr/bin/env python3
"""Research-only, recoverable local Qwen mission. No shell tools or production integration."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import re
from pathlib import Path
import sqlite3
import time
import urllib.request

RECORDS = "Record A: Generator output = 12 kW.\nRecord B: Generator output = 10 kW."
STAGES = ("analyst", "auditor", "supervisor")
SCHEMA = "evercraft.saban.local-mission.v3"

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))

def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()

def require_number(value):
    if type(value) not in (int, float) or not (0 <= value <= 1000000):
        raise ValueError("invalid numeric result")
    return value

def validate(stage, value, prior):
    if not isinstance(value, dict):
        raise ValueError("worker did not return object")
    if stage == "analyst":
        if set(value) != {"record_a_kw", "record_b_kw"}:
            raise ValueError("invalid analyst keys")
        if require_number(value["record_a_kw"]) != 12 or require_number(value["record_b_kw"]) != 10:
            raise ValueError("analyst claims conflict with source")
    elif stage == "auditor":
        if set(value) != {"discrepancy_kw", "conflict_detected"}:
            raise ValueError("invalid auditor keys")
        if require_number(value["discrepancy_kw"]) != 2 or value["conflict_detected"] is not True:
            raise ValueError("auditor discrepancy incorrect")
    else:
        if set(value) != {"verified_discrepancy_kw", "status", "recommendation"}:
            raise ValueError("invalid supervisor keys")
        if require_number(value["verified_discrepancy_kw"]) != 2 or value["status"] != "conflict":
            raise ValueError("supervisor verification failed")
        if not isinstance(value["recommendation"], str) or len(value["recommendation"]) > 200:
            raise ValueError("invalid recommendation")
    return value

def instructions(stage, prior):
    if stage == "analyst":
        return ("Extract numerical values from both records. Return only JSON with numeric "
                "record_a_kw and record_b_kw."), RECORDS
    if stage == "auditor":
        return ("Independently compare both records. Return only JSON with numeric discrepancy_kw "
                "and boolean conflict_detected."), RECORDS
    return ("Compare validated findings. Return only JSON with numeric verified_discrepancy_kw, "
            "status string 'conflict', and a short recommendation."), canonical({
                "records": RECORDS, "analyst": prior["analyst"], "auditor": prior["auditor"]
            })

def infer(stage, prior, endpoint, timeout):
    system, task = instructions(stage, prior)
    body = {
        "messages": [
            {"role": "system", "content": system + " No markdown or commentary."},
            {"role": "user", "content": task}
        ],
        "temperature": 0, "max_tokens": 180, "stream": False,
        "chat_template_kwargs": {"enable_thinking": False}
    }
    req = urllib.request.Request(endpoint, data=canonical(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.load(resp)
    choice = data["choices"][0]
    if choice.get("finish_reason") != "stop":
        raise RuntimeError(f"{stage} incomplete: {choice.get('finish_reason')}")
    return validate(stage, json.loads(choice["message"]["content"]), prior)

def connect(db):
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("CREATE TABLE IF NOT EXISTS missions (id TEXT PRIMARY KEY, input_hash TEXT NOT NULL, created_at TEXT NOT NULL)")
    conn.execute("""CREATE TABLE IF NOT EXISTS stages (
        mission_id TEXT NOT NULL, stage TEXT NOT NULL, payload TEXT NOT NULL,
        payload_sha256 TEXT NOT NULL, completed_at TEXT NOT NULL,
        PRIMARY KEY(mission_id,stage))""")
    conn.commit()
    return conn

def run(args):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', args.mission_id):
        raise ValueError('invalid mission id')
    if not args.endpoint.startswith("http://127.0.0.1:") and not args.endpoint.startswith("http://localhost:"):
        raise ValueError("only loopback inference endpoints permitted")
    db = Path(args.db).expanduser()
    db.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if db.is_symlink():
        raise ValueError("database symlink refused")
    # Advisory flock protects direct runner calls and compatibility-launcher calls alike.
    lock_path = db.parent / (args.mission_id + ".lock")
    lock_fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(lock_fd)
        print("MISSION BUSY: another process owns this mission", flush=True)
        return 75
    try:
        return _run_locked(args, db)
    finally:
        os.close(lock_fd)

def _run_locked(args, db):
    conn = connect(db)
    source_hash = digest({"records": RECORDS, "schema": SCHEMA})
    now = lambda: dt.datetime.now(dt.timezone.utc).isoformat()
    row = conn.execute("SELECT input_hash FROM missions WHERE id=?", (args.mission_id,)).fetchone()
    if row and row[0] != source_hash:
        raise ValueError("mission id reused with changed input")
    if not row:
        conn.execute("INSERT INTO missions VALUES (?,?,?)", (args.mission_id, source_hash, now()))
        conn.commit()
    prior = {}
    started = time.monotonic()
    try:
        for stage in STAGES:
            saved = conn.execute("SELECT payload,payload_sha256 FROM stages WHERE mission_id=? AND stage=?",
                                 (args.mission_id, stage)).fetchone()
            if saved:
                value = json.loads(saved[0])
                if digest(value) != saved[1]:
                    raise ValueError(f"{stage} checkpoint digest mismatch")
                validate(stage, value, prior)
                print(f"REUSED CHECKPOINT: {stage}", flush=True)
            else:
                value = infer(stage, prior, args.endpoint, args.timeout)
                serialized = canonical(value)
                conn.execute("INSERT INTO stages VALUES (?,?,?,?,?)",
                             (args.mission_id, stage, serialized, digest(value), now()))
                conn.commit()
                print(f"COMMITTED CHECKPOINT: {stage}", flush=True)
            prior[stage] = value
            if args.stop_after == stage:
                print(f"INTENTIONAL STOP AFTER: {stage}", flush=True)
                return
        receipt = {
            "schema": SCHEMA, "mission_id": args.mission_id, "input_sha256": source_hash,
            "workers_completed": 2, "supervisor_completed": True,
            "discrepancy_kw": 2, "stages": {s: digest(prior[s]) for s in STAGES},
            "elapsed_this_run_seconds": round(time.monotonic()-started, 2),
            "state": "completed", "completed_at": now()
        }
        receipt_path = db.parent / (args.mission_id + ".receipt.json")
        temp_path = receipt_path.with_suffix(".tmp")
        temp_path.write_text(canonical(receipt) + "\n")
        os.replace(temp_path, receipt_path)
        print(json.dumps(receipt, indent=2))
        print("MISSION STATUS: PASS")
    finally:
        conn.close()

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--db", default="~/.local/state/evercraft/saban-local-research/missions.sqlite3")
    p.add_argument("--mission-id", default="synthetic-generator-001")
    p.add_argument("--endpoint", default="http://127.0.0.1:8080/v1/chat/completions")
    p.add_argument("--timeout", type=int, default=120)
    p.add_argument("--stop-after", choices=STAGES)
    raise SystemExit(run(p.parse_args()) or 0)
