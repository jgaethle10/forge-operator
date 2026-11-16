#!/usr/bin/env python3
"""Research-only exclusive launcher for local_mission_runner.py.

Holds an OS advisory flock for the *entire* mission, including inference.
No lock stealing or time-based expiry: a terminated process releases the lock.
Only use on a local filesystem whose flock semantics are supported.
"""
import argparse
import fcntl
import os
from pathlib import Path
import re
import subprocess
import sys

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mission-id", default="synthetic-generator-001")
    parser.add_argument("--db", default="~/.local/state/evercraft/saban-local-research/missions.sqlite3")
    parser.add_argument("--stop-after", choices=("analyst", "auditor", "supervisor"))
    parser.add_argument("--endpoint", default="http://127.0.0.1:8080/v1/chat/completions")
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", args.mission_id):
        parser.error("invalid mission id")
    if not (args.endpoint.startswith("http://127.0.0.1:") or args.endpoint.startswith("http://localhost:")):
        parser.error("only loopback inference endpoints permitted")
    db = Path(args.db).expanduser().resolve(strict=False)
    db.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if db.parent.is_symlink() or db.is_symlink():
        parser.error("symlinked state paths refused")
    lock_path = db.parent / (args.mission_id + ".lock")
    # O_NOFOLLOW prevents the lock file itself from being redirected.
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("MISSION BUSY: another launcher owns this mission", file=sys.stderr)
            return 75
        os.ftruncate(fd, 0)
        os.write(fd, f"pid={os.getpid()}\n".encode())
        command = [
            sys.executable, str(Path(__file__).with_name("local_mission_runner.py")),
            "--mission-id", args.mission_id, "--db", str(db),
            "--endpoint", args.endpoint, "--timeout", str(args.timeout),
        ]
        if args.stop_after:
            command.extend(["--stop-after", args.stop_after])
        return subprocess.call(command)
    finally:
        os.close(fd)

if __name__ == "__main__":
    raise SystemExit(main())
