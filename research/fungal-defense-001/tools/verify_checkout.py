#!/usr/bin/env python3
"""Fail-closed local source checkout checks for FUNGAL-DEFENSE-001.

This establishes the local Git branch, remote URL, cleanliness and commit,
NOT hardware identity, a remote attestation, or scientific approval.
No network calls, repository mutation or secrets are involved.
"""
from __future__ import annotations

import json
from pathlib import Path
import subprocess

REPO_ROOT = Path(__file__).resolve().parents[3]
REQUIRED_BRANCH = "research/fungal-defense-001"
ACCEPTED_ORIGINS = frozenset({
    "https://github.com/jgaethle10/forge-operator",
    "https://github.com/jgaethle10/forge-operator.git",
    "git@github.com:jgaethle10/forge-operator.git",
    "ssh://git@github.com/jgaethle10/forge-operator.git",
})
REQUIRED_FILES = (
    "research/fungal-defense-001/observatory-v0.2.html",
    "research/fungal-defense-001/data/cdc-cauris-clinical-annual.json",
    "research/fungal-defense-001/release-gates.json",
    "research/fungal-defense-001/tools/validate_surveillance.py",
    "research/fungal-defense-001/tools/check_observatory.py",
)


def git(repo: Path, *args: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(repo), *args],
            check=False, capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def inspect(repo: Path) -> dict:
    """Inspects local source identity; rejects missing or ambiguous metadata."""
    repo = repo.resolve()
    root = git(repo, "rev-parse", "--show-toplevel")
    branch = git(repo, "symbolic-ref", "--quiet", "--short", "HEAD")
    origin = git(repo, "remote", "get-url", "origin")
    commit = git(repo, "rev-parse", "--verify", "HEAD^{commit}")
    status = git(repo, "status", "--porcelain", "--untracked-files=normal")
    problems = []
    if root is None or Path(root).resolve() != repo:
        problems.append("This is not the expected top-level Git checkout")
    if branch != REQUIRED_BRANCH:
        problems.append("Incorrect or detached Git branch")
    if origin not in ACCEPTED_ORIGINS:
        problems.append("Unrecognized Git origin URL")
    if commit is None or len(commit) != 40:
        problems.append("Git commit is unavailable")
    if status is None:
        problems.append("Cannot verify Git worktree status")
    elif status:
        problems.append("Git worktree has modified or untracked files")
    missing = [name for name in REQUIRED_FILES if not (repo / name).is_file()]
    if missing:
        problems.append("Required project files are absent: " + ", ".join(missing))
    return {
        "schema": "evercraft.fungal-defense.checkout-admission.v1",
        "admitted": not problems,
        "commit": commit,
        "branch": branch,
        "remote_matches_expected": origin in ACCEPTED_ORIGINS,
        "worktree_clean": status == "" if status is not None else False,
        "hardware_identity_attested": False,
        "network_verification_performed": False,
        "problems": problems,
    }


def main() -> int:
    result = inspect(REPO_ROOT)
    print(json.dumps(result, indent=2))
    return 0 if result["admitted"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
