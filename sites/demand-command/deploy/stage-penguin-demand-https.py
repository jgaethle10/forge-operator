#!/usr/bin/env python3
"""Stage, but NEVER deploy, Demand Command's protected Caddy 2.6 HTTPS site.

Usage: sudo python3 stage-penguin-demand-https.py --stage
- Leaves /etc/evercraft/Caddyfile and ALL running services unchanged.
- Does not modify DNS, firewall, router, or tunnel configuration.
- Takes password from local TTY (never the CLI/argv or GitHub).
- Writes one private candidate adjacent to the live Caddyfile for safe imports.
"""
from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

LIVE = Path("/etc/evercraft/Caddyfile")
CANDIDATE = Path("/etc/evercraft/.Caddyfile.demand-candidate")
RECEIPT = Path("/etc/evercraft/.Caddyfile.demand-candidate.receipt")
DEMAND_HOST = "demand.systemiacommandcenters.com"
TEMPLATE = Path(__file__).with_name("Caddyfile.demand.example")
PLACEHOLDER = "REPLACE_WITH_LOCAL_CADDY_BCRYPT_HASH"


def stage_text(existing: str, template: str, hashed: str) -> str:
    """Create additive Caddy candidate without altering existing bytes."""
    if not existing.strip() or not existing.endswith("\n"):
        raise ValueError("Live Caddyfile requires review: missing trailing newline or empty")
    if DEMAND_HOST in existing:
        raise ValueError("Demand hostname already exists in live Caddyfile; stop")
    if PLACEHOLDER not in template or template.count(PLACEHOLDER) != 1:
        raise ValueError("Expected exactly one hash placeholder")
    if not re.search(r"(?m)^\s*basicauth\s*\{", template):
        raise ValueError("Expected Caddy 2.6 'basicauth' directive")
    if re.search(r"(?m)^\s*basic_auth\s*\{", template):
        raise ValueError("Incompatible Basic auth syntax in template")
    if "reverse_proxy 127.0.0.1:18897" not in template:
        raise ValueError("Private tunnel upstream missing")
    if "demand.systemiacommandcenters.com {" not in template:
        raise ValueError("Demand HTTPS site label missing")
    if not hashed.startswith(("$2a$", "$2b$", "$2y$")) or any(c.isspace() for c in hashed):
        raise ValueError("Caddy did not generate a valid-looking bcrypt hash")
    return existing + "\n" + template.replace(PLACEHOLDER, hashed).rstrip() + "\n"


def validate_password_pair(first: str, second: str) -> None:
    """Report only safe password validity reasons, never contents or length."""
    if first != second:
        raise ValueError("The two password entries did not match. Re-enter the same password twice")
    if len(first) < 20:
        raise ValueError("Password was shorter than the required 20 characters")
    if "\\n" in first or "\\r" in first:
        raise ValueError("Password must not contain a newline or carriage return")


def regular_root_file(path: Path) -> None:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0:
        raise ValueError(f"Refusing non-regular or non-root-owned file: {path}")


def create_private(path: Path, contents: bytes) -> None:
    fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as fp:
            fp.write(contents)
            fp.flush()
            os.fsync(fp.fileno())
    except BaseException:
        try:
            path.unlink()
        finally:
            raise


