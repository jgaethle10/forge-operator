#!/usr/bin/env python3
"""GEMS-008E: capture actual HTTPS responses for the EXACT frozen 008D source plan.

Runs ONLY on an authorized DNS/network-capable owner-controlled environment.
No organizer data, model fitting, GeoTIFF, score or submission. Direct HTTPS,
certificate verification, no redirects or ambient proxy, two requests maximum:
(1) metadata; (2) only after metadata schema passes, original bounded query.
"""
import argparse
import datetime
import hashlib
import json
import os
import ssl
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from urllib.request import (
    Request, build_opener, HTTPSHandler, ProxyHandler,
)

from gems_008c_nbmg_service_scout import NoRedirect, require
from gems_008d_nbmg_activefault_probe import (
    FIELDS, LAYER_META_URL, QUERY_BASE, LIMIT, MAX_BYTES,
    verify_service_metadata, analyze_response,
)
from gems_008e_nbmg_response_import import CAPTURE_SCHEMA, inspect_capture

PLAN_SCHEMA = "evercraft.gems.nbmg-activefault-lineage-scout.v1"
PDF_SHA = "79676005376b460fe80583e41871db6f33e99dfaa25cfc1ce7cabe7c85ab35b3"
MANIFEST_SHA = "dbdf459eae05a1e8fffd04c2a87295d226c20643698e3ce65ac3d47bae753e0d"
EXPECTED_KEYS = {
    "f", "where", "geometry", "geometryType", "inSR", "spatialRel",
    "outFields", "returnGeometry", "resultRecordCount", "orderByFields",
}
FIXED_PARAMS = {
    "f": "json", "where": "1=1",
    "geometryType": "esriGeometryEnvelope", "inSR": "26911",
    "spatialRel": "esriSpatialRelIntersects",
    "outFields": ",".join(FIELDS), "returnGeometry": "false",
    "resultRecordCount": str(LIMIT), "orderByFields": "OBJECTID",
}
MAX_PLAN_BYTES = 16384


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def plan_from_file(path):
    path = Path(path)
    require(path.is_file() and not path.is_symlink() and
            0 < path.stat().st_size < MAX_PLAN_BYTES,
            "frozen_private_plan_missing_or_unsafe")
    data = json.loads(path.read_bytes())
    require(isinstance(data, dict) and data.get("schema") == PLAN_SCHEMA,
            "not_original_gems008d_plan")
    require(data.get("service_metadata_url") == LAYER_META_URL and
            data.get("target_layer") == LAYER_META_URL[:-7] and
            data.get("source_pdf_sha256") == PDF_SHA and
            data.get("source_manifest_sha256") == MANIFEST_SHA and
            data.get("max_features") == LIMIT and
            data.get("geometry_requested") is False and
            data.get("source_map_id") ==
                "nbmg-ofr-20-1-petrified-spring-sheet1-2020",
            "pinned_original_source_or_metadata_endpoint_changed")
    url = data.get("query_url")
    require(isinstance(url, str) and len(url) <= 3500 and
            url.startswith(QUERY_BASE + "?"),
            "bounded_query_url_changed")
    parsed = urlsplit(url)
    require(parsed.scheme == "https" and
            parsed.hostname == "web2.nbmg.unr.edu" and
            parsed.port is None and parsed.username is None and
            parsed.password is None and
            parsed.path == urlsplit(QUERY_BASE).path and
            parsed.fragment == "", "query_origin_or_path_changed")
    params = parse_qs(parsed.query, strict_parsing=True,
                      keep_blank_values=True)
    require(set(params) == EXPECTED_KEYS and
            all(len(v) == 1 for v in params.values()) and
            all(params[k][0] == v for k, v in FIXED_PARAMS.items()),
            "frozen_query_parameters_changed")
    envelope = json.loads(params["geometry"][0])
    require(envelope == data.get("query_envelope_epsg26911") and
            isinstance(envelope, dict) and
            set(envelope) == {
                "xmin", "ymin", "xmax", "ymax", "spatialReference"} and
            envelope["spatialReference"] == {"wkid":26911} and
            all(type(envelope[x]) in (int,float) for x in (
                "xmin","xmax","ymin","ymax")),
            "frozen_envelope_changed")
    return data


