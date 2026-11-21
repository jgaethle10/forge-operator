#!/usr/bin/env python3
"""Read-only, aggregate reconciliation of private Revenue Desk opportunities.

No buyer names, contacts, messages, or source record IDs in stdout or receipts.
All reported sent/payment states remain unverified until independently checked.
"""
import argparse
from collections import Counter
import datetime as dt
import json
import os
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

from revenue_desk_bridge import (
    REVENUE_URL, MAX_DOWNLOAD, collect, entries, get_json,
    historical_sent_count, local_url, one,
)

STAGES = {
    'new', 'researching', 'qualified', 'drafted', 'sent', 'outreach_sent',
    'contacted', 'followed_up', 'replied', 'responded', 'objection',
    'negotiating', 'won', 'lost', 'declined', 'disqualified', 'interested',
    'pending', 'blocked', 'closed', 'needs_review',
}
FOLLOWUP_STATES = {'won', 'lost', 'declined', 'disqualified', 'closed'}


def safe_status(raw):
    value = str(raw or '').strip().casefold().replace(' ', '_').replace('-', '_')
    return value if value in STAGES else 'other_or_empty'


def is_due(value, today):
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        datepart = value.strip()[:10]
        parsed = dt.date.fromisoformat(datepart)
        return parsed <= today
    except ValueError:
        return False


def build_triage(source, today=None):
    """Only aggregate metrics. Never emit any source field values or record IDs."""
    if today is None:
        today = dt.datetime.now(ZoneInfo('America/Los_Angeles')).date()
    rows = entries(source)
    eligible, rejected = collect(source)
    stats = Counter()
    stages = Counter()
    sent_bins = Counter()
    known_businesses = set()
    duplicates = 0
    for row in rows:
        if not isinstance(row, dict):
            stats['malformed_rows'] += 1
            continue
        stage = safe_status(one(row, ('status', 'stage', 'state')))
        stages[stage] += 1
        count = historical_sent_count(row)
        sent_bins['0' if count == 0 else '1' if count == 1 else '2-3' if count <= 3 else '4+'] += 1
        stats['reported_sent_entries'] += count
        if count:
            stats['rows_with_reported_sent_entries'] += 1
        elif stage in {'sent', 'outreach_sent', 'contacted', 'followed_up', 'replied', 'responded', 'objection', 'negotiating'}:
            stats['contact_stage_without_sent_entries'] += 1
        business = one(row, ('business', 'business_name', 'company', 'company_name', 'client', 'client_name', 'organization')).casefold().strip()
        if business:
            if business in known_businesses:
                duplicates += 1
            known_businesses.add(business)
        if one(row, ('buyer', 'buyer_name', 'contact_name', 'decision_maker', 'contact_person')):
            stats['buyer_named'] += 1
        if one(row, ('contact', 'contact_email', 'email', 'contact_channel')):
            stats['contact_detail_present_not_permission'] += 1
        if one(row, ('signal', 'sourceText', 'source_text', 'signal_text', 'original_message')):
            stats['signal_text_present_unverified'] += 1
        if one(row, ('source', 'source_url', 'source_ref', 'thread_id', 'email_thread_id')):
            stats['source_ref_present_unverified'] += 1
        if one(row, ('reply', 'buyer_reply', 'response_text')):
            stats['reply_reported_unverified'] += 1
        if one(row, ('objection',)):
            stats['objection_reported_unverified'] += 1
        followup = one(row, ('followup', 'next_follow_up', 'next_followup', 'follow_up_at'))
        if followup:
            stats['followup_present'] += 1
            if is_due(followup, today) and stage not in FOLLOWUP_STATES:
                stats['followup_due_from_source_unconfirmed'] += 1
        if any(one(row, (k,)) for k in ('paid_amount', 'paid_reference', 'checkout', 'accepted')):
            stats['commercial_or_payment_claims_unverified'] += 1
        if one(row, ('permission',)):
            stats['permission_field_present_not_authorization'] += 1
    report = {
        'schema': 'evercraft.demand-command.revenue-desk-triage.v1',
        'mode': 'read_only_aggregate',
        'rows': len(rows),
        'structurally_eligible': len(eligible),
        'needs_schema_review': len(rejected),
        'prior_contact_flags': sum(bool(item['contact_reported']) for item in eligible),
        'stage_counts': dict(sorted(stages.items())),
        'sent_entries_per_record': {k: sent_bins[k] for k in ('0', '1', '2-3', '4+')},
        'reported_sent_entries': stats['reported_sent_entries'],
        'source_context_counts': {k: stats[k] for k in (
            'buyer_named', 'contact_detail_present_not_permission',
            'signal_text_present_unverified', 'source_ref_present_unverified',
            'reply_reported_unverified', 'objection_reported_unverified',
            'followup_present', 'followup_due_from_source_unconfirmed',
            'commercial_or_payment_claims_unverified',
            'permission_field_present_not_authorization',
            'rows_with_reported_sent_entries', 'contact_stage_without_sent_entries',
        )},
        'duplicate_business_name_rows_possible': duplicates,
        'transport_messages_sent': 0,
        'provider_deliveries_verified': 0,
        'verified_payments': 0,
        'next_gate': 'reconcile historical correspondence and source verification; no automatic outreach',
    }
    return report


def main(argv=None):
    p = argparse.ArgumentParser(description='Privacy-safe, aggregate Revenue Desk reconciliation (read-only).')
    p.add_argument('--input-json', type=Path, help='Optional private local JSON export')
    p.add_argument('--revenue-url', default=REVENUE_URL, help='Only plain HTTP loopback on port 8795')
    p.add_argument('--receipt', type=Path, help='Optional local report path, mode 0600')
    args = p.parse_args(argv)
    if args.input_json:
        if args.input_json.stat().st_size > MAX_DOWNLOAD:
            raise ValueError('Source file exceeds size limit')
        source = json.loads(args.input_json.read_text(encoding='utf-8'))
    else:
        local_url(args.revenue_url, allow_path={8795})
        source = get_json(args.revenue_url)
    report = build_triage(source)
    encoded = json.dumps(report, indent=2, sort_keys=True) + '\n'
    if args.receipt:
        args.receipt.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(args.receipt, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            os.fchmod(f.fileno(), 0o600)
            f.write(encoded)
    print(encoded, end='')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print('Triage halted: ' + str(exc), file=sys.stderr)
        sys.exit(1)
