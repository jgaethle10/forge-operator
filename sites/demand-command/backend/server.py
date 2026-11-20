#!/usr/bin/env python3
"""Evercraft Demand Command: local-only, bearer-protected SQLite API.
No external libraries or network calls. NEVER expose directly to the internet.
"""
import datetime as dt
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import uuid

MAX_BODY = 128 * 1024
CLOSED = {'won', 'lost', 'disqualified'}
VALID_EVIDENCE = {'signal', 'assumption', 'verified'}
VALID_CATEGORY = {'qualified', 'unqualified', 'paid', 'product'}
VALID_STATUS = {'researching', 'qualified', 'drafted', 'contacted', 'replied', 'objection', 'negotiating', 'won', 'lost', 'disqualified'}
VALID_EVENT = {'research_note', 'outreach_reported', 'delivery_verified', 'buyer_replied', 'objection', 'followup', 'outcome', 'review'}
LOCKED = {'id', 'created', 'updated', 'activity', 'version', 'fingerprint', 'identity_key'}
FIELDS = {'business', 'buyer', 'channel', 'website', 'pain', 'evidence', 'source', 'sourceText', 'verification_receipt', 'verified_by', 'category', 'status', 'product', 'value', 'offer', 'draft', 'reply', 'followup', 'sent', 'notes', 'outcome'}


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def normal(s):
    return re.sub(r'\s+', ' ', str(s or '').casefold()).strip()


def identity(record):
    host = urlsplit(str(record.get('website', '')).strip()).hostname
    if host:
        host = host.lower().removeprefix('www.')
    return host or normal(record['business'])


def fingerprint(record):
    # Same business + same reported pain = same opportunity, irrespective of matching offer.
    raw = identity(record) + '\x00' + normal(record['pain'])
    return hashlib.sha256(raw.encode()).hexdigest()


def validate(record):
    if not isinstance(record, dict):
        raise ValueError('Record must be an object')
    if set(record).difference(FIELDS):
        raise ValueError('Unknown or protected fields: ' + ', '.join(sorted(set(record).difference(FIELDS))))
    if not str(record.get('business', '')).strip() or not str(record.get('pain', '')).strip():
        raise ValueError('Business and actual pain are required')
    if record.get('evidence', 'signal') not in VALID_EVIDENCE:
        raise ValueError('Invalid evidence class')
    if record.get('category', 'unqualified') not in VALID_CATEGORY:
        raise ValueError('Invalid category')
    if record.get('status', 'researching') not in VALID_STATUS:
        raise ValueError('Invalid status')
    if record.get('evidence') == 'verified' and not all(str(record.get(k, '')).strip() for k in ('source', 'sourceText', 'verification_receipt', 'verified_by')):
        raise ValueError('Verified requires source, observation, reviewer and verification receipt; mere presence is not proof of truth')
    if record.get('value') not in ('', None):
        try:
            val = float(record['value'])
        except (TypeError, ValueError):
            raise ValueError('Value must be nonnegative')
        if not (0 <= val <= 1e12):
            raise ValueError('Value must be nonnegative and finite')
    for key, val in record.items():
        if isinstance(val, (list, dict)) or len(str(val)) > 16000:
            raise ValueError('Invalid or oversized field: ' + key)
    return True


def db_connect(path):
    c = sqlite3.connect(path, timeout=10, isolation_level=None)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA busy_timeout=10000')
    c.execute('PRAGMA foreign_keys=ON')
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('CREATE TABLE IF NOT EXISTS opportunities (id TEXT PRIMARY KEY, identity_key TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL, updated TEXT NOT NULL)')
    c.execute('CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, opportunity_id TEXT NOT NULL REFERENCES opportunities(id), kind TEXT NOT NULL, note TEXT NOT NULL, source TEXT NOT NULL, created TEXT NOT NULL, payload_hash TEXT NOT NULL, prev_hash TEXT NOT NULL, chain_hash TEXT NOT NULL)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_opportunities_identity ON opportunities(identity_key)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_events_opportunity ON events(opportunity_id)')
    return c


