#!/usr/bin/env python3
"""Private-by-default, read-only Revenue Desk action review queue.

Reads Evercraft's loopback Revenue Desk and emits *only* ordinal positions,
boolean presence flags, predefined review codes and aggregate counts.
No sends, imports, CRM writes, recipient data, claims of payment or verification.
The 1-based ordinal is valid only for the current source ordering.
"""
import argparse
from collections import Counter
import datetime as dt
import json
import os
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

from revenue_desk_bridge import REVENUE_URL, MAX_DOWNLOAD, entries, get_json, local_url, one

KNOWN_META = {
    'provider_reference': {'provider_message_id', 'message_id', 'smtp_message_id', 'gmail_message_id', 'thread_id', 'id'},
    'timestamp': {'sent_at', 'created_at', 'at', 'timestamp', 'date'},
    'recipient': {'to', 'recipient', 'recipient_email', 'email', 'contact'},
    'channel': {'channel', 'medium', 'provider', 'transport'},
    'body': {'body', 'message', 'text', 'content'},
    'subject': {'subject'},
    'status': {'status', 'delivery_status', 'state'},
}


def local_today():
    return dt.datetime.now(ZoneInfo('America/Los_Angeles')).date()


def due_date(value, today):
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        return dt.date.fromisoformat(value.strip()[:10]) <= today
    except ValueError:
        return False


def inspect_sent(value):
    """Return only structural indicators; never expose nested values or arbitrary keys."""
    report = {'events': 0, 'dict_entries': 0, 'string_entries': 0, 'other_entries': 0}
    for key in KNOWN_META:
        report['has_' + key] = False
    for event in value if isinstance(value, list) else []:
        if event in (None, '', {}, []):
            continue
        report['events'] += 1
        if isinstance(event, dict):
            report['dict_entries'] += 1
            for label, aliases in KNOWN_META.items():
                if aliases & set(event):
                    report['has_' + label] = True
        elif isinstance(event, str):
            report['string_entries'] += 1
        else:
            report['other_entries'] += 1
    return report


def classify(row, today):
    if not isinstance(row, dict):
        return {'tier': 'schema_review', 'flags': ['malformed_record'], 'sent': inspect_sent(None)}
    buyer = bool(one(row, ('buyer', 'buyer_name', 'contact_name', 'decision_maker', 'contact_person')))
    contact = bool(one(row, ('contact', 'contact_email', 'email')))
    evidence_text = bool(one(row, ('signal', 'sourceText', 'source_text', 'signal_text', 'original_message', 'buyer_message')))
    ref = bool(one(row, ('source', 'source_url', 'source_ref', 'thread_id', 'email_thread_id')))
    followup = one(row, ('followup', 'next_follow_up', 'next_followup', 'follow_up_at'))
    due = due_date(followup, today)
    sent = inspect_sent(row.get('sent'))
    replied = bool(one(row, ('reply', 'buyer_reply', 'response_text')))
    closed = str(one(row, ('status', 'stage', 'state'))).strip().lower() in {'won', 'lost', 'closed', 'disqualified', 'declined'}
    flags = []
    if sent['events'] or one(row, ('status', 'stage', 'state')).lower() in {'sent', 'contacted', 'replied', 'outreach_sent'}:
        flags.append('reconcile_source_reported_outreach_with_provider')
    if not evidence_text:
        flags.append('obtain_original_problem_statement_or_source_excerpt')
    if not buyer:
        flags.append('resolve_named_buyer')
    if not contact:
        flags.append('resolve_contact_channel')
    if not ref:
        flags.append('resolve_original_source_reference')
    flags.append('verify_permission_and_suppression_before_outreach')
    if replied:
        flags.append('inspect_original_reply_before_followup')
    if closed:
        tier = 'closed_record_review'
    elif replied:
        tier = 'reply_reconciliation_first'
    elif due and buyer:
        tier = 'due_named_buyer_review'
    elif due:
        tier = 'due_buyer_identification_review'
    elif buyer:
        tier = 'named_buyer_evidence_review'
    else:
        tier = 'source_evidence_review'
    return {'tier': tier, 'flags': flags, 'sent': sent,
            'buyer_named': buyer, 'contact_present': contact, 'source_text_present': evidence_text,
            'source_ref_present': ref, 'reply_reported': replied,
            'followup_due_from_source_unconfirmed': due}


def build_queue(data, today=None):
    today = today or local_today()
    result = []
    for i, source in enumerate(entries(data), 1):
        result.append({'row_ordinal_1_based': i, **classify(source, today)})
    order = {'reply_reconciliation_first': 0, 'due_named_buyer_review': 1, 'due_buyer_identification_review': 2,
             'named_buyer_evidence_review': 3, 'source_evidence_review': 4, 'closed_record_review': 5, 'schema_review': 6}
    result.sort(key=lambda x: (order.get(x['tier'], 8), x['row_ordinal_1_based']))
    tiers = dict(sorted(Counter(x['tier'] for x in result).items()))
    sent = Counter()
    for x in result:
        for key, value in x['sent'].items():
            if key.startswith('has_'):
                if value:
                    sent[key + '_rows'] += 1
            else:
                sent[key] += value
    return {
        'schema': 'evercraft.demand-command.action-queue.v1',
        'mode': 'read_only_no_outreach',
        'as_of_local_date': today.isoformat(),
        'timezone': 'America/Los_Angeles',
        'source_rows': len(result),
        'tier_counts': tiers,
        'sent_structure_counts': dict(sorted(sent.items())),
        'outreach_approved': 0,
        'delivery_verified': 0,
        'payment_verified': 0,
        'note': 'Row ordinals apply only to this snapshot ordering, and all due/send/source states are unverified until matched against correspondence.',
        'review_queue': result,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description='Read-only private-safe action queue for Evercraft Revenue Desk.')
    parser.add_argument('--input-json', type=Path, help='Private local JSON export; never commit buyer data')
    parser.add_argument('--revenue-url', default=REVENUE_URL, help='Only HTTP loopback:8795')
    parser.add_argument('--as-of', type=dt.date.fromisoformat, help='Optional local date, YYYY-MM-DD')
    parser.add_argument('--receipt', type=Path, help='Owner-only report; still avoid publishing it')
    args = parser.parse_args(argv)
    if args.input_json:
        if args.input_json.stat().st_size > MAX_DOWNLOAD:
            raise ValueError('Source exceeds size limit')
        source = json.loads(args.input_json.read_text(encoding='utf-8'))
    else:
        local_url(args.revenue_url, allow_path={8795})
        source = get_json(args.revenue_url)
    output = json.dumps(build_queue(source, today=args.as_of), indent=2, sort_keys=True) + '\n'
    if args.receipt:
        args.receipt.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(args.receipt, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            os.fchmod(f.fileno(), 0o600)
            f.write(output)
    print(output, end='')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print('Action queue halted: ' + str(exc), file=sys.stderr)
        sys.exit(1)