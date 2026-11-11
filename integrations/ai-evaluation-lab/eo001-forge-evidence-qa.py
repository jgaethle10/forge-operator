#!/usr/bin/env python3
"""Forge EO-001 independent handoff QA: never uploads, executes models, or sends messages.

This is a deterministic safety reviewer for an intentionally narrow research
artifact, not an LLM review, physical attestation or public-release authorization.
It checks private source files AGAINST the already produced ZIP and emits a
machine-readable QA receipt with four separate review lanes. No founder has
to inspect the underlying JSON to run this quality gate.
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

PINS = {
    "model": "7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5",
    "runtime": "a32b9bdc4d664e21558726fee570b712124c624ccb37fa2eea93bb34a5a93591",
    "reviewer": "678829883f6c65e0b4d8dd8fd9dabe346631c7cd",
}
FILES = {"handoff-manifest.json", "lab-review-status.json", "readiness-ten-fields.json"}
RECEIPT_KEYS = {
    "schema", "state", "real_local_inference", "model_sha256",
    "runtime_sha256", "model_reply_sha256", "inference_seconds",
    "child_processes_stopped", "synthetic_only", "production_services_modified",
}
REVIEW_KEYS = {
    "schema", "evidence_coverage", "hardware", "cases", "model_decision_counts",
    "unmatched_receipts", "problems", "live_model_execution", "promotion_allowed",
}
HW_KEYS = {"state", "provenance", "live_model_execution", "eo001_decisions_established"}
MANIFEST_KEYS = {
    "schema", "status", "local_lab_review_consistency",
    "hardware_provenance", "four_case_model_decisions_established",
    "independent_lab_has_inspected_payload", "production_authority_granted",
    "lab_reviewer_source_pin", "sha256",
}


class ReviewBlocked(Exception):
    pass


def require(ok, code):
    if not ok:
        raise ReviewBlocked(code)


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def load_strict(data):
    require(isinstance(data, bytes) and 0 < len(data) <= 65536, "JSON_SIZE")
    try:
        return json.loads(data.decode("utf-8"), object_pairs_hook=unique_pairs,
                          parse_constant=lambda _: (_ for _ in ()).throw(ReviewBlocked("NONFINITE_JSON")))
    except (ValueError, UnicodeError):
        raise ReviewBlocked("INVALID_JSON") from None


def read_private(path, max_bytes=65536):
    require(path.is_absolute(), "ABSOLUTE_PATH_REQUIRED")
    fd = None
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
                and info.st_uid == os.getuid() and not (info.st_mode & 0o077)
                and 0 < info.st_size <= max_bytes, "PRIVATE_FILE_SECURITY")
        with os.fdopen(fd, "rb") as stream:
            fd = None
            data = stream.read(max_bytes + 1)
        require(0 < len(data) <= max_bytes, "PRIVATE_FILE_SECURITY")
        return data
    except OSError:
        raise ReviewBlocked("PRIVATE_FILE_UNAVAILABLE") from None
    finally:
        if fd is not None:
            os.close(fd)


def canonical(data):
    return (json.dumps(data, sort_keys=True, indent=2, ensure_ascii=True, allow_nan=False) + "\n").encode()


def validate_receipt(x):
    require(isinstance(x, dict) and set(x) == RECEIPT_KEYS, "RECEIPT_ALLOWLIST")
    require(x["schema"] == "evercraft.eo001.sovereign-inference-acceptance.v1"
            and x["state"] == "FIRST_INFERENCE_PASS", "RECEIPT_STATE")
    require(x["model_sha256"] == PINS["model"] and x["runtime_sha256"] == PINS["runtime"], "RECEIPT_PIN")
    require(all(x[k] is v for k, v in (
        ("real_local_inference", True), ("child_processes_stopped", True),
        ("synthetic_only", True), ("production_services_modified", False))), "RECEIPT_SCOPE")
    require(isinstance(x["model_reply_sha256"], str) and
            re.fullmatch(r"[0-9a-f]{64}", x["model_reply_sha256"]) is not None, "REPLY_SHA")
    n = x["inference_seconds"]
    require(type(n) in (int, float) and 0 < n < 3600, "RECEIPT_DURATION")
    return x


def validate_review(x, source=False):
    require(isinstance(x, dict), "REVIEW_OBJECT")
    require(set(x) == REVIEW_KEYS if not source else
            set(x) in (REVIEW_KEYS, REVIEW_KEYS | {"note"}), "REVIEW_ALLOWLIST")
    require(x["schema"] == "EO-FIRST-RUN-REVIEW/0.1.0"
            and x["evidence_coverage"] == "NOT_SUPPLIED"
            and x["cases"] == {} and x["model_decision_counts"] == {}
            and x["problems"] == [] and
            type(x["unmatched_receipts"]) is int and x["unmatched_receipts"] == 0
            and x["live_model_execution"] is None
            and x["promotion_allowed"] is False, "REVIEW_CONSISTENCY")
    h = x["hardware"]
    require(isinstance(h, dict) and set(h) == HW_KEYS, "REVIEW_HARDWARE_SHAPE")
    require(h == {"state": "INFERENCE_REPORTED", "provenance": "UNVERIFIED_EXTERNAL",
                  "live_model_execution": None, "eo001_decisions_established": False},
            "REVIEW_PROVENANCE")
    return {key: x[key] for key in sorted(REVIEW_KEYS)}


def validate_manifest(m, bodies):
    require(isinstance(m, dict) and set(m) == MANIFEST_KEYS, "MANIFEST_ALLOWLIST")
    require(m == {
        "schema": "evercraft.eo001.gate0.private-handoff.v1",
        "status": "PRIVATE_HANDOFF_REQUIRES_OWNER_INSPECTION",
        "local_lab_review_consistency": "PASS",
        "hardware_provenance": "UNVERIFIED_EXTERNAL",
        "four_case_model_decisions_established": False,
        "independent_lab_has_inspected_payload": False,
        "production_authority_granted": False,
        "lab_reviewer_source_pin": PINS["reviewer"],
        "sha256": {name: hashlib.sha256(data).hexdigest() for name, data in bodies.items()},
    }, "MANIFEST_INTEGRITY")
    return m


def audit(bundle_bytes, receipt_source_bytes, review_source_bytes):
    # Distinct checks, keeping physical provenance and external-send authorization separate.
    require(0 < len(bundle_bytes) <= 262144, "ZIP_SIZE")
    try:
        with zipfile.ZipFile(io.BytesIO(bundle_bytes)) as z:
            members = z.infolist()
            require(len(members) == 3 and {i.filename for i in members} == FILES
                    and len(set(i.filename for i in members)) == 3, "ZIP_EXACT_MEMBER_SET")
            bodies = {}
            for info in members:
                require(info.compress_type == zipfile.ZIP_STORED and not (info.flag_bits & 1)
                        and info.file_size <= 65536 and info.compress_size == info.file_size
                        and (info.external_attr >> 16 & 0o777) == 0o600
                        and info.filename in FILES and not info.is_dir(), "ZIP_MEMBER_SECURITY")
                bodies[info.filename] = z.read(info.filename)
    except (zipfile.BadZipFile, zipfile.LargeZipFile, RuntimeError, OSError, EOFError):
        raise ReviewBlocked("ZIP_INVALID") from None

    b_receipt = validate_receipt(load_strict(bodies["readiness-ten-fields.json"]))
    b_review = validate_review(load_strict(bodies["lab-review-status.json"]))
    validate_manifest(load_strict(bodies["handoff-manifest.json"]),
                      {name: bodies[name] for name in ("readiness-ten-fields.json", "lab-review-status.json")})
    s_receipt = validate_receipt(load_strict(receipt_source_bytes))
    s_review = validate_review(load_strict(review_source_bytes), source=True)

    require(b_receipt == s_receipt, "RECEIPT_SOURCE_MISMATCH")
    require(b_review == s_review, "LAB_REVIEW_SOURCE_MISMATCH")
    require(bodies["readiness-ten-fields.json"] == canonical(s_receipt), "RECEIPT_SERIALIZATION_CHANGED")
    require(bodies["lab-review-status.json"] == canonical(s_review), "REVIEW_SERIALIZATION_CHANGED")

    return {
        "schema": "evercraft.eo001.forge-evidence-qa.v1",
        "mission": "EO-001",
        "stage": "gate0_evidence_handoff",
        "status": "AUTOMATED_QA_PASSED_PRIVATE_HANDOFF_CANDIDATE",
        "bundle_sha256": hashlib.sha256(bundle_bytes).hexdigest(),
        "lab_reviewer_source_pin": PINS["reviewer"],
        "lanes": {
            "forge_integrity": "PASS",
            "privacy_allowlist": "PASS",
            "lab_receipt_consistency": "PASS",
            "provenance_separation": "PASS",
            "external_send_authority": "HELD",
        },
        "independent_lab_inspection_complete": False,
        "physical_inference_attested": False,
        "four_scenario_model_success": False,
        "external_send_authorized": False,
        "production_authority_granted": False,
        "manual_json_inspection_required_for_this_contract": False,
        "limitations": "Automated fixed-schema checks; no claim of generalized secret scanning, independent hardware attestation, or authorization to send.",
    }


def inspect_bundle(bundle, receipt, review, output):
    require(len({str(p.resolve()) for p in (bundle, receipt, review, output)}) == 4,
            "INPUT_OUTPUT_COLLISION")
    require(output.is_absolute() and not output.is_symlink(), "OUTPUT_PATH")
    directory = output.parent
    require(directory.is_dir() and not directory.is_symlink()
            and directory.stat().st_uid == os.getuid()
            and not (directory.stat().st_mode & 0o077), "OUTPUT_DIRECTORY_PRIVATE")
    report = audit(read_private(bundle, 262144), read_private(receipt), read_private(review))
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(canonical(report))
    except BaseException:
        output.unlink(missing_ok=True)
        raise
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--bundle", required=True, type=Path)
    p.add_argument("--receipt", required=True, type=Path)
    p.add_argument("--review", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    args = p.parse_args()
    try:
        result = inspect_bundle(args.bundle, args.receipt, args.review, args.output)
    except (ReviewBlocked, OSError, ValueError, TypeError) as exc:
        reason = str(exc) if isinstance(exc, ReviewBlocked) else type(exc).__name__
        print("FORGE_EVIDENCE_QA: BLOCKED (" + reason + ")", file=sys.stderr)
        return 2
    print("FORGE_EVIDENCE_QA: PASS")
    for name, state in result["lanes"].items():
        print(name.upper() + ": " + state)
    print("PRIVATE_BUNDLE_SHA256: " + result["bundle_sha256"])
    print("NO_MANUAL_JSON_INSPECTION; NOT_SENT; LAB_INSPECTION_PENDING; PRODUCTION_HELD")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