def append_event(db, opportunity_id, kind, note, source, snapshot):
    prev = db.execute('SELECT chain_hash FROM events ORDER BY seq DESC LIMIT 1').fetchone()
    previous = prev['chain_hash'] if prev else 'GENESIS'
    created = now()
    payload_hash = hashlib.sha256(json.dumps(snapshot, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    entry = {'event_id': str(uuid.uuid4()), 'opportunity_id': opportunity_id, 'kind': kind, 'note': str(note), 'source': str(source), 'created': created, 'payload_hash': payload_hash, 'prev_hash': previous}
    chain = hashlib.sha256((previous + json.dumps(entry, sort_keys=True, separators=(',', ':'))).encode()).hexdigest()
    db.execute('INSERT INTO events(event_id,opportunity_id,kind,note,source,created,payload_hash,prev_hash,chain_hash) VALUES(?,?,?,?,?,?,?,?,?)',
               (entry['event_id'], opportunity_id, kind, entry['note'], entry['source'], created, payload_hash, previous, chain))


def serialize(row, db):
    r = json.loads(row['payload'])
    r.update(id=row['id'], created=row['created'], updated=row['updated'], version=row['version'])
    r['activity'] = [dict(type=x['kind'], note=x['note'], source=x['source'], at=x['created'], event_id=x['event_id'])
                     for x in db.execute('SELECT event_id,kind,note,source,created FROM events WHERE opportunity_id=? ORDER BY seq', (row['id'],))]
    return r


def duplicate_contact(db, record, exclude_id=None):
    key = identity(record)
    for r in db.execute('SELECT id,payload FROM opportunities WHERE identity_key=?', (key,)):
        if r['id'] == exclude_id:
            continue
        old = json.loads(r['payload'])
        had_delivery_activity = db.execute("SELECT 1 FROM events WHERE opportunity_id=? AND kind IN ('outreach_reported','delivery_verified') LIMIT 1", (r['id'],)).fetchone()
        if old.get('status') in {'contacted', 'replied', 'objection', 'negotiating', 'won'} or had_delivery_activity:
            return r['id']
    return None


def project_source_review(source):
    """Authenticated, ephemeral read-only view of real Revenue Desk records.

    Does not import, send, persist customer details, or assert provider delivery.
    """
    from revenue_desk_bridge import entries, one
    from revenue_desk_action_queue import classify, local_today
    rows = entries(source)
    if len(rows) > 500:
        raise ValueError('Source review limited to 500 records')
    today = local_today()
    out = []
    for i, r in enumerate(rows, 1):
        if not isinstance(r, dict):
            out.append({'ordinal': i, 'tier': 'schema_review', 'flags': ['malformed_record']})
            continue
        check = classify(r, today)
        sent = []
        for event in (r.get('sent') if isinstance(r.get('sent'), list) else [])[:20]:
            if not isinstance(event, dict):
                continue
            sent.append({
                'to': one(event, ('to','recipient','recipient_email','email','contact'))[:600],
                'subject': one(event, ('subject',))[:1200],
                'body': one(event, ('body','message','text','content'))[:8000],
                'channel': one(event, ('channel','medium','provider','transport'))[:200],
                'provider_ref_claim': one(event, ('provider_message_id','message_id','smtp_message_id','gmail_message_id','thread_id','id'))[:300],
                'reported_at': one(event, ('sent_at','created_at','at','timestamp','date'))[:100],
            })
        out.append({
            'ordinal': i, 'tier': check['tier'], 'flags': check['flags'],
            'business': one(r, ('business','business_name','company','company_name'))[:1000],
            'buyer': one(r, ('buyer','buyer_name','contact_name'))[:1000],
            'contact': one(r, ('contact','contact_email','email'))[:1000],
            'pain': one(r, ('pain','pain_point','problem'))[:8000],
            'source': one(r, ('source','source_url','source_ref'))[:3000],
            'signal': one(r, ('signal','sourceText','source_text','original_message'))[:8000],
            'product': one(r, ('product','service','matched_product'))[:1000],
            'offer': one(r, ('offer','tailored_offer','offer_text'))[:8000],
            'draft': one(r, ('draft','outreach_draft','message_draft'))[:8000],
            'stage': one(r, ('status','stage'))[:200],
            'followup': one(r, ('followup','next_follow_up','next_followup'))[:100],
            'reply': one(r, ('reply','buyer_reply'))[:8000],
            'sent_history': sent,
            'delivery_verified': False, 'outreach_approved': False,
        })
    order = {'reply_reconciliation_first':0,'due_named_buyer_review':1,
             'due_buyer_identification_review':2,'named_buyer_evidence_review':3,
             'source_evidence_review':4,'closed_record_review':5,'schema_review':6}
    out.sort(key=lambda r:(order.get(r['tier'],8),r['ordinal']))
    return {'mode':'local_read_only','count':len(out),'records':out,
            'delivery_verified':0,'outreach_approved':0,
            'note':'Reported source outreach is not provider-verified. Reconcile Gmail and verify original demand before contacting.'}


class API(BaseHTTPRequestHandler):
    server_version = 'Evercraft-Demand/0.2'

    def log_message(self, fmt, *args):
        # Do not print request bodies or authorization headers.
        print('%s %s' % (self.address_string(), fmt % args), flush=True)

    def reply(self, code, data):
        b = json.dumps(data, separators=(',', ':')).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'none'")
        self.end_headers()
        self.wfile.write(b)

    def authorized(self):
        candidate = self.headers.get('Authorization', '').removeprefix('Bearer ').strip()
        if not candidate or not hmac.compare_digest(candidate, self.server.api_token):
            self.reply(401, {'error': 'Unauthorized'})
            return False
        return True

    def body(self):
        if self.headers.get('Content-Type', '').split(';')[0].lower() != 'application/json':
            raise ValueError('Content-Type must be application/json')
        n = int(self.headers.get('Content-Length', '0'))
        if n <= 0 or n > MAX_BODY:
            raise ValueError('Invalid body length')
        return json.loads(self.rfile.read(n))

    def handle_api(self, method):
        if not self.authorized():
            return
        db = db_connect(self.server.db_path)
        try:
            path = self.path.split('?', 1)[0]
            if method == 'GET':
                if path == '/api/revenue-desk-review':
                    # The private API is a read-only local adapter for Revenue Desk.
                    # No source data is written to the private SQLite database.
                    from revenue_desk_bridge import REVENUE_URL, get_json
                    try:
                        return self.reply(200, project_source_review(get_json(REVENUE_URL)))
                    except Exception:
                        return self.reply(503, {'error':'Revenue Desk loopback unavailable or incompatible'})
                if path == '/api/opportunities':
                    rows = db.execute('SELECT * FROM opportunities ORDER BY updated DESC').fetchall()
                    return self.reply(200, {'records': [serialize(r, db) for r in rows]})
                if path == '/api/heartbeat':
                    rows = db.execute('SELECT payload,updated FROM opportunities').fetchall()
                    due = sum(bool((d := json.loads(r['payload'])).get('followup')) and d.get('status') not in CLOSED and d['followup'] <= dt.datetime.now().isoformat(timespec='minutes') for r in rows)
                    return self.reply(200, {'ok': True, 'service': 'evercraft-demand-command', 'count': len(rows), 'followups_due': due, 'last_update': max((r['updated'] for r in rows), default=None), 'checked_at': now()})
                if re.fullmatch(r'/api/opportunities/[0-9a-f-]{36}', path):
                    oid = path.removeprefix('/api/opportunities/')
                    row = db.execute('SELECT * FROM opportunities WHERE id=?', (oid,)).fetchone()
                    return self.reply(200, serialize(row, db)) if row else self.reply(404, {'error': 'Not found'})
            if method == 'POST' and path == '/api/opportunities':
                obj = self.body()
                validate(obj)
                oid = str(uuid.uuid4())
                stamp = now()
                f = fingerprint(obj)
                try:
                    db.execute('BEGIN IMMEDIATE')
                    db.execute('INSERT INTO opportunities (id,identity_key,fingerprint,payload,version,created,updated) VALUES(?,?,?,?,?,?,?)',
                               (oid, identity(obj), f, json.dumps(obj), 1, stamp, stamp))
                    append_event(db, oid, 'created', 'New opportunity captured', 'manual_or_systemia_intake', obj)
                    db.commit()
                except sqlite3.IntegrityError:
                    db.rollback()
                    other = db.execute('SELECT id FROM opportunities WHERE fingerprint=?', (f,)).fetchone()
                    return self.reply(409, {'error': 'Duplicate evidence/pain fingerprint', 'existing_id': other['id'] if other else None})
                return self.reply(201, {'id': oid, 'version': 1})
            match = re.fullmatch(r'/api/opportunities/([0-9a-f-]{36})(/interactions|/contact-check)?', path)
            if match:
                oid, action = match.groups()
                row = db.execute('SELECT * FROM opportunities WHERE id=?', (oid,)).fetchone()
                if not row:
                    return self.reply(404, {'error': 'Not found'})
                old = json.loads(row['payload'])
                if method == 'GET' and action == '/contact-check':
                    blocker = duplicate_contact(db, old, exclude_id=oid)
                    own_activity = bool(db.execute("SELECT 1 FROM events WHERE opportunity_id=? AND kind IN ('outreach_reported','delivery_verified') LIMIT 1", (oid,)).fetchone())
                    return self.reply(200, {'contact_conflict': bool(blocker) or own_activity, 'already_contacted_this_opportunity': own_activity, 'other_opportunity_id': blocker, 'requires_human_review': True, 'delivery_authorized': False})
                if method == 'PATCH' and action is None:
                    patch = self.body()
                    if not isinstance(patch, dict) or 'version' not in patch:
                        raise ValueError('Version required for optimistic concurrency')
                    supplied = patch.pop('version')
                    if supplied != row['version']:
                        return self.reply(409, {'error': 'Stale version', 'current_version': row['version']})
                    changed = {**old, **patch}
                    validate(changed)
                    stamp = now()
                    db.execute('BEGIN IMMEDIATE')
                    cur = db.execute('UPDATE opportunities SET payload=?, identity_key=?, fingerprint=?, version=version+1,updated=? WHERE id=? AND version=?',
                                     (json.dumps(changed), identity(changed), fingerprint(changed), stamp, oid, supplied))
                    if cur.rowcount != 1:
                        db.rollback()
                        return self.reply(409, {'error': 'Concurrent update'})
                    append_event(db, oid, 'updated', 'Changed fields: ' + ','.join(patch), 'authenticated_editor', changed)
                    db.commit()
                    return self.reply(200, {'id': oid, 'version': supplied + 1})
                if method == 'POST' and action == '/interactions':
                    event = self.body()
                    kind = event.get('kind')
                    note = str(event.get('note', '')).strip()
                    source = str(event.get('source', '')).strip()
                    if kind not in VALID_EVENT or not note or len(note) > 16000:
                        raise ValueError('Allowed event kind and note required')
                    if kind == 'delivery_verified' and not source:
                        raise ValueError('Delivery verification requires a provider receipt reference')
                    if kind == 'outreach_reported' and not source:
                        raise ValueError('Manual reported outreach requires channel / message reference')
                    db.execute('BEGIN IMMEDIATE')
                    append_event(db, oid, kind, note, source, old)
                    db.commit()
                    return self.reply(201, {'logged': True, 'transport_sent': False, 'verification_state': 'self_reported' if kind == 'outreach_reported' else 'receipt_supplied' if kind == 'delivery_verified' else 'logged'})
            return self.reply(404, {'error': 'Unknown route'})
        except (ValueError, json.JSONDecodeError, TypeError) as e:
            if db.in_transaction:
                db.rollback()
            return self.reply(400, {'error': str(e)})
        except sqlite3.IntegrityError as e:
            if db.in_transaction:
                db.rollback()
            return self.reply(409, {'error': 'Identity/pain duplicate or database constraint'})
        finally:
            db.close()

    def do_GET(self):
        if self.path.split('?', 1)[0] in ('/', '/console.html'):
            # The unauthenticated shell contains no customer data. Every API route
            # still requires the in-memory bearer token and stays loopback-only.
            path = Path(__file__).with_name('console.html')
            data = path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('X-Frame-Options', 'DENY')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(data)
        else:
            self.handle_api('GET')

    def do_POST(self):
        self.handle_api('POST')

    def do_PATCH(self):
        self.handle_api('PATCH')

    def do_OPTIONS(self):
        self.reply(405, {'error': 'Cross-origin requests not permitted'})


def start():
    token = os.environ.get('EVERCRAFT_DEMAND_TOKEN', '')
    if len(token) < 32:
        raise SystemExit('Set EVERCRAFT_DEMAND_TOKEN to a random secret of at least 32 characters')
    if os.environ.get('EVERCRAFT_DEMAND_HOST', '127.0.0.1') != '127.0.0.1':
        raise SystemExit('Direct API must bind to 127.0.0.1; use owned authenticated reverse proxy for remote access')
    path = Path(os.environ.get('EVERCRAFT_DEMAND_DB', str(Path.home() / '.local/state/evercraft/demand-command.sqlite')))
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.touch(mode=0o600)
    path.chmod(0o600)
    db_connect(path).close()
    port = int(os.environ.get('EVERCRAFT_DEMAND_PORT', '8796'))
    server = ThreadingHTTPServer(('127.0.0.1', port), API)
    server.api_token = token
    server.db_path = str(path)
    print(f'Demand Command API bound to 127.0.0.1:{port} (private; no outbound transport)', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    start()