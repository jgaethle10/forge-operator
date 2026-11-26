#!/usr/bin/env python3
"""GEMS-008D: conservative metadata-only NBMG active-fault source probe.

Separate older NGDS active-fault compilation, NOT a replacement for the broken
2013 OneGeology 1:24k service. No fault trace geometry or original labels.
"""
import argparse
import hashlib
import json
import os
import ssl
from collections import Counter
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPSHandler, ProxyHandler

from gems_008c_nbmg_service_scout import (
    NoRedirect, preregister, require, write_once,
)

SERVICE = ("https://web2.nbmg.unr.edu/arcgis/rest/services/"
           "NV_Data/NVActiveFaults/MapServer/0")
LAYER_META_URL = SERVICE + "?f=json"
QUERY_BASE = SERVICE + "/query"
FIELDS = ("OBJECTID", "FeatureURI", "Name", "Source",
          "PositionAccuracy", "ObservationMethod", "FeatureType")
LIMIT = 100
MAX_BYTES = 1024 * 1024
SCHEMA = "evercraft.gems.nbmg-activefault-lineage-scout.v1"


def plan_from_private_source(manifest, pdf):
    upstream = preregister(manifest, pdf)
    envelope = upstream["query_envelope_epsg26911"]
    params = {
        "f": "json",
        "where": "1=1",
        "geometry": json.dumps(envelope, separators=(",", ":")),
        "geometryType": "esriGeometryEnvelope",
        "inSR": "26911",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": ",".join(FIELDS),
        "returnGeometry": "false",
        "resultRecordCount": str(LIMIT),
        "orderByFields": "OBJECTID",
    }
    return {
        "schema": SCHEMA,
        "source_map_id": upstream["source_map_id"],
        "source_pdf_sha256": upstream["source_pdf_sha256"],
        "source_manifest_sha256": upstream["source_manifest_sha256"],
        "target_layer": SERVICE,
        "service_metadata_url": LAYER_META_URL,
        "query_url": QUERY_BASE + "?" + urlencode(params),
        "query_envelope_epsg26911": envelope,
        "source_compilation": "NBMG NGDS Nevada active faults, NOT 1:24k OneGeology",
        "max_features": LIMIT,
        "geometry_requested": False,
        "exact_geodawn_valid_mask_overlap_known": False,
        "fault_lineage_independent": False,
        "independent_validation_authorized": False,
        "competition_rights_confirmed": False,
        "candidate_created": False,
        "submission_made": False,
    }


def safe_get_json(url, *, transport=None):
    require(url == LAYER_META_URL or url.startswith(QUERY_BASE + "?"),
            "nonallowlisted_nbmg_url")
    require(len(url) <= 3500 and url.startswith("https://"),
            "query_url_too_long")
    if transport is not None:
        obj = transport(url)
    else:
        # Ignore ambient user proxy configuration, do not follow redirects.
        opener = build_opener(
            ProxyHandler({}),
            HTTPSHandler(context=ssl.create_default_context()),
            NoRedirect())
        req = Request(url, headers={
            "User-Agent": "Evercraft-GEMS-Source-Provenance/1.0",
            "Accept": "application/json",
        })
        with opener.open(req, timeout=12) as response:
            require(response.status == 200, "nbmg_http_status_invalid")
            require(response.headers.get_content_type() in (
                "application/json", "text/plain", "application/octet-stream"),
                "nbmg_response_content_type_invalid")
            raw = response.read(MAX_BYTES + 1)
        require(len(raw) <= MAX_BYTES, "nbmg_response_over_budget")
        obj = json.loads(raw)
    require(isinstance(obj, dict) and "error" not in obj,
            "arcgis_200_or_http_error")
    return obj


