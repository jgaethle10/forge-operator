#!/usr/bin/env python3
"""One-command LOCAL Forge QA entrypoint for EO-001's existing private Gate 0 ZIP.

No model, network, external send, service change, public artifact or auth change.
Finds exactly one existing handoff on the owner's HP and independently verifies
its contents against local sanitized source files. Prints only safe status data.
"""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import stat
import sys


def load_review():
    source = Path(__file__).resolve().with_name("eo001-forge-evidence-qa.py")
    spec = importlib.util.spec_from_file_location("eo001_forge_gate", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    base = Path.home() / ".local/state/evercraft/eo001-handoff"
    try:
        if base.is_symlink() or not base.is_dir():
            raise ValueError("PRIVATE_HANDOFF_BASE_MISSING")
        st = base.stat()
        if st.st_uid != os.getuid() or (st.st_mode & 0o077):
            raise ValueError("HANDOFF_BASE_PERMISSIONS")

        bundles = list(base.glob("gate0-*/gate0-private-handoff.zip"))
        if len(bundles) != 1:
            raise ValueError("EXACTLY_ONE_GATE0_BUNDLE_REQUIRED")
        bundle = bundles[0]
        directory = bundle.parent
        if directory.is_symlink() or not directory.is_dir():
            raise ValueError("HANDOFF_RUN_FOLDER_INVALID")
        st = directory.stat()
        if (st.st_uid != os.getuid() or not stat.S_ISDIR(st.st_mode)
                or st.st_mode & 0o077):
            raise ValueError("HANDOFF_RUN_FOLDER_PERMISSIONS")
        output = directory / "forge-evidence-qa.v1.json"
        qa = load_review()
        result = qa.inspect_bundle(bundle, directory / "sanitized-receipt.json",
                                    directory / "independent-review.json", output)
        print("EVERCRAFT_FORGE_PRIVATE_QA: PASS")
        print("PRIVATE_ARTIFACT_INTEGRITY: PASS")
        print("PRIVACY_ALLOWLIST: PASS")
        print("RESEARCH_PROVENANCE: UNVERIFIED_EXTERNAL")
        print("LAB_INDEPENDENT_INSPECTION: PENDING")
        print("OUTBOUND_ACTION: HELD")
        print("NEXTGEN_AUTOMATED_QA_RECEIPT_CREATED: TRUE")
        print("PACKAGE_SHA256: " + result["bundle_sha256"])
        print("NO_MANUAL_JSON_INSPECTION_REQUIRED")
        return 0
    except Exception as exc:
        allowed = exc.__class__.__name__ if not isinstance(exc, ValueError) else str(exc)
        if allowed not in {
            "PRIVATE_HANDOFF_BASE_MISSING", "HANDOFF_BASE_PERMISSIONS",
            "EXACTLY_ONE_GATE0_BUNDLE_REQUIRED", "HANDOFF_RUN_FOLDER_INVALID",
            "HANDOFF_RUN_FOLDER_PERMISSIONS"
        } and not (isinstance(exc, ValueError) and allowed.isupper()):
            allowed = "QA_BLOCKED"
        print("EVERCRAFT_FORGE_PRIVATE_QA: BLOCKED (" + allowed + ")")
        print("NO_EXTERNAL_ACTION_TAKEN")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
