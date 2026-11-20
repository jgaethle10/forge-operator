#!/usr/bin/env python3
"""Capture bounded public USGS 3DEP 1m index responses for GEMS study tiles.

The only network destination is the fixed official USGS ArcGIS query endpoint.
No raster downloads, input uploads, fault-label retrieval or model execution.
Default is FAIL CLOSED: `--allow-public-usgs-query` is explicitly required.
Owner-private diagnostic coordinates are sent to the public USGS service only
when this flag is intentionally supplied. The output stays in local private
storage and must never be committed to a public GitHub repository.
"""
import argparse
import datetime
import json
import os
import ssl
import time
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import (HTTPRedirectHandler, HTTPSHandler, ProxyHandler,
                            Request, build_opener)

from gems_dem_metadata_recon import GROUPS
from gems_usgs_3dep_index import (SERVICE, RESULTS_SCHEMA,
                                  build_queries, ingest)

MAX_RESPONSE_BYTES = 1024 * 1024
DEFAULT_TIMEOUT_SECONDS = 12
MIN_REQUEST_SPACING_SECONDS = 0.5
MAX_PER_GROUP = 15


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('usgs_unexpected_redirect')


def assert_official_url(url):
    parsed = urlsplit(url)
    expected = urlsplit(SERVICE)
    if (parsed.scheme != 'https' or parsed.netloc != expected.netloc or
        parsed.path != expected.path or parsed.username or parsed.password or
        parsed.fragment or not parsed.query):
        raise ValueError('usgs_endpoint_not_allowlisted')
    return url


def fetch_public_json(url, *, timeout=DEFAULT_TIMEOUT_SECONDS,
                      max_bytes=MAX_RESPONSE_BYTES):
    assert_official_url(url)
    if (not isinstance(timeout, (int, float)) or isinstance(timeout, bool)
        or not 0 < timeout <= 30 or
        not isinstance(max_bytes, int) or isinstance(max_bytes, bool)
        or not 0 < max_bytes <= MAX_RESPONSE_BYTES):
        raise ValueError('usgs_request_budget_invalid')
    opener = build_opener(ProxyHandler({}),
                          HTTPSHandler(context=ssl.create_default_context()),
                          NoRedirects())
    request = Request(url, headers={
        'Accept': 'application/json',
        'User-Agent': 'Evercraft-GEMS-research-public-metadata/1.0'})
    with opener.open(request, timeout=timeout) as response:
        if response.getcode() != 200:
            raise ValueError('usgs_unexpected_status')
        data = response.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError('usgs_response_too_large')
    try:
        result = json.loads(data.decode('utf-8'))
    except (ValueError, UnicodeError) as exc:
        raise ValueError('usgs_response_not_json') from exc
    if not isinstance(result, dict):
        raise ValueError('usgs_response_object_required')
    return result


def choose_balanced_queries(atlas, max_per_group):
    if (isinstance(max_per_group, bool) or not isinstance(max_per_group, int)
        or max_per_group < 1 or max_per_group > MAX_PER_GROUP):
        raise ValueError('usgs_per_group_budget_invalid')
    queries = build_queries(atlas)
    chosen = []
    for group in GROUPS:
        subset = [q for q in queries if q['diagnostic_group'] == group]
        if len(subset) < max_per_group:
            raise ValueError('usgs_balanced_group_too_small')
        chosen.extend(subset[:max_per_group])
    if len(chosen) != 3 * max_per_group:
        raise AssertionError('usgs_query_budget_mismatch')
    for query in chosen:
        assert_official_url(query['query_url'])
    return chosen


def capture(atlas, *, max_per_group=1, allow_public_query=False,
            transport=fetch_public_json, pause=time.sleep, now=None):
    if allow_public_query is not True:
        raise PermissionError('explicit_public_usgs_query_gate_required')
    chosen = choose_balanced_queries(atlas, max_per_group)
    responses = []
    for i, item in enumerate(chosen):
        if i:
            pause(MIN_REQUEST_SPACING_SECONDS)
        raw = transport(item['query_url'])
        # Inspect each response immediately; never silently treat upstream
        # errors, pagination or malformed features as negative coverage.
        candidate = {'schema': RESULTS_SCHEMA, 'responses': [{
            'tile_id': item['tile_id'], 'query_sha256': item['query_sha256'],
            'response': raw}]}
        ingest([item], candidate)
        timestamp = (now() if now is not None else
                     datetime.datetime.now(datetime.timezone.utc))
        if timestamp.tzinfo is None or timestamp.utcoffset() is None:
            raise ValueError('usgs_capture_timestamp_naive')
        responses.append({'tile_id': item['tile_id'],
                          'query_sha256': item['query_sha256'],
                          'retrieved_at_utc': timestamp.isoformat(),
                          'response': raw})
    bundle = {'schema': RESULTS_SCHEMA,
              'source': SERVICE,
              'retrieval_scope': 'public USGS 1m project metadata only',
              'index_matches_are_not_dem_pixel_coverage': True,
              'third_party_source_rights_verified': False,
              'competition_use_or_sponsor_share_rights_verified': False,
              'fault_truth_observed': False,
              'raster_files_downloaded': 0, 'competition_submissions': 0,
              'balanced_queries_per_group': max_per_group,
              'responses': responses}
    # End-to-end validation before any receipt is written.
    ingest(chosen, bundle)
    return bundle


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--atlas', type=Path, required=True)
    p.add_argument('--receipt', type=Path, required=True)
    p.add_argument('--max-per-group', type=int, default=1, choices=range(1, 16))
    p.add_argument('--allow-public-usgs-query', action='store_true')
    args = p.parse_args()
    if args.receipt.exists():
        raise FileExistsError('usgs_capture_receipt_exists')
    if not args.allow_public_usgs_query:
        raise PermissionError('explicit_public_usgs_query_gate_required')
    atlas = json.loads(args.atlas.read_text())
    result = capture(atlas, max_per_group=args.max_per_group,
                     allow_public_query=True)
    args.receipt.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    fd = os.open(args.receipt, flags, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as output:
        json.dump(result, output, indent=2, allow_nan=False)
        output.write('\\n')
    print(json.dumps({'receipt': str(args.receipt),
                      'public_index_queries': len(result['responses']),
                      'per_group': args.max_per_group,
                      'raster_files_downloaded': 0,
                      'competition_submissions': 0,
                      'dem_coverage_verified': False}))


if __name__ == '__main__':
    main()
