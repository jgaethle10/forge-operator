#!/usr/bin/env python3
"""GEMS-008E: offline validation of exact GEMS-008D browser-captured public REST responses.

Transport-only repair for a DNS-disabled research container. NO new fault data,
new query geometry, scoring, training or publisher-rights inference. A saved
browser response is not cryptographic proof of the claimed upstream server.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

from gems_008c_nbmg_service_scout import require, write_once
from gems_008d_nbmg_activefault_probe import (
    LAYER_META_URL, MAX_BYTES, QUERY_BASE, analyze_response,
    plan_from_private_source, verify_service_metadata,
)

SCHEMA = "evercraft.gems.nbmg-activefault-offline-response-audit.v1"
CAPTURE_SCHEMA = "evercraft.gems.public-arcgis-browser-capture.v1"
MAX_CAPTURE_BYTES = 2 * 1024 * 1024


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def inspect_capture(path, expected_url):
    path = Path(path)
    require(path.is_file() and not path.is_symlink() and
            0 < path.stat().st_size <= MAX_CAPTURE_BYTES,
            "capture_missing_symlink_or_oversized")
    raw = path.read_bytes()
    require(len(raw) <= MAX_CAPTURE_BYTES, "capture_over_limit")
    item = json.loads(raw)
    require(isinstance(item, dict) and
            item.get("schema") == CAPTURE_SCHEMA,
            "capture_envelope_schema_invalid")
    require(item.get("requested_url") == expected_url,
            "captured_request_url_did_not_match_frozen_plan")
    require(item.get("http_status") == 200 and
            type(item.get("http_status")) is int and
            item.get("redirects_followed") is False,
            "captured_status_or_redirect_invalid")
    require(item.get("content_type") in
            ("application/json", "text/plain"),
            "captured_content_type_invalid")
    require(item.get("method") == "GET", "captured_http_method_invalid")
    require(isinstance(item.get("captured_at_utc"), str) and
            len(item["captured_at_utc"]) >= 20 and
            item["captured_at_utc"].endswith("Z"),
            "capture_time_unverified")
    body = item.get("response")
    require(isinstance(body, dict) and "error" not in body,
            "captured_arcgis_response_error")
    body_raw = json.dumps(body,sort_keys=True,separators=(",",":"),
                          allow_nan=False).encode("utf-8")
    require(len(body_raw) <= MAX_BYTES, "captured_response_over_limit")
    return body, {
        "captured_file_sha256": sha256(raw),
        "canonical_json_body_sha256": sha256(body_raw),
        "captured_at_utc": item["captured_at_utc"],
        "requested_url_sha256": sha256(expected_url.encode()),
        "http_status": 200,
        "redirects_followed": False,
        "browser_response_claim_requires_external_tls_provenance": True,
    }


def evaluate(manifest,pdf,layer_capture,query_capture):
    plan=plan_from_private_source(manifest,pdf)
    # Exact URL equality binds imported responses to original pinned
    # PDF-derived envelope and exact field/limit contract.
    layer,layer_receipt=inspect_capture(
        layer_capture,plan["service_metadata_url"])
    verified=verify_service_metadata(layer)
    query,query_receipt=inspect_capture(
        query_capture,plan["query_url"])
    report=analyze_response(plan,query,verified)
    require(report["scored_submission_made"] is False and
            report["source_independence_verified"] is False,
            "unexpected_competition_or_independence_state")
    # No URLs, envelope, source coordinates, feature IDs or raw responses
    # are copied to this aggregate receipt.
    return {
        "schema": SCHEMA,
        "original_gems008d_protocol_schema": plan["schema"],
        "source_map_id": plan["source_map_id"],
        "source_pdf_sha256": plan["source_pdf_sha256"],
        "source_manifest_sha256": plan["source_manifest_sha256"],
        "layer_capture":layer_receipt,
        "query_capture":query_receipt,
        "service_schema":verified,
        "feature_count":report["feature_count"],
        "field_distributions":report["field_distributions"],
        "metadata_only":True,
        "fault_geometry_received":False,
        "exact_valid_mask_overlap_verified":False,
        "independent_fault_ground_truth_verified":False,
        "source_lineage_and_competition_rights_unverified":True,
        "external_capture_transport_not_independently_authenticated":True,
        "decision":"HOLD: browser-captured public source metadata, not independent validation",
        "candidate_created":False,
        "scored_submission_made":False
    }


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest",type=Path,required=True)
    parser.add_argument("--pdf",type=Path,required=True)
    parser.add_argument("--layer-capture",type=Path,required=True)
    parser.add_argument("--query-capture",type=Path,required=True)
    parser.add_argument("--receipt",type=Path,required=True)
    args=parser.parse_args()
    require(args.receipt.parent.is_dir() and
            not args.receipt.exists() and
            not args.receipt.is_symlink(),"receipt_must_be_new")
    result=evaluate(args.manifest,args.pdf,
                    args.layer_capture,args.query_capture)
    write_once(args.receipt,result)
    print(json.dumps({"receipt":str(args.receipt),
                      "feature_count":result["feature_count"],
                      "independent_validation":False,
                      "submission_made":False}))


if __name__=="__main__":
    main()