def service_environment() -> dict[str, str] | None:
    """Get current live service environment without printing any secret value."""
    p = subprocess.run(
        ["systemctl", "show", "evercraft-public-edge.service", "--property=MainPID", "--value"],
        capture_output=True, text=True, check=False,
    )
    if p.returncode != 0 or not p.stdout.strip().isdigit():
        return None
    pid = int(p.stdout.strip())
    if pid < 2:
        return None
    try:
        raw = Path(f"/proc/{pid}/environ").read_bytes()
    except OSError:
        return None
    env: dict[str, str] = {}
    for item in raw.split(b"\x00"):
        if b"=" not in item:
            continue
        key, value = item.split(b"=", 1)
        env[key.decode("utf-8", "surrogateescape")] = value.decode("utf-8", "surrogateescape")
    return env


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", required=True, action="store_true")
    args = parser.parse_args()
    if not args.stage:
        parser.error("--stage is required")
    if os.geteuid() != 0:
        print("STOP: Run with sudo; this writes only protected staging files.", file=sys.stderr)
        return 2
    os.umask(0o077)
    try:
        if CANDIDATE.exists() or CANDIDATE.is_symlink() or RECEIPT.exists() or RECEIPT.is_symlink():
            raise ValueError("Candidate/receipt already exists: refuse overwrite or password rotation")
        regular_root_file(LIVE)
        if TEMPLATE.is_symlink() or not TEMPLATE.is_file():
            raise ValueError("Expected genuine repository template file")
        version = subprocess.run(["caddy", "version"], capture_output=True, text=True, check=True).stdout
        if not version.strip().startswith(("v2.6.", "2.6.")):
            raise ValueError("Installed Caddy is not confirmed 2.6.x: review before staging")
        existing_bytes = LIVE.read_bytes()
        existing = existing_bytes.decode("utf-8", errors="strict")
        template = TEMPLATE.read_text(encoding="utf-8")
        if not re.search(r"(?m)^\s*http_port\s+18080\s*$", existing) or not re.search(
            r"(?m)^\s*https_port\s+8443\s*$", existing
        ):
            raise ValueError("Caddy global ports differ from observed 18080 / 8443")
        if not re.search(r"(?m)^\s*worlds\.systemiacommandcenters\.com\s*\{", existing):
            raise ValueError("Worlds site missing; review actual current edge file")
        if DEMAND_HOST in existing:
            raise ValueError("Demand site already present; refuse duplicate")
        if not sys.stdin.isatty():
            raise ValueError("Local interactive terminal required to choose an outer login password")
        print("Staging owner-only Caddy Basic auth. Password is never sent to chat or GitHub.")
        p1 = getpass.getpass("New owner Basic-auth password (at least 20 characters): ")
        p2 = getpass.getpass("Confirm owner Basic-auth password: ")
        validate_password_pair(p1, p2)
        # The plaintext goes through stdin ONLY, never the process argv or logs.
        digest = subprocess.run(
            ["caddy", "hash-password", "--algorithm", "bcrypt"],
            input=p1 + "\n", capture_output=True, text=True, check=True,
        ).stdout.strip()
        del p1, p2
        candidate = stage_text(existing, template, digest)
        create_private(CANDIDATE, candidate.encode("utf-8"))
        receipt = {
            "schema": "evercraft.demand.caddy.candidate.v1",
            "live_config_sha256": hashlib.sha256(existing_bytes).hexdigest(),
            "candidate_sha256": hashlib.sha256(candidate.encode("utf-8")).hexdigest(),
            "candidate": str(CANDIDATE),
            "state": "STAGED_NOT_APPLIED",
            "target": DEMAND_HOST,
            "mode": "existing-config-plus-one-private-site",
            "live_caddy_unchanged": True,
        }
        create_private(RECEIPT, (json.dumps(receipt, indent=2) + "\n").encode("utf-8"))
        print("PASS: root-only candidate and SHA-256 receipt created. LIVE CADDYFILE UNCHANGED.")
        print("Existing Caddy global ports and Worlds site preserved byte-for-byte.")
        print("Candidate stays local at /etc/evercraft/.Caddyfile.demand-candidate")
        env = service_environment()
        placeholders = set(re.findall(r"\{\$([A-Za-z_][A-Za-z0-9_]*)\}", candidate))
        if env is None or not placeholders.issubset(env.keys()):
            print("HOLD: Cannot safely reconstruct all live Caddy environment variables.")
            print("Candidate NOT validated; no Caddy reload or DNS changes were made.")
            return 0
        # Validation does not activate/listen/reload an active Caddy service.
        check = subprocess.run(
            ["caddy", "adapt", "--config", str(CANDIDATE), "--adapter", "caddyfile", "--validate"],
            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
        )
        if check.returncode != 0:
            print("HOLD: Candidate failed offline Caddy adaptation/provision validation.")
            print("Do not reload production. Diagnostics are retained only in process memory.")
            return 0
        print("PASS: Candidate Caddy adaptation and offline provisioning validated.")
        print("DNS, the existing live Caddyfile and the running edge remain UNCHANGED.")
        print("PUBLIC HTTPS REMAINS HELD pending IONOS DNS and protected rollout.")
        return 0
    except ValueError as exc:
        # All ValueErrors originate in our fixed, non-secret preflight or format checks.
        # Explain the exact category to avoid needless re-entering of credentials.
        print(f"STOP: {exc}. No live edge changed.", file=sys.stderr)
        return 2
    except (UnicodeError, OSError, subprocess.CalledProcessError) as exc:
        # Never echo process stderr, plaintext passwords, hashes or edge environment.
        print(f"STOP: staging prerequisite failed ({exc.__class__.__name__}). No live edge changed.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
