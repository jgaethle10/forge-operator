#!/usr/bin/env python3
"""Execute Fungal Defense checks locally and write a truthful execution receipt.

No cloud service, no outbound network, no deployment, no secrets. Run this on a
checked-out Evercraft node to verify local execution. A node label is a claim,
not remote attestation. Public release remains blocked by the separate gate.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
import platform
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"


def run(args: list[str], timeout: int = 90) -> dict:
    try:
        result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True,
                                timeout=timeout, check=False)
        return {"command": args, "exit_code": result.returncode,
                "passed": result.returncode == 0,
                "stdout_tail": result.stdout[-4000:], "stderr_tail": result.stderr[-2000:]}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"command": args, "exit_code": None, "passed": False,
                "error": type(error).__name__}


def git_value(*args: str) -> str | None:
    result = run(["git", *args])
    return result.get("stdout_tail", "").strip() if result["passed"] else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="optional local JSON receipt path")
    parser.add_argument("--node-label", default="unverified-local-machine",
                        help="informational label only; not proof of hardware identity")
    args = parser.parse_args()
    command_sets = [
        [sys.executable, str(TOOLS / "validate_surveillance.py"), "--self-test"],
        [sys.executable, str(TOOLS / "check_observatory.py")],
        [sys.executable, "-m", "unittest", "discover", "-s", str(TOOLS), "-p", "test_*.py", "-v"],
        [sys.executable, str(TOOLS / "release_gate.py"), "--self-test"],
        [sys.executable, str(TOOLS / "release_gate.py"), "--stage", "preview"],
    ]
    results = [run(command) for command in command_sets]
    commit = git_value("rev-parse", "HEAD")
    changes = git_value("status", "--porcelain")
    receipt = {
        "schema": "evercraft.fungal-defense.local-validation-receipt.v1",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "node_label_claimed": args.node_label,
        "node_hardware_attested": False,
        "environment": {"platform": platform.platform(), "python": sys.version.split()[0]},
        "git_commit": commit,
        "git_worktree_clean": changes == "" if changes is not None else None,
        "source_network_checks_performed": False,
        "public_deployment_performed": False,
        "results": results,
        "status": "pass" if all(result["passed"] for result in results) else "fail",
        "public_release_approved": False,
    }
    text = json.dumps(receipt, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    print(text, end="")
    return 0 if receipt["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
