#!/usr/bin/env python3
"""Generate review-only Kennedy two-sheet PDF from entirely synthetic vaulted PNGs.

This intentionally exercises the source vault path and the new operator review
compiler. Output must never be interpreted as a real site, rights approval,
geographic registration, customer deliverable or engineering drawing.
"""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile

import aerial_vault
import sheet_compiler
from test_sheet_compiler import synthetic_fixture


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--output-dir",required=True)
    args = p.parse_args()
    root = Path(args.output_dir)
    root.mkdir(parents=True,exist_ok=True)
    study,site,sm,context,cm,address = synthetic_fixture()
    with tempfile.TemporaryDirectory(prefix="kss-review-vault-fixture-") as tmp:
        vault=aerial_vault.AerialVault(Path(tmp)/"aerial")
        vault.init()
        site_receipt=vault.save(study["model"]["site_id"],"site",sm,site)
        context_receipt=vault.save(study["model"]["site_id"],"context",cm,context)
        site_record,site_pixels=vault.get(study["model"]["site_id"],site_receipt["source_id"],include_bytes=True)
        context_record,context_pixels=vault.get(study["model"]["site_id"],context_receipt["source_id"],include_bytes=True)
        pdf=sheet_compiler.compile_two_sheet_private_review(
            study,site_pixels,site_record,context_pixels,context_record,address)
    if not pdf.startswith(b"%PDF-1.4") or b"/Count 2" not in pdf:
        raise RuntimeError("PRIVATE_REVIEW_TWO_PAGE_PDF_MISSING")
    if not all(item in pdf for item in (
        b"PRIVATE SOURCE REVIEW",b"NOT FOR EXTERNAL DELIVERY",
        site_receipt["source_id"].encode(),
        context_receipt["source_id"].encode(),
        study["model_sha256"][:32].encode())):
        raise RuntimeError("PRIVATE_REVIEW_PROVENANCE_OR_WARNING_MISSING")
    path=root/"kennedy-private-review-synthetic.pdf"
    path.write_bytes(pdf)
    receipt={
        "schema":"evercraft.kss.private-source-review.qa.v1",
        "fixture":"entirely_synthetic_owned_local_only",
        "pdf_sha256":hashlib.sha256(pdf).hexdigest(),
        "model_sha256":study["model_sha256"],
        "site_source_id":site_receipt["source_id"],
        "context_source_id":context_receipt["source_id"],
        "site_image_sha256":site_receipt["image_sha256"],
        "context_image_sha256":context_receipt["image_sha256"],
        "pages":2,
        "actual_vault_stored_bytes_used":True,
        "real_site_address":False,
        "human_visual_review":"not_performed",
        "source_rights_independently_verified":False,
        "earth_crs_or_north_verified":False,
        "survey_grade":False,
        "external_release_authorized":False
    }
    (root/"private-source-review-qa-receipt.json").write_text(json.dumps(receipt,indent=2,sort_keys=True)+"\n")
    print("PASS: source-vault-to-PDF private two-sheet synthetic proof")
    print("HOLD: independent rights, earth-coordinate verification, client delivery")


if __name__=="__main__":
    main()
