#!/usr/bin/env python3
"""Read-only Revenue Desk -> Demand Command bridge.

Default is a dry run. Reads only from loopback (or an offline JSON export).
Never sends outreach, fabricates verification, or changes Revenue Desk.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

REVENUE_URL = 'http://127.0.0.1:8795/api/opportunities'
DEMAND_URL = 'http://127.0.0.1:8796'
MAX_DOWNLOAD = 8 * 1024 * 1024
STOP_STATUSES = {'sent', 'contacted', 'outreach_sent', 'followed_up', 'replied', 'responded', 'negotiating', 'objection'}


def local_url(url, *, allow_path):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'http' or parsed.hostname not in {'127.0.0.1', 'localhost'} or parsed.username or parsed.password or parsed.fragment:
        raise ValueError('Only plain HTTP loopback URLs are permitted; do not contact external services')
    if not parsed.port or parsed.port not in allow_path:
        raise ValueError('Unexpected local service port')
    if parsed.query:
        raise ValueError('Queries are not supported')
    return url.rstrip('/')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # An owned loopback endpoint may not pivot an internal preview to an external URL.
        return None


DIRECT_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def get_json(url, token=None):
    headers = {'Accept': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, headers=headers, method='GET')
    with DIRECT_OPENER.open(req, timeout=8) as resp:
        if resp.status != 200:
            raise ValueError('Local source returned HTTP ' + str(resp.status))
        raw = resp.read(MAX_DOWNLOAD + 1)
        if len(raw) > MAX_DOWNLOAD:
            raise ValueError('Local payload is too large')
        return json.loads(raw)


def post_json(url, obj, token):
    data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST', headers={
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    })
    try:
        with DIRECT_OPENER.open(req, timeout=8) as r:
            return r.status, json.loads(r.read(MAX_DOWNLOAD))
    except urllib.error.HTTPError as e:
        raw = e.read(8192)
        try:
            payload = json.loads(raw)
        except (ValueError, UnicodeError):
            payload = {'error': 'Unrecognized local HTTP error'}
        return e.code, payload


def entries(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ('opportunities', 'records', 'items', 'results', 'leads'):
            if isinstance(data.get(key), list):
                return data[key]
        if isinstance(data.get('data'), (list, dict)):
            return entries(data['data'])
    raise ValueError('Unknown Revenue Desk export schema; expected a list or opportunities/records/items/results/leads array')


def one(obj, keys):
    for key in keys:
        val = obj.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
        if isinstance(val, (int, float)) and key.endswith('_id'):
            return str(val)
    return ''


def concise(text, cap=16000):
    return str(text or '').strip()[:cap]


def source_id(obj):
    for k in ('id', 'opportunity_id', 'lead_id', 'record_id', 'uuid'):
        v = obj.get(k)
        if isinstance(v, (str, int)) and str(v).strip():
            return str(v).strip()
    return ''


def historical_sent_count(record):
    """Count prior entries, without mistaking them for provider delivery receipts."""
    value = record.get('sent')
    if not isinstance(value, list):
        return 0
    return sum(item not in (None, '', {}, []) for item in value)


def original_context(record):
    """Preserve source claims as labeled notes, never as verified evidence."""
    labels = (
        ('external_id', 'Revenue Desk external reference'),
        ('role', 'Reported buyer role'),
        ('contact', 'Reported contact detail (not outreach permission)'),
        ('subject', 'Reported outreach subject'),
        ('assumption', 'Source assumption'),
        ('relevance', 'Source relevance rationale'),
        ('permission', 'Source-reported contact permission (unverified)'),
        ('verified', 'Source-reported verification (unverified)'),
        ('next_action', 'Original next action'),
        ('objection', 'Reported objection'),
        ('amount', 'Proposed amount (not received revenue)'),
        ('accepted', 'Source-reported acceptance (unverified)'),
        ('checkout', 'Source-reported checkout (not payment proof)'),
        ('paid_amount', 'Source-reported paid amount (not payment proof)'),
        ('paid_reference', 'Source-reported payment reference (unverified)'),
    )
    out = []
    for key, label in labels:
        value = one(record, (key,))
        if value:
            out.append(label + ': ' + concise(value, 1000))
    count = historical_sent_count(record)
    if count:
        out.append(f'Revenue Desk sent history: {count} reported entries; provider delivery unverified; reconcile before any follow-up.')
    return out


def normalize(record):
    if not isinstance(record, dict):
        return None, 'not_an_object'
    rid = source_id(record)
    if not rid or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,160}', rid):
        return None, 'missing_safe_stable_id'
    business = one(record, ('business', 'business_name', 'company', 'company_name', 'client', 'client_name', 'organization'))
    pain = one(record, ('pain', 'pain_point', 'problem', 'problem_statement', 'known_problem', 'buyer_need', 'stated_need', 'need'))
    if not business:
        return None, 'missing_business_identity'
    if not pain:
        return None, 'missing_explicit_problem'
    source = f'revenue-desk:opportunity:{rid}'
    note = [f'Revenue Desk source record: {rid}', 'Imported without independent verification.']
    original_source = one(record, ('source_url', 'source_ref', 'source_message_id', 'thread_id', 'email_thread_id', 'source'))
    if original_source:
        note.append('Original source reference: ' + concise(original_source, 900))
    raw_status = one(record, ('status', 'stage', 'state')).casefold().replace(' ', '_').replace('-', '_')
    if raw_status:
        note.append('Original Revenue Desk stage: ' + concise(raw_status, 100))
    data = {
        'business': concise(business, 1000),
        'pain': concise(pain),
        'evidence': 'signal',  # Never promote source-reported status to verified.
        'source': source,
        'notes': '\n'.join(note),
        'category': 'unqualified',
        'status': 'researching',
    }
    for dest, aliases in (
        ('buyer', ('buyer', 'buyer_name', 'contact_name', 'decision_maker', 'contact_person')),
        ('website', ('website', 'company_website', 'domain_url', 'business_url')),
        ('channel', ('channel', 'contact_channel')),
        ('product', ('product', 'product_name', 'matched_product', 'service', 'service_name')),
        ('offer', ('offer', 'tailored_offer', 'offer_text', 'proposed_scope')),
        ('draft', ('draft', 'outreach_draft', 'message_draft')),
        ('reply', ('reply', 'buyer_reply', 'response_text')),
        ('sourceText', ('sourceText', 'source_text', 'signal_text', 'signal', 'original_message', 'buyer_message')),
        ('followup', ('followup', 'next_follow_up', 'next_followup', 'follow_up_at')),
        ('outcome', ('outcome', 'disposition', 'lost_reason')),
        ('sent', ('sent_at', 'last_sent_at')),
    ):
        val = one(record, aliases)
        if val:
            data[dest] = concise(val)
    # Only explicitly designated categories, no classification by guesswork.
    raw_category = one(record, ('category', 'opportunity_type', 'queue', 'kind')).casefold().replace(' ', '_').replace('-', '_')
    categories = {'qualified': 'qualified', 'unqualified': 'unqualified', 'paid': 'paid', 'direct_paid_work': 'paid', 'direct_work': 'paid', 'paid_work': 'paid', 'job': 'paid', 'product': 'product', 'product_offer': 'product', 'qualified_lead': 'qualified'}
    data['category'] = categories.get(raw_category, 'unqualified')
    statuses = {'qualified': 'qualified', 'drafted': 'drafted', 'sent': 'contacted', 'outreach_sent': 'contacted', 'contacted': 'contacted', 'replied': 'replied', 'responded': 'replied', 'objection': 'objection', 'negotiating': 'negotiating', 'won': 'won', 'lost': 'lost', 'declined': 'lost', 'disqualified': 'disqualified'}
    data['status'] = statuses.get(raw_status, 'researching')
    val = record.get('estimated_value', record.get('value'))
    if isinstance(val, (float, int)) and not isinstance(val, bool) and 0 <= val <= 1e12:
        data['value'] = val  # Potential deal value only, not booked revenue.
    data['notes'] = concise('\n'.join(note + original_context(record)))
    contact_reported = bool(raw_status in STOP_STATUSES or historical_sent_count(record) or one(record, ('sent_at', 'last_sent_at', 'outreach_message_id', 'provider_message_id')))
    return {'record': data, 'origin': source, 'source_stage': raw_status, 'contact_reported': contact_reported}, None



def inspect_schema(data):
    """Only field names, types, and counts. Never serialize source values or buyers."""
    report = {'schema': 'evercraft.demand-command.revenue-desk-inspection.v1',
              'top_level_type': type(data).__name__, 'top_level_keys': sorted(str(k) for k in data) if isinstance(data, dict) else [],
              'record_count': None, 'field_types': {}, 'compatible': False}
    try:
        records = entries(data)
    except ValueError:
        return report
    report['record_count'] = len(records)
    report['compatible'] = True  # Structural compatibility only, not readiness to import or send.
    normalized, rejected = collect(data)
    report['eligible_count'] = len(normalized)
    report['needs_review_count'] = len(rejected)
    report['historical_sent_list_rows'] = sum(bool(historical_sent_count(r)) for r in records if isinstance(r, dict))
    report['contact_history_flagged_count'] = sum(bool(x['contact_reported']) for x in normalized)
    fields = {}
    for row in records:
        if isinstance(row, dict):
            for key, value in row.items():
                # No values, text snippets, addresses, emails, or IDs in this output.
                types = fields.setdefault(str(key), {})
                typ = type(value).__name__
                types[typ] = types.get(typ, 0) + 1
    report['field_types'] = dict(sorted(fields.items()))
    return report


def collect(data):
    rows = entries(data)
    staged, rejected = [], []
    seen = set()
    for index, raw in enumerate(rows):
        item, reason = normalize(raw)
        if reason:
            rejected.append({'row': index, 'reason': reason})
        elif item['origin'] in seen:
            rejected.append({'row': index, 'reason': 'duplicate_source_record_in_export'})
        else:
            staged.append(item)
            seen.add(item['origin'])
    return staged, rejected


def bridge(source, demand_base=DEMAND_URL, *, apply=False, token=''):
    staged, rejected = collect(source)
    report = {
        'schema': 'evercraft.demand-command.revenue-desk-bridge.v1',
        'mode': 'apply' if apply else 'dry_run',
        'observed_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
        'source_rows': len(entries(source)),
        'eligible': len(staged),
        'needs_review': len(rejected),
        'contact_history_flags': sum(bool(x['contact_reported']) for x in staged),
        'created': 0, 'already_imported': 0, 'conflicts': 0,
        'rejected': rejected,
        'applied': [],
        'transport_messages_sent': 0,
        'provider_deliveries_verified': 0,
    }
    if not apply:
        return report
    if len(token) < 32:
        raise ValueError('Apply requires a private EVERCRAFT_DEMAND_TOKEN of at least 32 characters')
    local_url(demand_base, allow_path={8796})
    existing = get_json(demand_base.rstrip('/')+'/api/opportunities', token)
    origins = {r.get('source'): r.get('id') for r in existing.get('records', [])}
    for item in staged:
        origin = item['origin']
        if origin in origins:
            report['already_imported'] += 1
            continue
        code, result = post_json(demand_base.rstrip('/')+'/api/opportunities', item['record'], token)
        if code == 409:
            report['conflicts'] += 1  # Do not overwrite matching business/pain.
            continue
        if code != 201:
            report['rejected'].append({'source_id': origin, 'reason': f'demand_api_http_{code}', 'detail': result.get('error', 'No detail')})
            report['needs_review'] += 1
            continue
        oid = result['id']
        report['created'] += 1
        report['applied'].append({'origin': origin, 'id': oid})
        origins[origin] = oid
        if item['contact_reported']:
            note = 'Revenue Desk historically records contact/reply/closed stage: ' + (item['source_stage'] or '(unspecified)') + '. Provider delivery not verified. Reconcile correspondence before any follow-up.'
            code, event = post_json(demand_base.rstrip('/')+f'/api/opportunities/{oid}/interactions', {'kind': 'outreach_reported', 'note': note, 'source': origin}, token)
            if code != 201:
                report['rejected'].append({'source_id': origin, 'reason': f'historical_contact_log_http_{code}', 'detail': event.get('error', 'No detail')})
                report['needs_review'] += 1
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description='Read-only Revenue Desk ingestion; dry-run by default.')
    parser.add_argument('--input-json', type=Path, help='Use offline export instead of reading a live API')
    parser.add_argument('--revenue-url', default=REVENUE_URL, help='Only loopback port 8795 is accepted')
    parser.add_argument('--demand-url', default=DEMAND_URL, help='Only loopback port 8796 is accepted')
    parser.add_argument('--apply', action='store_true', help='Explicitly create records in local Demand API; no outreach')
    parser.add_argument('--inspect-schema', action='store_true', help='Only show field names/types and counts, never contact details')
    parser.add_argument('--receipt', type=Path, help='Optional local summary receipt path (contains no messages)')
    args = parser.parse_args(argv)
    if args.input_json:
        if args.input_json.stat().st_size > MAX_DOWNLOAD:
            raise ValueError('Source file is too large')
        source = json.loads(args.input_json.read_text(encoding='utf-8'))
    else:
        local_url(args.revenue_url, allow_path={8795})
        source = get_json(args.revenue_url)
    if args.inspect_schema:
        if args.apply:
            raise ValueError('--inspect-schema and --apply are mutually exclusive')
        print(json.dumps(inspect_schema(source), indent=2))
        return 0
    report = bridge(source, args.demand_url, apply=args.apply, token=os.environ.get('EVERCRAFT_DEMAND_TOKEN', ''))
    text = json.dumps(report, indent=2, ensure_ascii=False)
    if args.receipt:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(args.receipt, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, 'w', encoding='utf-8') as receipt_stream:
                receipt_stream.write(text + '\n')
        except BaseException:
            try:
                os.close(fd)
            except OSError:
                pass
            raise
    print(text)
    return 0 if not report['rejected'] or not args.apply else 2


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, urllib.error.URLError, json.JSONDecodeError) as e:
        print('Bridge halted: ' + str(e), file=sys.stderr)
        sys.exit(1)