#!/usr/bin/env python3
"""Controlled owner-only Caddy HTTPS promotion for Evercraft Demand Command.

--check: no changes, verifies source integrity, private upstream, DNS and Caddy.
--apply: atomically install the validated candidate, restart ONLY the Evercraft
         Caddy edge, check its protected HTTPS response, and auto-rollback on
         any failure. Never mutates IONOS, router, SSH, Fabric or Worlds.
"""
from __future__ import annotations

import argparse
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import time
from urllib.request import build_opener, ProxyHandler

LIVE = Path("/etc/evercraft/Caddyfile")
CANDIDATE = Path("/etc/evercraft/.Caddyfile.demand-candidate")
RECEIPT = Path("/etc/evercraft/.Caddyfile.demand-candidate.receipt")
ROLLBACK = Path("/etc/evercraft/.Caddyfile.demand-rollback")
SERVICE = "evercraft-public-edge.service"
HOST = "demand.systemiacommandcenters.com"
FABRIC_HOST = "fabric.systemiacommandcenters.com"
UPSTREAM = "http://127.0.0.1:18897/"
EXPECTED_TITLE = b"<title>Evercraft Demand Command | Private Console</title>"


class Hold(RuntimeError):
    """Safe stop condition without leaking sensitive configuration."""


def run(args: list[str], *, env: dict[str, str] | None = None, timeout: int = 20) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, env=env, timeout=timeout, check=False)


def file_bytes(path: Path) -> bytes:
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or st.st_mode & 0o002:
        raise Hold(f"unsafe or non-root-owned file at {path.name}")
    return path.read_bytes()


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def service_env() -> dict[str, str]:
    result = run(["systemctl", "show", SERVICE, "--property=MainPID", "--value"])
    if result.returncode or not result.stdout.strip().isdigit():
        raise Hold("cannot inspect current public-edge service PID")
    pid = int(result.stdout.strip())
    if pid <= 1:
        raise Hold("public-edge service has no running PID")
    try:
        raw = Path(f"/proc/{pid}/environ").read_bytes()
    except OSError as exc:
        raise Hold("cannot read running edge environment") from exc
    result_env = {}
    for row in raw.split(b"\0"):
        if b"=" in row:
            name, val = row.split(b"=", 1)
            result_env[name.decode("utf-8", "surrogateescape")] = val.decode("utf-8", "surrogateescape")
    return result_env


def check_dns() -> None:
    def resolved(host: str) -> set[str]:
        return {v[4][0] for v in socket.getaddrinfo(host, None, family=socket.AF_INET)}
    if not (a := resolved(HOST)) or a != resolved(FABRIC_HOST):
        raise Hold("Demand DNS and Fabric DNS do not resolve to the same IPv4 set")


def check_app() -> None:
    opener = build_opener(ProxyHandler({}))
    try:
        with opener.open(UPSTREAM, timeout=5) as response:
            page = response.read(100_000)
    except OSError as exc:
        raise Hold("Demand upstream private tunnel is not healthy") from exc
    if EXPECTED_TITLE not in page:
        raise Hold("Demand tunnel returned an unexpected page")


def check_service_shape() -> tuple[int, int]:
    state = run(["systemctl", "is-active", SERVICE])
    if state.returncode or state.stdout.strip() != "active":
        raise Hold("public-edge service is not active")
    started = run(["systemctl", "show", SERVICE, "-p", "ExecStart", "--value"])
    if started.returncode or "caddy run" not in started.stdout or str(LIVE) not in started.stdout:
        raise Hold("public-edge service does not match the expected resident Caddy command")
    user = run(["systemctl", "show", SERVICE, "-p", "User", "--value"]).stdout.strip()
    group = run(["systemctl", "show", SERVICE, "-p", "Group", "--value"]).stdout.strip()
    if user != "caddy" or group != "caddy":
        raise Hold("public-edge service user/group differs from the verified owned deployment")
    return pwd.getpwnam(user).pw_uid, grp.getgrnam(group).gr_gid


def check_candidate(live: bytes, candidate: bytes, receipt: dict) -> None:
    if receipt.get("state") != "STAGED_NOT_APPLIED":
        raise Hold("candidate is not in the expected staged-only state")
    if receipt.get("live_config_sha256") != digest(live):
        raise Hold("live Caddyfile has changed since staging; refuse deployment")
    if receipt.get("candidate_sha256") != digest(candidate):
        raise Hold("staged Caddyfile hash differs from its protected receipt")
    if not candidate.startswith(live + b"\n"):
        raise Hold("candidate does not preserve every byte of the existing configuration")
    if HOST.encode() in live or candidate.count((HOST + " {").encode()) != 1:
        raise Hold("Demand hostname duplicated or already live")
    appended = candidate[len(live):]
    if b"reverse_proxy 127.0.0.1:18897" not in appended:
        raise Hold("candidate does not use the verified private tunnel")
    if b"basicauth {" not in appended or b"basic_auth {" in appended:
        raise Hold("candidate does not use Caddy 2.6 Basic auth")
    if b"REPLACE_WITH_LOCAL_CADDY_BCRYPT_HASH" in candidate:
        raise Hold("candidate has an unpopulated authentication placeholder")
    if not re.search(rb"(?m)^[ \t]*owner \$2[aby]\$\d\d\$[./A-Za-z0-9]{53}[ \t]*$", appended):
        raise Hold("candidate lacks a bcrypt password hash")
    if not re.search(rb"(?m)^[ \t]*http_port[ \t]+18080[ \t]*$", live):
        raise Hold("unexpected HTTP port in shared Caddyfile")
    if not re.search(rb"(?m)^[ \t]*https_port[ \t]+8443[ \t]*$", live):
        raise Hold("unexpected HTTPS port in shared Caddyfile")
    if b"worlds.systemiacommandcenters.com {" not in live:
        raise Hold("existing Worlds site missing")


