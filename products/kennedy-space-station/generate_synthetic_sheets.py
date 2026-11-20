#!/usr/bin/env python3
"""Create a synthetic-only, source-bound Kennedy S-0/A-0 validation artifact.

Never use real imagery or customer records in this CLI.
"""
import argparse
import hashlib
import json
from pathlib import Path

import sheet_compiler
from test_sheet_compiler import synthetic_fixture


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--output-dir",required=True)
    args=p.parse_args()
    output=Path(args.output_dir)
    output.mkdir(parents=True,exist_ok=True)
    study,site,sm,context,cm,address=synthetic_fixture()
    pdf=sheet_compiler.compile_two_sheet_synthetic(study,site,sm,context,cm,address)
    (output/"kennedy-synthetic-s0-a0.pdf").write_bytes(pdf)
    (output/"synthetic-site.png").write_bytes(site)
    (output/"synthetic-context.png").write_bytes(context)
    receipt={
        "schema":"evercraft.kss.synthetic-s0a0.qa.v1",
        "fixture":"entirely_synthetic_owned_local_only",
        "pages":2,
        "pdf_sha256":hashlib.sha256(pdf).hexdigest(),
        "model_sha256":study["model_sha256"],
        "site_png_sha256":sm["expected_sha256"],
        "context_png_sha256":cm["expected_sha256"],
        "human_visual_qa":"not_performed",
        "site_address_is_real":False,
        "site_georeferenced":False,
        "survey_grade":False,
        "construction_ready":False,
        "customer_release_authorized":False
    }
    (output/"source-qa-receipt.json").write_text(json.dumps(receipt,indent=2,sort_keys=True)+"\n")
    print(json.dumps(receipt,indent=2,sort_keys=True))


if __name__=="__main__":
    main()
