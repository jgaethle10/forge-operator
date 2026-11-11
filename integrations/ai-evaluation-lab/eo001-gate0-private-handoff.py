#!/usr/bin/env python3
"""Build a private, privacy-checked EO-001 Gate 0 handoff bundle.

No model run, network, secrets lookup, source-file edits, or upload. Input files
must already be private on NextGen; this only packages independently authored
reviewer output and the strict ten-field readiness receipt. No hardware
attestation or four-case decision assessment is implied.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import sys
import zipfile

MODEL_SHA = "7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5"
RUNTIME_SHA = "a32b9bdc4d664e21558726fee570b712124c624ccb37fa2eea93bb34a5a93591"
LAB_REVIEWER_PIN = "678829883f6c65e0b4d8dd8fd9dabe346631c7cd"
RECEIPT_FIELDS = {
    "schema", "state", "real_local_inference", "model_sha256",
    "runtime_sha256", "model_reply_sha256", "inference_seconds",
    "child_processes_stopped", "synthetic_only", "production_services_modified",
}
REVIEW_FIELDS = {
    "schema", "evidence_coverage", "hardware", "cases",
    "model_decision_counts", "unmatched_receipts", "problems",
    "live_model_execution", "promotion_allowed", "note",
}
HARDWARE_FIELDS = {
    "state", "provenance", "live_model_execution", "eo001_decisions_established",
}


class Blocked(ValueError):
    pass


def unique_object(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise Blocked("DUPLICATE_JSON_KEY")
        obj[key] = value
    return obj


def read_private_json(filename: Path):
    if not filename.is_absolute():
        raise Blocked("PRIVATE_REGULAR_INPUT_REQUIRED")
    fd = None
    try:
        fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        st = os.fstat(fd)
        if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1
                or st.st_uid != os.getuid() or (st.st_mode & 0o077)
                or st.st_size > 65536 or st.st_size == 0):
            raise Blocked("PRIVATE_INPUT_PERMISSION_OR_SIZE")
        with os.fdopen(fd, "rb") as stream:
            fd = None
            data = stream.read(65537)
        if len(data) > 65536:
            raise Blocked("PRIVATE_INPUT_PERMISSION_OR_SIZE")
    except OSError:
        raise Blocked("PRIVATE_REGULAR_INPUT_REQUIRED") from None
    finally:
        if fd is not None:
            os.close(fd)
    try:
        return json.loads(data.decode("utf-8"), object_pairs_hook=unique_object,
                          parse_constant=lambda _: (_ for _ in ()).throw(Blocked("NONFINITE_JSON")))
    except (UnicodeError, json.JSONDecodeError):
        raise Blocked("INVALID_JSON") from None

def validate_receipt(x):
    if not isinstance(x, dict) or set(x) != RECEIPT_FIELDS:
        raise Blocked("TEN_FIELD_RECEIPT_REQUIRED")
    if (x["schema"] != "evercraft.eo001.sovereign-inference-acceptance.v1"
            or x["state"] != "FIRST_INFERENCE_PASS"
            or x["model_sha256"] != MODEL_SHA or x["runtime_sha256"] != RUNTIME_SHA):
        raise Blocked("RECEIPT_PROVENANCE_OR_STATE_MISMATCH")
    for key, expected in (
        ("real_local_inference", True),
        ("child_processes_stopped", True),
        ("synthetic_only", True),
        ("production_services_modified", False),
    ):
        if x[key] is not expected:
            raise Blocked("RECEIPT_SCOPE_MISMATCH")
    duration = x["inference_seconds"]
    if (type(duration) not in (int, float) or not (0 < duration < 3600)):
        raise Blocked("INVALID_INFERENCE_DURATION")
    if (not isinstance(x["model_reply_sha256"], str)
            or re.fullmatch("[0-9a-f]{64}", x["model_reply_sha256"]) is None):
        raise Blocked("INVALID_REPLY_DIGEST")
    return x


def validate_review(x):
    if not isinstance(x, dict) or not set(x).issubset(REVIEW_FIELDS):
        raise Blocked("REVIEW_UNEXPECTED_FIELDS")
    required = REVIEW_FIELDS - {"note"}
    if not required.issubset(x):
        raise Blocked("REVIEW_MISSING_FIELDS")
    h = x["hardware"]
    if not isinstance(h, dict) or set(h) != HARDWARE_FIELDS:
        raise Blocked("HARDWARE_REVIEW_SHAPE")
    expected = {
        "state": "INFERENCE_REPORTED", "provenance": "UNVERIFIED_EXTERNAL",
        "eo001_decisions_established": False, "live_model_execution": None,
    }
    if h != expected:
        raise Blocked("INDEPENDENT_ATTESTATION_NOT_ESTABLISHED")
    if (x["schema"] != "EO-FIRST-RUN-REVIEW/0.1.0"
            or x["evidence_coverage"] != "NOT_SUPPLIED"
            or x["cases"] != {} or x["model_decision_counts"] != {}
            or type(x["unmatched_receipts"]) is not int or x["unmatched_receipts"] != 0
            or x["problems"] != [] or x["promotion_allowed"] is not False
            or x["live_model_execution"] is not None):
        raise Blocked("REVIEW_NOT_GATE0_CLEAN")
    # Never copy arbitrary reviewer prose, including possible retained log text.
    return {key: x[key] for key in sorted(required)}


def json_bytes(value):
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=True,
                       allow_nan=False) + "\n").encode("utf-8")


def build_bundle(receipt, review):
    safe_receipt = validate_receipt(receipt)
    safe_review = validate_review(review)
    entries = {
        "readiness-ten-fields.json": json_bytes(safe_receipt),
        "lab-review-status.json": json_bytes(safe_review),
    }
    metadata = {
        "schema": "evercraft.eo001.gate0.private-handoff.v1",
        "status": "PRIVATE_HANDOFF_REQUIRES_OWNER_INSPECTION",
        "local_lab_review_consistency": "PASS",
        "hardware_provenance": "UNVERIFIED_EXTERNAL",
        "four_case_model_decisions_established": False,
        "independent_lab_has_inspected_payload": False,
        "production_authority_granted": False,
        "lab_reviewer_source_pin": LAB_REVIEWER_PIN,
        "sha256": {name: hashlib.sha256(data).hexdigest()
                   for name, data in sorted(entries.items())},
    }
    entries["handoff-manifest.json"] = json_bytes(metadata)
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, data in sorted(entries.items()):
            member = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            member.compress_type = zipfile.ZIP_STORED
            member.external_attr = 0o600 << 16
            archive.writestr(member, data)
    return stream.getvalue()


def export(receipt_path, review_path, output_path):
    if not output_path.is_absolute() or output_path.is_symlink():
        raise Blocked("PRIVATE_OUTPUT_PATH_REQUIRED")
    if len({receipt_path.resolve(), review_path.resolve(), output_path.resolve()}) != 3:
        raise Blocked("INPUT_OUTPUT_PATH_COLLISION")
    parent = output_path.parent
    if parent.is_symlink():
        raise Blocked("PRIVATE_OUTPUT_DIRECTORY_REQUIRED")
    st = parent.stat()
    if (not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid()
            or (st.st_mode & 0o077)):
        raise Blocked("PRIVATE_OUTPUT_DIRECTORY_REQUIRED")
    receipt = read_private_json(receipt_path)
    review = read_private_json(review_path)
    content = build_bundle(receipt, review)
    fd = os.open(output_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as sink:
            sink.write(content)
    except BaseException:
        output_path.unlink(missing_ok=True)
        raise
    return len(content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", required=True, type=Path)
    parser.add_argument("--review", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        export(args.receipt, args.review, args.output)
    except (Blocked, OSError, ValueError, TypeError) as exc:
        kind = str(exc) if isinstance(exc, Blocked) else type(exc).__name__
        print("EO001_PRIVATE_HANDOFF: BLOCKED (" + kind + ")", file=sys.stderr)
        return 2
    print("EO001_PRIVATE_HANDOFF: CREATED (3 allowlisted files, owner-only ZIP)")
    print("NOT_SENT; NO_ATTESTATION; INSPECT_LOCALLY_BEFORE_PRIVATE_SHARING")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
