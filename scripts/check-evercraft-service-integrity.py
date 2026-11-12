#!/usr/bin/env python3
"""Read-only, fail-visible systemd entrypoint inventory for Evercraft services.

No service control, filesystem mutation, network calls, or private state access.
"""
import json
import os
import re
import subprocess
from datetime import datetime, timezone

SERVICE_PREFIX = 'evercraft-'
JS_ENTRY = re.compile(r'(?<![\w./-])(/[^\s;{}]+\.(?:mjs|cjs|js))(?=\s|;|$)')


def run_systemctl(*args):
    return subprocess.run(['systemctl', *args], text=True, capture_output=True, check=False)


def entrypoint_from_execstart(value):
    """Return JS entrypoint only for an unambiguous direct node invocation."""
    if not re.search(r'argv\[\]=\s*/\S*\bnode\s', value):
        return None
    matches = JS_ENTRY.findall(value)
    return matches[0] if len(matches) == 1 else None


def inspect(name):
    result = run_systemctl('show', name, '-p', 'ActiveState', '-p', 'MainPID', '-p', 'ExecStart')
    if result.returncode:
        return {'service': name, 'assessment': 'query_failed', 'restart_ready': False}
    props = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    entry = entrypoint_from_execstart(props.get('ExecStart', ''))
    if entry is None:
        assessment = 'not_assessed'
    elif not os.path.isfile(entry):
        assessment = 'missing_entrypoint'
    elif not os.access(entry, os.R_OK):
        assessment = 'entrypoint_unreadable_to_checker'
    else:
        assessment = 'entrypoint_exists_only'
    return {
        'service': name,
        'active_state': props.get('ActiveState', 'unknown'),
        'main_pid': props.get('MainPID', 'unknown'),
        'entrypoint': entry,
        'assessment': assessment,
        # Existence is NOT sufficient to establish restart readiness.
        'restart_ready': False,
    }


def build_report():
    listing = run_systemctl('list-units', '--type=service', '--all', '--no-legend', '--plain')
    if listing.returncode:
        raise RuntimeError('systemd_service_listing_failed')
    names = sorted({line.split()[0] for line in listing.stdout.splitlines()
                    if line.split() and line.split()[0].startswith(SERVICE_PREFIX)
                    and line.split()[0].endswith('.service')})
    return {'schema': 'evercraft.service-integrity.v1',
            'observed_at': datetime.now(timezone.utc).isoformat(),
            'scope': 'read_only_entrypoint_inventory',
            'services': [inspect(name) for name in names]}


def main():
    try:
        report = build_report()
    except RuntimeError as exc:
        print(json.dumps({'schema': 'evercraft.service-integrity.v1', 'error': str(exc)}))
        return 2
    print(json.dumps(report, indent=2))
    return 1 if any(s['assessment'] in ('missing_entrypoint', 'query_failed')
                    for s in report['services']) else 0


if __name__ == '__main__':
    raise SystemExit(main())
