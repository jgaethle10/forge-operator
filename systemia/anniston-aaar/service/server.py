#!/usr/bin/env python3
"""AAAR owner-operated local API: evidence registry and review-only requests.

Python standard library only. No direct UAV, aircraft, robot or remote job controls.
Requires AAAR_TOKEN, binds loopback by default, persists private local state.
A successful HTTP write is NOT a canonical GitHub sync or Systemia execution.
"""
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import tempfile
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

SCHEMA = 'evercraft.anniston-aaar.registry.v2'
MAX_BODY = 2_000_000
LOCK = threading.RLock()


def now():
    return datetime.now(timezone.utc).isoformat()


def validate_state(value):
    if not isinstance(value, dict):
        raise ValueError('Registry must be an object')
    if value.get('schema') not in (SCHEMA, 'evercraft.anniston-aaar.v2'):
        raise ValueError('Unsupported registry schema')
    programs = value.get('programs')
    if not isinstance(programs, list) or len(programs) > 1000:
        raise ValueError('Programs must be an array of at most 1000')
    seen = set()
    for p in programs:
        if not isinstance(p, dict) or not isinstance(p.get('id'), str) or not p['id']:
            raise ValueError('Each program needs a nonempty ID')
        if len(p['id']) > 90 or p['id'] in seen:
            raise ValueError('Duplicate or oversized program ID')
        seen.add(p['id'])
        if not isinstance(p.get('name'), str) or not p['name'].strip():
            raise ValueError('Each program needs a name')
    if not isinstance(value.get('history', []), list) or len(value.get('history', [])) > 500:
        raise ValueError('History limit exceeded')
    return {'schema': SCHEMA, 'programs': programs, 'history': value.get('history', [])}


def load(db):
    if db.exists():
        return json.loads(db.read_text('utf8'))
    return {'schema': SCHEMA, 'revision': 0, 'updated_at': now(), 'programs': [], 'history': [], 'orders': [], 'audit': []}


def save(db, value):
    db.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.aaar-', suffix='.tmp', dir=db.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf8') as fh:
            json.dump(value, fh, indent=2, ensure_ascii=False)
            fh.write('\n')
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(name, 0o600)
        os.replace(name, db)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def make_handler(db, token, site_dir):
    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, body):
            raw = json.dumps(body, separators=(',', ':')).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def authorized(self):
            supplied = self.headers.get('Authorization', '')
            return hmac.compare_digest(supplied.encode(), ('Bearer ' + token).encode())

        def payload(self):
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                raise ValueError('Content-Type must be application/json')
            try:
                size = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                raise ValueError('Missing/invalid Content-Length')
            if size < 2 or size > MAX_BODY:
                raise ValueError('Request size outside limits')
            return json.loads(self.rfile.read(size))

        def do_GET(self):
            path = urlparse(self.path).path
            if path == '/healthz':
                return self.reply(200, {'status':'ready','product':'AAAR','mode':'private_local','systemia_execution':False,'github_synced':False})
            if path == '/' or path == '/index.html':
                page = site_dir / 'index.html'
                if not page.is_file():
                    return self.reply(404, {'error':'site_not_installed'})
                raw=page.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type','text/html; charset=utf-8')
                self.send_header('Cache-Control','no-store')
                self.send_header('Content-Security-Policy',"default-src 'self' 'unsafe-inline' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
                self.send_header('X-Content-Type-Options','nosniff')
                self.send_header('Content-Length',str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
                return
            if not self.authorized():
                return self.reply(401, {'error':'unauthorized'})
            if path == '/api/state':
                with LOCK:
                    data=load(db)
                return self.reply(200, {'schema':SCHEMA,'revision':data['revision'],'updated_at':data['updated_at'],'programs':data['programs'],'history':data['history'],'orders':data['orders'],'canonical_sync':'pending_git_commit'})
            if path == '/api/audit':
                with LOCK:
                    data=load(db)
                return self.reply(200, {'revision':data['revision'],'audit':data['audit'][-200:]})
            return self.reply(404, {'error':'unknown_path'})

        def do_POST(self):
            if not self.authorized():
                return self.reply(401, {'error':'unauthorized'})
            path = urlparse(self.path).path
            try:
                payload=self.payload()
                if not isinstance(payload,dict):
                    raise ValueError('JSON object required')
                with LOCK:
                    data=load(db)
                    if path == '/api/state':
                        expected=payload.get('expected_revision')
                        if type(expected) is not int or expected != data['revision']:
                            return self.reply(409, {'error':'revision_conflict','current_revision':data['revision']})
                        body=validate_state(payload.get('state'))
                        data.update(body)
                        kind='registry_update'
                        receipt={'status':'saved_locally','github_synced':False,'systemia_execution':False}
                    elif path == '/api/orders':
                        p=payload.get('program_id'); action=payload.get('action'); key=payload.get('idempotency_key')
                        if not all(isinstance(x,str) and x.strip() for x in (p,action,key)) or len(key)>128 or len(action)>1800:
                            raise ValueError('program_id, action, idempotency_key required')
                        if p not in {x['id'] for x in data['programs']}:
                            return self.reply(404, {'error':'unknown_program'})
                        prior=next((x for x in data['orders'] if x['idempotency_key']==key),None)
                        if prior:
                            if prior['program_id']!=p or prior['action']!=action:
                                return self.reply(409, {'error':'idempotency_conflict'})
                            return self.reply(200, {'order':prior,'deduplicated':True,'systemia_execution':False})
                        if len(data['orders']) >= 1000:
                            return self.reply(422, {'error':'order_limit'})
                        order={'id':'AAAR-WO-'+secrets.token_hex(8).upper(),'program_id':p,'action':action,'idempotency_key':key,'created_at':now(),'status':'queued_for_systemia_review','safety':'simulation_and_review_only','systemia_execution':False}
                        data['orders'].append(order)
                        kind='review_order_queued';receipt={'order':order,'deduplicated':False,'systemia_execution':False}
                    else:
                        return self.reply(404, {'error':'unknown_path'})
                    data['revision']+=1;data['updated_at']=now()
                    data['audit'].append({'kind':kind,'revision':data['revision'],'at':data['updated_at'],'content_sha256':digest({'programs':data['programs'],'orders':data['orders']})})
                    data['audit']=data['audit'][-1000:]
                    save(db,data)
                    receipt['revision']=data['revision']
                    return self.reply(200,receipt)
            except (ValueError,TypeError,json.JSONDecodeError) as exc:
                return self.reply(422,{'error':'invalid_request','detail':str(exc)})

    return Handler


def main():
    token=os.getenv('AAAR_TOKEN','')
    if len(token)<24:
        raise SystemExit('AAAR_TOKEN must be set to a secret with at least 24 characters')
    host=os.getenv('AAAR_HOST','127.0.0.1')
    if host not in ('127.0.0.1','::1'):
        raise SystemExit('Only loopback binding supported; put authenticated owned reverse proxy in front')
    port=int(os.getenv('AAAR_PORT','8876'))
    db=Path(os.getenv('AAAR_DB',str(Path.home()/'.local/state/evercraft/aaar/private-registry.json'))).expanduser()
    site=Path(__file__).resolve().parent.parent/'site'
    srv=ThreadingHTTPServer((host,port),make_handler(db,token,site))
    print(f'AAAR private operator service: http://{host}:{port} (GitHub sync pending; no device controls)',flush=True)
    srv.serve_forever()

if __name__=='__main__':
    main()