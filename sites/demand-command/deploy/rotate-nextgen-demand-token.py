#!/usr/bin/env python3
"""Rotate the private Demand Command API token ONLY on the owner-controlled NextGen.

No token, password, database contents or secret hash is printed. Does not
modify Caddy, DNS, SSH tunnel, router, GitHub or the existing SQLite database.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import secrets
import stat
import subprocess
import sys
import tempfile
import time
from urllib.request import build_opener, ProxyHandler

UNIT = "evercraft-demand-command.service"
ENVFILE = Path.home() / ".config/evercraft/demand-command.env"
URL = "http://127.0.0.1:18896/"
TITLE = b"<title>Evercraft Demand Command | Private Console</title>"
PREFIX = "EVERCRAFT_DEMAND_TOKEN="


def replace_token(contents: str, token: str) -> str:
    """Preserve all other environment settings including the database path."""
    lines = contents.splitlines(keepends=True)
    candidates = [i for i, line in enumerate(lines) if line.startswith(PREFIX)]
    if len(candidates) != 1:
        raise ValueError("Expected exactly one Demand API token setting")
    old = lines[candidates[0]][len(PREFIX):].rstrip("\r\n")
    if not old or "\n" in token or "\r" in token or len(token) < 48:
        raise ValueError("Invalid old or new token")
    newline = "\r\n" if lines[candidates[0]].endswith("\r\n") else "\n"
    lines[candidates[0]] = PREFIX + token + newline
    return "".join(lines)


def health() -> bool:
    try:
        with build_opener(ProxyHandler({})).open(URL, timeout=4) as response:
            return TITLE in response.read(100_000)
    except OSError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rotate", action="store_true", required=True)
    parser.parse_args()
    temp: Path | None = None
    try:
        st = ENVFILE.lstat()
        if not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid() or stat.S_IMODE(st.st_mode) != 0o600:
            raise ValueError("Demand credential file must be a regular owner-only 0600 file")
        unit = subprocess.run(["systemctl", "--user", "is-active", "--quiet", UNIT], check=False)
        if unit.returncode != 0 or not health():
            raise ValueError("Resident Demand service not healthy; refusing rotation")
        previous = ENVFILE.read_text(encoding="utf-8")
        updated = replace_token(previous, secrets.token_urlsafe(48))
        fd, name = tempfile.mkstemp(prefix=".demand-token-", dir=ENVFILE.parent)
        temp = Path(name)
        with os.fdopen(fd, "w", encoding="utf-8") as writer:
            os.fchmod(writer.fileno(), 0o600)
            writer.write(updated)
            writer.flush()
            os.fsync(writer.fileno())
        if ENVFILE.lstat().st_ino != st.st_ino:
            raise ValueError("Credential file changed during rotation")
        os.replace(temp, ENVFILE)
        temp = None
        response = subprocess.run(
            ["systemctl", "--user", "restart", UNIT],
            capture_output=True, timeout=20, check=False,
        )
        if response.returncode:
            raise ValueError("New token saved, but resident restart failed. Do not use old token")
        for _ in range(10):
            if health():
                print("PASS: private Demand API token rotated and resident service healthy.")
                print("Previous exposed token is no longer valid for newly authenticated requests.")
                print("Private SQLite data and the Penguin tunnel were not changed.")
                print("Use install-nextgen-resident.sh --show-token LOCALLY; never paste the result into chat.")
                return 0
            time.sleep(1)
        raise ValueError("New token saved; service not yet healthy. Inspect its status locally")
    except (ValueError, OSError, subprocess.SubprocessError) as exc:
        # All ValueError messages are literal and non-sensitive.
        msg = str(exc) if isinstance(exc, ValueError) else type(exc).__name__
        print(f"STOP: {msg}", file=sys.stderr)
        return 2
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
