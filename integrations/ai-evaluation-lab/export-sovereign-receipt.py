#!/usr/bin/env python3
"""Create a private, ten-field EO-001 receipt copy for independent offline review.

This tool never contacts a network, reruns inference, or changes the original receipt.
It copies only the allowlisted fields from Lab issue #35, validates them, and
refuses to overwrite an existing output. Successful export is not attestation.
"""

import argparse
import json
import math
import os
from pathlib import Path
import re
import sys

SCHEMA = 'evercraft.eo001.sovereign-inference-acceptance.v1'
MODEL_SHA = '7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5'
RUNTIME_SHA = 'a32b9bdc4d664e21558726fee570b712124c624ccb37fa2eea93bb34a5a93591'
FIELDS = (
    'schema', 'state', 'real_local_inference', 'model_sha256',
    'runtime_sha256', 'model_reply_sha256', 'inference_seconds',
    'child_processes_stopped', 'synthetic_only',
    'production_services_modified',
)


def _unique_object(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise ValueError('receipt contains duplicate JSON keys')
        obj[key] = value
    return obj


def sanitize(record):
    """Return only approved fields, rejecting missing or inconsistent evidence."""
    if not isinstance(record, dict):
        raise ValueError('receipt must be a JSON object')
    missing = [key for key in FIELDS if key not in record]
    if missing:
        raise ValueError('missing required receipt fields: ' + ', '.join(missing))
    clean = {key: record[key] for key in FIELDS}
    if clean['schema'] != SCHEMA:
        raise ValueError('unexpected receipt schema')
    if clean['state'] != 'FIRST_INFERENCE_PASS':
        raise ValueError('receipt is not a reported successful first inference')
    for key in ('real_local_inference', 'child_processes_stopped',
                'synthetic_only', 'production_services_modified'):
        if type(clean[key]) is not bool:
            raise ValueError(f'{key} must be a boolean')
    if not clean['real_local_inference'] or not clean['child_processes_stopped']:
        raise ValueError('receipt does not report successful inference and cleanup')
    if not clean['synthetic_only'] or clean['production_services_modified']:
        raise ValueError('receipt is not isolated from production')
    for key in ('model_sha256', 'runtime_sha256', 'model_reply_sha256'):
        if not isinstance(clean[key], str) or not re.fullmatch(r'[0-9a-f]{64}', clean[key]):
            raise ValueError(f'{key} must be a lowercase SHA-256 hex digest')
    if clean['model_sha256'] != MODEL_SHA or clean['runtime_sha256'] != RUNTIME_SHA:
        raise ValueError('receipt does not match pinned model/runtime digests')
    duration = clean['inference_seconds']
    if type(duration) not in (float, int) or not math.isfinite(duration) or duration <= 0:
        raise ValueError('inference_seconds must be a positive finite number')
    return clean


def export_receipt(source, destination):
    if source.resolve() == destination.resolve():
        raise ValueError('output must differ from original receipt')
    if not source.is_file():
        raise ValueError('input receipt does not exist')
    # Even when original JSON includes sensitive fields, only these ten values
    # enter the output. Duplicate keys are rejected instead of being overwritten.
    with source.open('r', encoding='utf-8') as handle:
        record = json.load(handle, object_pairs_hook=_unique_object,
                           parse_constant=lambda value: (_ for _ in ()).throw(ValueError('nonfinite JSON number')))
    clean = sanitize(record)
    encoded = (json.dumps(clean, indent=2, ensure_ascii=True, allow_nan=False) + '\n').encode('utf-8')
    # Atomic no-overwrite creation and 0600 mode. Do not print data or paths.
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, 'wb') as handle:
            handle.write(encoded)
    except BaseException:
        destination.unlink(missing_ok=True)
        raise
    return clean


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path,
                        help='path to original local inference-receipt.json')
    parser.add_argument('--output', required=True, type=Path,
                        help='path for a new, private ten-field JSON copy')
    args = parser.parse_args(argv)
    try:
        export_receipt(args.input, args.output)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        # Avoid echoing paths or confidential receipt values in CLI messages.
        print('EO001_RECEIPT_EXPORT: BLOCKED (' + type(exc).__name__ + ')', file=sys.stderr)
        return 2
    print('EO001_RECEIPT_EXPORT: PASS (10 allowlisted fields; private file created)')
    print('REVIEW_REQUIRED: provenance remains UNVERIFIED_EXTERNAL; do not post without inspection')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
