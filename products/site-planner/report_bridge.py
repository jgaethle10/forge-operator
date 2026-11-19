"""Read-only adapter for Evercraft's owned Forge/Yard report gateway.

Only explicitly configured loopback gateways can be queried. This module
verifies report provenance *as attested by that gateway*, not engineering facts,
property rights, external source validity, or payment settlement.
"""
import json
import os
import re
import stat
from pathlib import Path
from urllib.parse import urlsplit, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

REPORT_ID = re.compile(r'^rivet-yard:[a-f0-9]{32}$')
HEX_SHA256 = re.compile(r'^[a-f0-9]{64}$')
REQUIRED_CHECKS = (
    'source_sha256_match',
    'source_byte_count_match',
    'full_source_snapshot_persisted',
    'full_source_snapshot_reopened_and_verified',
    'source_coverage_manifest_verified',
    'report_domain_projection_verified',
)


def gateway_config():
    raw = os.environ.get('EVERCRAFT_SITE_REPORT_GATEWAY_URL', '').strip()
    secret_file = os.environ.get('EVERCRAFT_SITE_REPORT_GATEWAY_TOKEN_FILE', '').strip()
    if not raw or not secret_file:
        raise ValueError('Owned report gateway and private token file must be configured')
    u = urlsplit(raw)
    if (u.scheme not in ('http', 'https') or
        u.hostname not in ('127.0.0.1', 'localhost', '::1') or
        u.username or u.password or u.path not in ('', '/') or
        u.query or u.fragment):
        raise ValueError('Report gateway must be an explicit Evercraft-owned loopback origin')
    p = Path(secret_file).resolve()
    mode = p.stat().st_mode
    if not stat.S_ISREG(mode) or mode & 0o077:
        raise ValueError('Report gateway token file must be private (0600)')
    token = p.read_text(encoding='utf-8').strip()
    if len(token.encode('utf-8')) < 16:
        raise ValueError('Report gateway token is too short')
    # IPv6 URI carries square brackets in netloc; preserve the configured origin.
    return f'{u.scheme}://{u.netloc}', token


def canonical_address(value):
    return ' '.join(str(value or '').strip().casefold().split())


def validate_record(record, external_report_id, site_address):
    if not isinstance(record, dict) or record.get('ok') is not True:
        raise ValueError('Gateway did not confirm a ready report')
    if record.get('schema') != 'evercraft.rivet.yard-report-record.v1':
        raise ValueError('Unrecognized report record schema')
    if record.get('generation_state') != 'ready' or record.get('report_id') != external_report_id:
        raise ValueError('Report is not ready or report ID mismatched')
    body = record.get('report', {}).get('body')
    if not isinstance(body, dict) or body.get('schema') != 'evercraft.rivet.yard-report.v1' or body.get('generation_state') != 'ready':
        raise ValueError('Report body is missing or not ready')
    if body.get('report_type') not in ('preliminary_site_opportunity', 'full_site_opportunity'):
        raise ValueError('Unsupported report type')
    source = record.get('source_snapshot') or {}
    report = record.get('report') or {}
    if not HEX_SHA256.fullmatch(str(source.get('sha256', ''))) or not HEX_SHA256.fullmatch(str(report.get('sha256', ''))):
        raise ValueError('Report and source must have SHA-256 identifiers')
    if (source.get('persisted') is not True or source.get('coverage_schema') != 'evercraft.rivet.source-coverage.v1'
        or report.get('source_snapshot_sha256') != source['sha256']):
        raise ValueError('Source coverage is not preserved')
    verification = record.get('verification') or {}
    if any(verification.get(check) is not True for check in REQUIRED_CHECKS):
        raise ValueError('Gateway evidence receipt is incomplete')
    if canonical_address(body.get('requested_address')) != canonical_address(site_address):
        raise ValueError('Report requested address does not match the Site Planner address')
    return {
        'external_report_id': external_report_id,
        'report_sha256': report['sha256'],
        'source_sha256': source['sha256'],
        'report_type': body['report_type'],
        'requested_address': body['requested_address'],
        'gateway_schema': record['schema'],
        'source_coverage_schema': source['coverage_schema'],
        'report_created_at': str(record.get('created_at') or ''),
        'verification_basis': 'private_gateway_attestation_not_field_verification',
    }


def fetch_owned_ready_report(external_report_id, site_address, opener=urlopen):
    if not REPORT_ID.fullmatch(str(external_report_id)):
        raise ValueError('Invalid upstream report identifier')
    origin, token = gateway_config()
    path = '/api/rivet/reports/' + quote(external_report_id, safe='')
    req = Request(origin + path, headers={
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
    })
    try:
        with opener(req, timeout=8) as response:
            if response.status != 200:
                raise ValueError('Report gateway did not return HTTP 200')
            raw = response.read(2*1024*1024 + 1)
            if len(raw) > 2*1024*1024:
                raise ValueError('Upstream report exceeds safe intake size')
        record = json.loads(raw)
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise ValueError('Private report gateway unavailable or returned invalid data') from exc
    return validate_record(record, external_report_id, site_address)
