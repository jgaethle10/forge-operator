#!/usr/bin/env python3
"""Build bounded USGS 3DEP 1m index queries for private GEMS diagnostic tiles.

This tool DOES NOT make network requests or download rasters. The live USGS
ArcGIS result must be captured separately; optional response ingestion audits
only matching tile IDs and deterministic query digests, not original provenance,
raster pixel coverage, competition rights, or geological fault truth.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlencode

from gems_dem_metadata_recon import selected_tiles

SERVICE = 'https://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer/18/query'
PLAN_SCHEMA = 'evercraft.gems.usgs-3dep-one-meter-query-plan.v1'
RESULTS_SCHEMA = 'evercraft.gems.usgs-3dep-one-meter-responses.v1'
MAX_RECORDS = 2000
FIELDS = 'OBJECTID,project,project_id,pub_date,product_link,metadata_link'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                     allow_nan=False).encode('utf-8')).hexdigest()


def build_queries(atlas):
    tiles = selected_tiles(atlas)
    items = []
    for tile in tiles:
        west, south, east, north = tile['bbox_wgs84']
        geometry = {'xmin': west, 'ymin': south, 'xmax': east, 'ymax': north,
                    'spatialReference': {'wkid': 4326}}
        params = {
            'where': '1=1',
            'geometry': json.dumps(geometry, separators=(',', ':'), allow_nan=False),
            'geometryType': 'esriGeometryEnvelope',
            'inSR': '4326',
            'spatialRel': 'esriSpatialRelIntersects',
            'outFields': FIELDS,
            'returnGeometry': 'false',
            'orderByFields': 'OBJECTID ASC',
            'resultRecordCount': str(MAX_RECORDS),
            'f': 'json'
        }
        url = SERVICE + '?' + urlencode(params)
        payload = {'tile_id': tile['tile_id'], 'diagnostic_group': tile['diagnostic_group'],
                   'query_bbox_wgs84': tile['bbox_wgs84'],
                   'query_url': url, 'source_layer': SERVICE,
                   'query_is_bbox_screen_only': True,
                   'raster_coverage_or_rights_verified': False}
        payload['query_sha256'] = digest({'url': url, 'tile': tile['tile_id']})
        items.append(payload)
    return items


def _field(attributes, name, limit):
    v = attributes.get(name)
    if v is not None and (not isinstance(v, str) or len(v) > limit):
        raise ValueError('usgs_attribute_invalid_' + name)
    return v


def ingest(query_items, response_bundle):
    if (not isinstance(response_bundle, dict) or
        response_bundle.get('schema') != RESULTS_SCHEMA or
        not isinstance(response_bundle.get('responses'), list)):
        raise ValueError('usgs_responses_schema_invalid')
    rows = response_bundle['responses']
    expected = {item['tile_id']: item for item in query_items}
    if len(rows) != len(expected):
        raise ValueError('usgs_responses_incomplete')
    by_id = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('usgs_response_entry_invalid')
        tile_id = row.get('tile_id')
        if tile_id not in expected or tile_id in by_id:
            raise ValueError('usgs_response_tile_id_mismatch')
        if row.get('query_sha256') != expected[tile_id]['query_sha256']:
            raise ValueError('usgs_response_query_digest_mismatch')
        raw = row.get('response')
        if not isinstance(raw, dict) or raw.get('error'):
            raise ValueError('usgs_error_or_invalid_response')
        if raw.get('exceededTransferLimit') is True:
            raise ValueError('usgs_response_paginated_or_truncated')
        if not isinstance(raw.get('features'), list) or len(raw['features']) >= MAX_RECORDS:
            raise ValueError('usgs_features_invalid_or_at_limit')
        observed = []
        seen = set()
        for item in raw['features']:
            attr = item.get('attributes') if isinstance(item, dict) else None
            if not isinstance(attr, dict):
                raise ValueError('usgs_feature_attributes_invalid')
            oid = attr.get('OBJECTID')
            if isinstance(oid, bool) or not isinstance(oid, int) or oid < 0 or oid in seen:
                raise ValueError('usgs_feature_objectid_invalid')
            seen.add(oid)
            proj_id = attr.get('project_id')
            if proj_id is not None and (isinstance(proj_id, bool) or
                                        not isinstance(proj_id, (int, float))):
                raise ValueError('usgs_project_id_invalid')
            observed.append({'objectid': oid, 'project': _field(attr, 'project', 255),
                             'project_id': proj_id, 'pub_date': _field(attr, 'pub_date', 255),
                             'product_link': _field(attr, 'product_link', 2048),
                             'metadata_link': _field(attr, 'metadata_link', 2048)})
        by_id[tile_id] = {'tile_id': tile_id,
                          'usgs_index_records': observed,
                          'index_polygon_intersections_reported': len(observed),
                          'captured_response_sha256': digest(raw),
                          'response_has_explicit_no_transfer_limit': raw.get('exceededTransferLimit') is False,
                          'query_response_independently_authenticated': False,
                          'actual_dem_pixels_checked': False}
    return [by_id[item['tile_id']] for item in query_items]


def build(atlas, responses=None):
    queries = build_queries(atlas)
    received = ingest(queries, responses) if responses is not None else None
    return {'schema': PLAN_SCHEMA, 'source': SERVICE,
            'purpose': 'Read-only USGS 3DEP layer 18 1m project index query plan for balanced GEMS review/control tiles',
            'official_source_index_fieldnames': FIELDS.split(','),
            'network_calls_by_tool': 0, 'downloaded_raster_bytes': 0,
            'atlas_review_control_tile_count': len(queries),
            'queries': queries,
            'ingested_raw_response_count': len(received) if received is not None else 0,
            'captured_index_response_summaries': received,
            'metadata_index_response_is_not_actual_pixel_coverage': True,
            'public_3dep_data_not_confused_with_competition_granted_rights': True,
            'official_new_fault_labels_available': False, 'model_trained': False,
            'candidate_promoted': False, 'competition_submissions': 0,
            'next_gate': ('Obtain project-specific verified acquisition metadata and actual permissible raster bytes; '
                          'assess equal pixel coverage, vertical datum, processing and untouched spatial holdouts.')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--atlas', type=Path, required=True)
    parser.add_argument('--responses', type=Path, help='Optional locally saved USGS API response bundle; no fetching')
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    if args.receipt.exists():
        raise FileExistsError('usgs_query_receipt_exists')
    atlas = json.loads(args.atlas.read_text())
    responses = json.loads(args.responses.read_text()) if args.responses else None
    report = build(atlas, responses)
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    with args.receipt.open('x') as file:
        json.dump(report, file, indent=2, allow_nan=False)
        file.write('\n')
    print(json.dumps({'receipt': str(args.receipt),
                      'queries': len(report['queries']),
                      'responses_ingested': report['ingested_raw_response_count'],
                      'raster_downloads': 0, 'submission_made': False}))


if __name__ == '__main__':
    main()
