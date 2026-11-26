#!/usr/bin/env python3
"""Emit review-only Kennedy render evidence for the existing Kaidance heartbeat.

Never asserts human visual approval, rights to real imagery, georeferencing,
source ownership for outside assets, or authority to modify/deploy software.
Input comes from Kennedy's already generated *synthetic* private proof folder.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

SCHEMA = "evercraft.kennedy.quality-proof.v1"


def read_limited_json(base, filename):
    path = base / filename
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 256000:
        raise ValueError("kennedy_proof_missing_or_unsafe:" + filename)
    return json.loads(path.read_text(encoding="utf-8"))


def produce(source_dir, commit):
    base = Path(source_dir).resolve()
    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise ValueError("kennedy_source_commit_invalid")
    metadata = read_limited_json(base, "private-source-review-qa-receipt.json")
    raster = read_limited_json(base, "private-review-render-qa-receipt.json")
    pdf_path = base / "kennedy-private-review-synthetic.pdf"
    if pdf_path.is_symlink() or not pdf_path.is_file() or pdf_path.stat().st_size > 30000000:
        raise ValueError("kennedy_private_pdf_missing_or_unsafe")
    pdf_bytes = pdf_path.read_bytes()
    if (not pdf_bytes.startswith(b'%PDF-1.4') or b'/Count 2' not in pdf_bytes
            or b'PRIVATE SOURCE REVIEW' not in pdf_bytes
            or b'NOT FOR EXTERNAL DELIVERY' not in pdf_bytes):
        raise ValueError('kennedy_private_pdf_structure_or_release_warning_missing')
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
    if (metadata.get("schema") != "evercraft.kss.private-source-review.qa.v1"
            or metadata.get("fixture") != "entirely_synthetic_owned_local_only"
            or metadata.get("pages") != 2
            or metadata.get("actual_vault_stored_bytes_used") is not True
            or metadata.get("real_site_address") is not False
            or metadata.get("human_visual_review") != "not_performed"
            or metadata.get("external_release_authorized") is not False
            or metadata.get("source_rights_independently_verified") is not False
            or metadata.get("pdf_sha256") != pdf_hash):
        raise ValueError("kennedy_private_synthetic_provenance_unverified")
    if (raster.get("schema") != "evercraft.kss.two-sheet-render-qa.v1"
            or raster.get("status") != "automated_pixel_qa_passed"
            or raster.get("human_visual_qa") != "not_performed"
            or raster.get("release_authorized") is not False
            or raster.get("real_licensed_source_qa") != "not_performed"
            or [p.get("sheet") for p in raster.get("pages", [])] != ["S-0", "A-0"]
            or any(p.get("automated_pixel_qa") != "passed" for p in raster["pages"])):
        raise ValueError("kennedy_raster_pixel_qa_unverified")
    receipt = {
        "schema": SCHEMA,
        "observed_at": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "product_key": "kennedy-space-station",
        "source_commit": commit,
        "source_rights_state": "synthetic_fixture",
        "tests": {
            "source_contract_passed": True,
            "render_test_passed": True,
            "pdf_visual_review_passed": False,
        },
        "quality_gate": "needs_improvement",
        "gaps": [
            "human_visual_review_missing",
            "licensed_imagery_missing",
            "earth_registration_missing",
            "site_plan_parity_unverified",
        ],
        "authority": {
            "execution_authorized": False,
            "production_release_authorized": False,
            "engineering_authority": False,
            "actual_development_completed": False,
            "customer_data_used": False,
        },
        "receipt_hash": None,
    }
    # ASCII-only fields and compact insertion-order JSON match JS JSON.stringify.
    encoded = json.dumps(receipt, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    receipt["receipt_hash"] = "sha256:" + hashlib.sha256(encoded).hexdigest()
    return receipt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--out-file", required=True)
    args = parser.parse_args()
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    receipt = produce(args.input_dir, commit)
    out = Path(args.out_file).absolute()
    out.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if out.exists() and out.is_symlink():
        raise ValueError("kennedy_output_symlink_refused")
    fd, name = tempfile.mkstemp(prefix=".kennedy-proof-", dir=out.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(receipt, stream, indent=2)
            stream.write("\n")
        os.chmod(name, 0o600)
        os.replace(name, out)
    finally:
        if os.path.exists(name):
            os.unlink(name)
    print("KENNEDY_KAIDANCE_SOURCE_RECEIPT_READY")
    print("HOLD: real imagery, georeference, human visual QA, resident handoff, engineering release")


if __name__ == "__main__":
    main()
