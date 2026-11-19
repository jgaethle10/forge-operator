#!/usr/bin/env python3
"""Read-only owned-node AIW heartbeat. One run, one atomic receipt.

Scheduling remains a separate Kaidance integration gate. Never treats a
healthy 2026 snapshot as an update, live safety check, or national coverage.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import tempfile
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import urlopen

EXPECTED_SHA = 'c29c079d04817f85657fa3e8f7c7ea0b83d6809f5ed2dfb09b592f1e430ed8f4'


def validate_origin(origin):
    p = urlsplit(origin)
    if p.scheme != 'http' or p.hostname not in ('127.0.0.1', 'localhost', '::1') or p.path or p.query or p.fragment or p.username or p.password:
        raise ValueError('Only an HTTP loopback origin is allowed for this owned-node heartbeat')
    return origin.rstrip('/')


def probe(origin, timeout=5):
    base = validate_origin(origin)
    evidence = {}
    for route in ('/healthz', '/api/v1/coverage'):
        with urlopen(base + route, timeout=timeout) as response:
            if response.status != 200 or 'application/json' not in response.headers.get('Content-Type', ''):
                raise ValueError(f'{route} failed HTTP/JSON validation')
            evidence[route] = json.loads(response.read(1_000_000))
    h = evidence['/healthz']
    c = evidence['/api/v1/coverage']
    if not (h.get('status') == 'ready' and h.get('dataset_rows') == 21590 and
            h.get('national_complete') is False and h.get('live_alerts_connected') is False):
        raise ValueError('Service health or limits mismatch')
    if not (c.get('schema') == 'evercraft.aiw.v015.derived.v1' and
            c.get('source_asset_sha256') == EXPECTED_SHA and
            c.get('raw_records') == 21590 and
            c.get('national_import_complete') is False and
            c.get('last_live_emergency_check') is None):
        raise ValueError('Evidence provenance or completeness mismatch')
    return {'dataset_rows': 21590, 'snapshot_year': c.get('vintage'),
            'source_asset_sha256': EXPECTED_SHA, 'national_complete': False,
            'live_emergency_check': False, 'latest_source_refresh_verified': False}


def write_receipt(path, receipt):
    dest = Path(path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.aiw-heartbeat-', dir=dest.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as out:
            json.dump(receipt, out, sort_keys=True, indent=2)
            out.write('\n')
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, dest)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def execute(origin, receipt_path):
    receipt = {'schema': 'evercraft.aiw.heartbeat.v1',
               'checked_at_utc': datetime.now(timezone.utc).isoformat(),
               'origin': origin, 'status': 'failed',
               'scope': 'owned_pnw_v015_service_not_national_site',
               'scheduler_registered': False, 'source_update_performed': False}
    try:
        receipt['evidence'] = probe(origin)
        receipt['status'] = 'passed'
    except (OSError, ValueError, KeyError, TypeError, URLError, HTTPError, json.JSONDecodeError) as exc:
        receipt['failure'] = f'{type(exc).__name__}: {str(exc)[:200]}'
    write_receipt(receipt_path, receipt)
    return receipt


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--origin', default='http://127.0.0.1:8786')
    p.add_argument('--receipt', required=True)
    args = p.parse_args()
    try:
        validate_origin(args.origin)
    except ValueError as exc:
        p.error(str(exc))
    result = execute(args.origin, args.receipt)
    print(json.dumps(result, sort_keys=True, indent=2))
    return 0 if result['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