def get_capture(url, *, opener=None, clock=None):
    require(url == LAYER_META_URL or url.startswith(QUERY_BASE + "?"),
            "url_not_allowed_for_capture")
    if opener is None:
        # No inherited HTTP_PROXY, HTTPS_PROXY; allow TLS verification only.
        opener = build_opener(ProxyHandler({}),
                              HTTPSHandler(context=ssl.create_default_context()),
                              NoRedirect())
    request = Request(url, headers={
        "User-Agent": "Evercraft-GEMS-Frozen-Source-Capture/1.0",
        "Accept": "application/json",
    }, method="GET")
    with opener.open(request, timeout=12) as response:
        require(response.status == 200, "non_200_http_status")
        require(response.geturl() == url, "unexpected_transport_redirect")
        content_type = response.headers.get_content_type()
        require(content_type in ("application/json","text/plain"),
                "non_json_response_content_type")
        raw = response.read(MAX_BYTES + 1)
    require(len(raw) <= MAX_BYTES, "public_response_exceeds_1mib")
    body = json.loads(raw)
    require(isinstance(body, dict) and "error" not in body,
            "arcgis_json_error_or_non_object")
    if clock is None:
        clock = datetime.datetime.now(datetime.timezone.utc)
    stamp = clock.isoformat(timespec="seconds").replace("+00:00","Z")
    return {
        "schema": CAPTURE_SCHEMA,
        "method": "GET",
        "requested_url": url,
        "http_status": 200,
        "redirects_followed": False,
        "content_type": content_type,
        "captured_at_utc": stamp,
        "response": body,
    }, {
        "raw_http_body_sha256": sha256(raw),
        "raw_http_body_bytes": len(raw),
        "status_and_headers_observed_by_stdlib_https_client": True,
        "ca_verified_by_default_ssl_context": True,
        "peer_certificate_or_tls_handshake_not_archived": True,
    }


def execute(plan_path, private_new_dir, *, opener=None, clock=None):
    plan = plan_from_file(plan_path)
    dest = Path(private_new_dir)
    require(not dest.exists() and not dest.is_symlink() and
            dest.parent.is_dir(), "private_capture_dir_must_be_new")
    meta, meta_transport = get_capture(plan["service_metadata_url"],
                                       opener=opener, clock=clock)
    verified = verify_service_metadata(meta["response"])
    # Do not send a records request when the metadata preflight is invalid.
    query, query_transport = get_capture(plan["query_url"],
                                         opener=opener, clock=clock)
    summary = analyze_response(plan, query["response"], verified)
    require(summary["scored_submission_made"] is False and
            summary["source_independence_verified"] is False,
            "unsafe_source_evidence_claim")
    # Validate importer-compatible frozen URL + capture envelope in memory.
    # The final importer independently recalculates the URL from pinned inputs.
    from gems_008e_nbmg_response_import import MAX_CAPTURE_BYTES
    captures = (meta, query)
    for item in captures:
        encoded = (json.dumps(item,sort_keys=True,allow_nan=False,
                              separators=(",",":")) + "\n").encode()
        require(len(encoded) <= MAX_CAPTURE_BYTES,
                "capture_file_exceeds_import_budget")
    dest.mkdir(mode=0o700,parents=False,exist_ok=False)
    for name,item in zip(("layer-capture.json","query-capture.json"),
                         captures):
        path = dest/name
        with path.open("x") as f:
            os.chmod(path, 0o600)
            json.dump(item,f,indent=2,allow_nan=False)
            f.write("\n")
    evidence = {
        "schema": "evercraft.gems008e-direct-https-transport-evidence.v1",
        "original_private_plan_sha256": sha256(Path(plan_path).read_bytes()),
        "layer_response": meta_transport,
        "query_response": query_transport,
        "actual_feature_count": summary["feature_count"],
        "method_and_scoring_unchanged": True,
        "browser_transcription_used": False,
        "original_organizer_data_sent": False,
        "independent_fault_ground_truth_verified": False,
        "submission_made": False,
        "note": "stdlib HTTPS certificate verification performed; no packet trace or TLS peer certificate exported",
    }
    with (dest/"transport-evidence.json").open("x") as f:
        os.chmod(dest/"transport-evidence.json",0o600)
        json.dump(evidence,f,indent=2,allow_nan=False)
        f.write("\n")
    return evidence


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--frozen-plan",required=True,type=Path)
    p.add_argument("--new-private-dir",required=True,type=Path)
    a=p.parse_args()
    r=execute(a.frozen_plan,a.new_private_dir)
    print(json.dumps({
        "capture_dir":str(a.new_private_dir),
        "metadata_and_records_captured":True,
        "actual_feature_count":r["actual_feature_count"],
        "independent_validation_verified":False,
        "competition_submission":False,
    }))


if __name__ == "__main__":
    main()
