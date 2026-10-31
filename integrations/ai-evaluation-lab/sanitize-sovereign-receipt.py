#!/usr/bin/env python3
"""Copy the ten Lab-requested fields from a private Sovereign AI smoke receipt.

This is a local *sanitization* utility, not independent hardware attestation or
an EO-001 model evaluation. It never uploads the original or its sanitized copy.
"""
from __future__ import annotations
import argparse
import json
import math
import os
from pathlib import Path
import re
import stat

FIELDS = (
    "schema",
    "state",
    "real_local_inference",
    "model_sha256",
    "runtime_sha256",
    "model_reply_sha256",
    "inference_seconds",
    "child_processes_stopped",
    "synthetic_only",
    "production_services_modified",
)
EXPECTED_MODEL = "7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5"
EXPECTED_RUNTIME = "a32b9bdc4d664e21558726fee570b712124c624ccb37fa2eea93bb34a5a93591"
SCHEMA = "evercraft.eo001.sovereign-inference-acceptance.v1"
OUTPUT_ROOT = Path.home() / ".local/state/evercraft/eo001-review-handoff"


def select(source):
    if not isinstance(source, dict):
        raise ValueError("receipt_must_be_object")
    missing = [key for key in FIELDS if key not in source]
    if missing:
        raise ValueError("receipt_missing_required_fields: " + ", ".join(missing))
    copy = {key: source[key] for key in FIELDS}
    if copy["schema"] != SCHEMA:
        raise ValueError("unexpected_receipt_schema")
    if copy["state"] != "FIRST_INFERENCE_PASS":
        raise ValueError("original_receipt_not_a_pass")
    for name in ("real_local_inference", "child_processes_stopped", "synthetic_only",
                 "production_services_modified"):
        if type(copy[name]) is not bool:
            raise ValueError(name + "_must_be_boolean")
    if not (copy["real_local_inference"] and copy["child_processes_stopped"] and
            copy["synthetic_only"] and not copy["production_services_modified"]):
        raise ValueError("receipt_assertions_not_met")
    for name, expected in (("model_sha256", EXPECTED_MODEL),
                           ("runtime_sha256", EXPECTED_RUNTIME)):
        if copy[name] != expected:
            raise ValueError(name + "_mismatch")
    if not isinstance(copy["model_reply_sha256"], str) or not re.fullmatch(
            r"[0-9a-f]{64}", copy["model_reply_sha256"]):
        raise ValueError("reply_sha256_invalid")
    elapsed = copy["inference_seconds"]
    if type(elapsed) not in (int, float) or not math.isfinite(elapsed) or elapsed < 0:
        raise ValueError("inference_seconds_invalid")
    return copy


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    original = args.receipt.expanduser()
    out = args.output.expanduser()
    if original.is_symlink() or not original.is_file():
        raise ValueError("invalid_or_symlink_original_receipt")
    if original.stat().st_size > 65536:
        raise ValueError("original_receipt_too_large")
    if out.exists() or out.is_symlink():
        raise ValueError("refuse_overwrite_existing_output")
    root = OUTPUT_ROOT.resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    root_mode = stat.S_IMODE(root.stat().st_mode)
    if root_mode & 0o077:
        raise ValueError("output_directory_must_be_private")
    out = out.absolute()
    if out.parent.resolve() != root:
        raise ValueError("output_must_be_in_private_handoff_directory")
    with original.open("r", encoding="utf-8") as handle:
        source = json.load(handle)
    selected = select(source)
    os.umask(0o077)
    fd = os.open(out, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(selected, handle, indent=2)
        handle.write("\n")
    print("SANITIZED_COPY_READY: " + str(out))
    print("FIELDS: " + ", ".join(FIELDS))
    print("ORIGINAL_UNCHANGED: true")
    print("UPLOAD_PERFORMED: false")
    print("EXTERNAL_HARDWARE_ATTESTATION: false")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        parser_error = type(exc).__name__ + ": " + str(exc)
        raise SystemExit("SANITIZATION_BLOCKED: " + parser_error)