def verify_service_metadata(data):
    require(data.get("type") == "Feature Layer", "not_an_arcgis_feature_layer")
    require(data.get("geometryType") == "esriGeometryPolyline",
            "unexpected_fault_geometry_type")
    fields = data.get("fields")
    require(isinstance(fields, list), "layer_fields_missing")
    lookup = {}
    for field in fields:
        if isinstance(field, dict) and isinstance(field.get("name"), str):
            lookup[field["name"]] = field.get("type")
    require(all(x in lookup for x in FIELDS),
            "nbmg_activefault_field_schema_changed")
    require(lookup["OBJECTID"] == "esriFieldTypeOID",
            "nbmg_activefault_oid_type_changed")
    require(data.get("maxRecordCount", LIMIT) >= LIMIT,
            "nbmg_activefault_page_cap_too_low")
    return { "layer": "NBMG NVActiveFaults/MapServer/0",
             "verified_feature_layer": True,
             "geometry_type": data["geometryType"],
             "fields": list(FIELDS),
             "source_lineage_not_yet_checked": True }


def analyze_response(plan, response, service_receipt):
    require(response.get("exceededTransferLimit") is not True,
            "arcgis_result_was_truncated")
    features = response.get("features")
    require(isinstance(features, list) and len(features) < LIMIT,
            "arcgis_missing_features_or_at_page_limit")
    require(response.get("geometryType") in (None, "esriGeometryPolyline"),
            "query_geometry_type_changed")
    groups = {field: Counter() for field in FIELDS[1:]}
    ids = set()
    for feature in features:
        require(isinstance(feature, dict) and
                feature.get("geometry") in (None, {}),
                "geometry_disclosure_in_metadata_only_query")
        attrs = feature.get("attributes")
        require(isinstance(attrs, dict) and
                all(field in attrs for field in FIELDS),
                "missing_source_field")
        oid = attrs["OBJECTID"]
        require(type(oid) is int and oid not in ids,
                "duplicate_or_invalid_feature_id")
        ids.add(oid)
        for field, counter in groups.items():
            value = attrs[field]
            require(value is None or
                    isinstance(value, str) and len(value) <= 600,
                    "unexpected_source_field_data")
            counter[(value or "(missing)").strip()[:300]] += 1
    return {
        "schema": SCHEMA,
        "service_receipt": service_receipt,
        "source_map_id": plan["source_map_id"],
        "source_pdf_sha256": plan["source_pdf_sha256"],
        "source_manifest_sha256": plan["source_manifest_sha256"],
        "target_layer": SERVICE,
        "feature_count": len(features),
        "metadata_only": True,
        "field_distributions": {
            f: dict(sorted(v.items())) for f, v in groups.items()
        },
        "query_envelope_only": True,
        "fault_trace_geometry_received": False,
        "exact_valid_mask_intersections_verified": False,
        "source_independence_verified": False,
        "license_and_competition_sharing_verified": False,
        "new_fault_ground_truth_available": False,
        "validation_decision": "HOLD: source metadata only, not an independent dataset",
        "scored_submission_made": False,
        "candidate_created": False,
    }


def execute(manifest, pdf, receipt, *, allow_live=False, transport=None):
    dest = Path(receipt)
    require(dest.parent.is_dir() and not dest.exists()
            and not dest.is_symlink(), "receipt_must_be_new_and_private")
    plan = plan_from_private_source(manifest, pdf)
    if not allow_live:
        record = {
            **plan,
            "mode": "offline_source_request_plan",
            "actual_arcgis_records_received": False,
        }
    else:
        layer = safe_get_json(plan["service_metadata_url"],
                              transport=transport)
        verified = verify_service_metadata(layer)
        response = safe_get_json(plan["query_url"], transport=transport)
        record = analyze_response(plan, response, verified)
    write_once(dest, record)
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--receipt", required=True, type=Path)
    parser.add_argument("--allow-public-nbmg-query", action="store_true")
    args = parser.parse_args()
    report = execute(args.manifest, args.pdf, args.receipt,
                     allow_live=args.allow_public_nbmg_query)
    print(json.dumps({
        "receipt": str(args.receipt),
        "public_metadata_only": True,
        "actual_records": report.get("feature_count"),
        "eligible_for_validation": False,
        "scored_submission_made": False,
    }))


if __name__ == "__main__":
    main()