def verify_offline(env: dict[str, str]) -> None:
    out = run(["caddy", "adapt", "--config", str(CANDIDATE),
               "--adapter", "caddyfile", "--validate"], env=env, timeout=40)
    if out.returncode:
        raise Hold("offline Caddy adaptation/provisioning failed")


def new_file(data: bytes, *, mode: int, gid: int) -> Path:
    fd, name = tempfile.mkstemp(prefix=".evercraft-demand-", dir=str(LIVE.parent))
    try:
        os.fchown(fd, 0, gid)
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb") as fp:
            fp.write(data)
            fp.flush()
            os.fsync(fp.fileno())
    except BaseException:
        try:
            os.close(fd)
        except OSError:
            pass
        Path(name).unlink(missing_ok=True)
        raise
    return Path(name)


def restart() -> bool:
    r = run(["systemctl", "restart", SERVICE], timeout=45)
    if r.returncode:
        return False
    status = run(["systemctl", "is-active", SERVICE], timeout=8)
    return status.returncode == 0 and status.stdout.strip() == "active"


def check_local_https() -> bool:
    # A trusted local TLS handshake plus HTTP 401 proves Basic auth precedes the app.
    # Run against Penguin loopback while verifying the exact public SNI/hostname.
    r = run(["curl", "--noproxy", "*", "--silent", "--show-error",
             "--output", "/dev/null", "--max-time", "8",
             "--resolve", f"{HOST}:8443:127.0.0.1",
             "--write-out", "%{http_code} %{ssl_verify_result}",
             f"https://{HOST}:8443/"], timeout=12)
    return r.returncode == 0 and r.stdout.strip() == "401 0"


def apply(live: bytes, candidate: bytes, group_id: int) -> None:
    if ROLLBACK.exists() or ROLLBACK.is_symlink():
        raise Hold("a prior Demand rollback snapshot already exists; manual review required")
    oldstat = LIVE.stat()
    oldmode = stat.S_IMODE(oldstat.st_mode)
    # The Caddy worker must read its configuration, but not the root-owned candidate.
    newmode = 0o640
    save = new_file(live, mode=0o600, gid=0)
    try:
        os.replace(save, ROLLBACK)
    finally:
        save.unlink(missing_ok=True)
    promoted = new_file(candidate, mode=newmode, gid=group_id)
    deployed = False
    try:
        # Recheck drift immediately before swap to avoid clobbering competing edits.
        if digest(file_bytes(LIVE)) != digest(live):
            raise Hold("live Caddyfile changed during promotion, refusing overwrite")
        os.replace(promoted, LIVE)
        deployed = True
        print("Demand site installed. Restarting ONLY evercraft-public-edge.service.")
        if not restart():
            raise Hold("public-edge restart failed")
        for _ in range(10):
            if check_local_https():
                print("PASS: trusted localhost TLS and unauthenticated 401 from Demand hostname.")
                print("PASS: live Caddy service active, original config preserved in protected rollback snapshot.")
                print("PUBLIC EXTERNAL VALIDATION STILL REQUIRED: off-LAN TLS, 401, and authenticated token.")
                return
            time.sleep(4)
        raise Hold("Demand hostname did not pass trusted local TLS + unauthenticated 401 checks")
    except BaseException as exc:
        if deployed:
            print("HOLD: protected HTTPS verification failed. Restoring prior Caddyfile.")
            rollback = new_file(live, mode=oldmode, gid=oldstat.st_gid)
            try:
                os.chown(rollback, oldstat.st_uid, oldstat.st_gid)
                os.replace(rollback, LIVE)
            finally:
                rollback.unlink(missing_ok=True)
            if not restart():
                raise Hold("CRITICAL: prior Caddyfile restored but public-edge restart requires operator attention") from exc
            print("PASS: previous Caddyfile restored and public-edge restarted.")
        raise
    finally:
        promoted.unlink(missing_ok=True)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    choice = p.add_mutually_exclusive_group(required=True)
    choice.add_argument("--check", action="store_true")
    choice.add_argument("--apply", action="store_true")
    args = p.parse_args()
    if os.geteuid() != 0:
        print("STOP: sudo required for root-only Caddy receipt", file=sys.stderr)
        return 2
    os.umask(0o077)
    try:
        uid, gid = check_service_shape()
        live = file_bytes(LIVE)
        candidate = file_bytes(CANDIDATE)
        receipt = json.loads(file_bytes(RECEIPT).decode("utf-8"))
        if not isinstance(receipt, dict):
            raise Hold("unexpected Caddy receipt format")
        check_candidate(live, candidate, receipt)
        check_dns()
        check_app()
        env = service_env()
        placeholders = set(re.findall(r"\{\$([A-Za-z_][A-Za-z0-9_]*)\}", candidate.decode("utf-8")))
        if not placeholders.issubset(env):
            raise Hold("Caddy service environment does not cover every config variable")
        verify_offline(env)
        print("PASS: Caddy, DNS, private tunnel, protected candidate and offline validation.")
        if args.check:
            print("LIVE EDGE UNCHANGED. To publish, use --apply after review.")
        else:
            apply(live, candidate, gid)
        return 0
    except (Hold, ValueError, OSError, subprocess.TimeoutExpired) as exc:
        # Never echo a candidate, password, hash, service environment or subprocess output.
        if isinstance(exc, Hold):
            print(f"STOP: {exc}", file=sys.stderr)
        else:
            print(f"STOP: release check failed ({exc.__class__.__name__})", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
