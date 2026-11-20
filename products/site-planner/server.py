#!/usr/bin/env python3
"""Evercraft-owned site planning workspace. Python standard library + SQLite."""
import datetime as dt
import hashlib
import hmac
import json
import mimetypes
import os
from pathlib import Path
from contextlib import contextmanager
import re
import secrets
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from email.parser import BytesParser
from email.policy import default
from report_bridge import fetch_owned_ready_report

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('EVERCRAFT_SITE_DATA', str(ROOT / 'data'))).resolve()
DATA.mkdir(parents=True, exist_ok=True)
UPLOADS = DATA / 'uploads'
UPLOADS.mkdir(exist_ok=True)
DB = DATA / 'site-planner.sqlite3'
TOKEN = os.environ.get('EVERCRAFT_SITE_TOKEN', '')
BIND = os.environ.get('EVERCRAFT_SITE_HOST', '127.0.0.1')
PORT = int(os.environ.get('EVERCRAFT_SITE_PORT', '8808'))
MAX_BODY = 16 * 1024 * 1024
FIELDS = ['name','address','city','region','postal','country','owner','site_type','goal','status','decision_reason']
ALLOWED = {'.pdf','.png','.jpg','.jpeg','.webp','.txt','.csv','.dxf','.dwg'}

def require_local_bind(host):
    if host not in ('127.0.0.1','localhost','::1'):
        raise ValueError('External binding is disabled: customer authentication and per-site authorization are not ready')
    return host

def now(): return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
def uid(prefix): return prefix + '-' + secrets.token_hex(6).upper()
@contextmanager
def connect():
    """Transactional SQLite handle, always closed after use."""
    db=sqlite3.connect(DB,timeout=15)
    try:
        db.row_factory=sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA journal_mode=WAL')
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()

def init():
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS sites(id TEXT PRIMARY KEY,name TEXT,address TEXT NOT NULL,city TEXT,region TEXT,postal TEXT,country TEXT,owner TEXT,site_type TEXT,goal TEXT,status TEXT NOT NULL DEFAULT 'draft',decision_reason TEXT,created_at TEXT,updated_at TEXT);
        CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),category TEXT NOT NULL,status TEXT NOT NULL,source TEXT,observed_on TEXT,reference_url TEXT,finding TEXT NOT NULL,limitation TEXT,file_name TEXT,file_path TEXT,file_type TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS scenarios(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),name TEXT NOT NULL,chargers INTEGER,power REAL,layout TEXT,cost REAL,notes TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),created_at TEXT,snapshot_json TEXT NOT NULL,evidence_count INTEGER,scenario_count INTEGER);
        CREATE TABLE IF NOT EXISTS source_reports(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),external_report_id TEXT NOT NULL,report_sha256 TEXT NOT NULL,source_sha256 TEXT NOT NULL,report_type TEXT NOT NULL,requested_address TEXT NOT NULL,gateway_schema TEXT NOT NULL,source_coverage_schema TEXT NOT NULL,report_created_at TEXT,verification_basis TEXT NOT NULL,created_at TEXT NOT NULL, UNIQUE(site_id,external_report_id));
        CREATE TABLE IF NOT EXISTS order_source_links(order_id TEXT PRIMARY KEY REFERENCES orders(id),site_id TEXT NOT NULL REFERENCES sites(id),source_report_id TEXT NOT NULL REFERENCES source_reports(id));
        CREATE TABLE IF NOT EXISTS order_controls(order_id TEXT PRIMARY KEY REFERENCES orders(id),site_id TEXT NOT NULL REFERENCES sites(id),product_key TEXT NOT NULL,lane TEXT NOT NULL CHECK(lane IN ('commercial_quote','internal_planning')),payment_state TEXT NOT NULL CHECK(payment_state IN ('checkout_unconfigured','not_applicable')),scope_review_state TEXT NOT NULL DEFAULT 'pending',capacity_review_state TEXT NOT NULL DEFAULT 'pending',fulfillment_release_state TEXT NOT NULL DEFAULT 'held',created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),report_id TEXT NOT NULL REFERENCES reports(id),scenario_id TEXT NOT NULL REFERENCES scenarios(id),scope TEXT,requested_by TEXT,status TEXT NOT NULL DEFAULT 'queued',created_at TEXT);
        CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),order_id TEXT NOT NULL REFERENCES orders(id),report_id TEXT NOT NULL REFERENCES reports(id),title TEXT,reviewer TEXT,status TEXT NOT NULL,notes TEXT,file_name TEXT,file_path TEXT,file_type TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS gaps(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),type TEXT,severity TEXT,title TEXT,detail TEXT,status TEXT NOT NULL DEFAULT 'open',created_at TEXT);
        CREATE TABLE IF NOT EXISTS engineering_actions(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),order_id TEXT NOT NULL REFERENCES orders(id),previous_status TEXT NOT NULL,new_status TEXT NOT NULL,actor TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),event_type TEXT NOT NULL,aggregate_id TEXT NOT NULL,payload_json TEXT NOT NULL,payload_sha256 TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,delivered_at TEXT);
        CREATE INDEX IF NOT EXISTS idx_engineering_actions ON engineering_actions(order_id,created_at);
        CREATE INDEX IF NOT EXISTS idx_outbox_state ON outbox(state,created_at);
        CREATE INDEX IF NOT EXISTS idx_evidence_site ON evidence(site_id);
        CREATE INDEX IF NOT EXISTS idx_order_report ON orders(report_id);
        CREATE INDEX IF NOT EXISTS idx_order_controls_site ON order_controls(site_id,order_id);
        CREATE INDEX IF NOT EXISTS idx_source_report_site ON source_reports(site_id,external_report_id);
        CREATE INDEX IF NOT EXISTS idx_plan_order ON plans(order_id);
        ''')

def rows(db,table,site_id):
    return [dict(r) for r in db.execute(f'SELECT * FROM {table} WHERE site_id=? ORDER BY created_at DESC',(site_id,))]
def getsite(db,sid):
    row=db.execute('SELECT * FROM sites WHERE id=?',(sid,)).fetchone()
    if not row: raise ValueError('Site not found')
    return dict(row)
def site_detail(db,sid):
    return {'site':getsite(db,sid),**{t:rows(db,t,sid) for t in ['evidence','scenarios','reports','orders','plans','gaps','source_reports','order_controls']}}
def snapshot(db,sid):
    d=site_detail(db,sid)
    for e in d['evidence']:
        e.pop('file_path',None)
    for p in d['plans']:
        p.pop('file_path',None)
    d['reports']=[{'id':r['id'],'created_at':r['created_at']} for r in d['reports']]
    return d

def append_event(db, sid, event_type, aggregate_id, payload):
    """Durably stage a Systemia event, without claiming transport or delivery."""
    wire=json.dumps(payload,sort_keys=True,separators=(',',':'),ensure_ascii=False)
    event_id=uid('EVENT')
    db.execute('INSERT INTO outbox(id,site_id,event_type,aggregate_id,payload_json,payload_sha256,state,created_at) VALUES (?,?,?,?,?,?,?,?)',
               (event_id,sid,event_type,aggregate_id,wire,hashlib.sha256(wire.encode()).hexdigest(),'pending',now()))
    return event_id

ORDER_STATES = ('queued','assigned','in_review','returned','revision_requested','approved','cancelled')
ORDER_TRANSITIONS = {
    'queued': {'assigned','cancelled'},
    'assigned': {'in_review','cancelled'},
    'in_review': {'returned','revision_requested'},
    'returned': {'approved','revision_requested'},
    'revision_requested': {'assigned','cancelled'},
    'approved': set(),
    'cancelled': set(),
}

def engineering_queue(db, status=None):
    if status is not None and status not in ORDER_STATES:
        raise ValueError('Invalid engineering status')
    q = """SELECT o.id AS order_id,o.site_id,o.report_id,o.scenario_id,
        o.scope,o.requested_by,o.status,o.created_at,s.address,s.name AS site_name,
        sc.name AS scenario_name,oc.lane AS order_lane,
        COALESCE(oc.payment_state,'unclassified_hold') AS payment_state,
        COALESCE(oc.fulfillment_release_state,'held') AS fulfillment_release_state
        FROM orders o JOIN sites s ON s.id=o.site_id
        JOIN scenarios sc ON sc.id=o.scenario_id
        LEFT JOIN order_controls oc ON oc.order_id=o.id AND oc.site_id=o.site_id"""
    return [dict(r) for r in db.execute(q + (' WHERE o.status=?' if status else '') + ' ORDER BY o.created_at,o.id', (status,) if status else ())]

def transition_order(db, site_id, order_id, new_status, actor, reason):
    """Transactional queue transition with persisted actor and outbox event."""
    if new_status not in ORDER_STATES or not str(actor or '').strip() or not str(reason or '').strip():
        raise ValueError('A valid status, actor and reason are required')
    order = db.execute('SELECT id,status,report_id FROM orders WHERE id=? AND site_id=?',(order_id,site_id)).fetchone()
    if order is None:
        raise ValueError('Order does not belong to site')
    old_status = order['status']
    controls=db.execute('SELECT lane,fulfillment_release_state FROM order_controls WHERE order_id=? AND site_id=?',(order_id,site_id)).fetchone()
    if new_status!='cancelled' and (controls is None or controls['lane']!='internal_planning'):
        raise ValueError('Commercial quote or unclassified order is held: verified checkout, scope and capacity approval not connected')
    if new_status not in ORDER_TRANSITIONS.get(old_status,set()):
        raise ValueError('Invalid engineering state transition')
    db.execute('UPDATE orders SET status=? WHERE id=? AND site_id=?',(new_status,order_id,site_id))
    action_id=uid('ACTION')
    db.execute('INSERT INTO engineering_actions VALUES (?,?,?,?,?,?,?,?)',
        (action_id,site_id,order_id,old_status,new_status,str(actor).strip(),str(reason).strip(),now()))
    append_event(db,site_id,'site.plan.status_changed.v1',order_id,
        {'site_id':site_id,'order_id':order_id,'report_id':order['report_id'],
         'previous_status':old_status,'status':new_status,'actor':str(actor).strip(),
         'reason':str(reason).strip(),'action_id':action_id})
    return dict(db.execute('SELECT * FROM orders WHERE id=?',(order_id,)).fetchone())

def newreport(db,sid,source_report_id=None):
    d=snapshot(db,sid)
    if source_report_id:
        source=db.execute('SELECT * FROM source_reports WHERE id=? AND site_id=?',(source_report_id,sid)).fetchone()
        if source is None: raise ValueError('Imported source report does not belong to this site')
        if ' '.join(str(source['requested_address']).casefold().split()) != ' '.join(str(getsite(db,sid)['address']).casefold().split()):
            raise ValueError('Upstream source report does not match the current site address')
        d['originating_source_report']={key:source[key] for key in ('id','external_report_id','report_sha256','source_sha256','report_type','gateway_schema','source_coverage_schema','verification_basis')}
    rid=uid('RPT')
    db.execute('INSERT INTO reports VALUES(?,?,?,?,?,?)',(rid,sid,now(),json.dumps(d,ensure_ascii=False),len(d['evidence']),len(d['scenarios'])))
    return dict(db.execute('SELECT id,site_id,created_at,evidence_count,scenario_count FROM reports WHERE id=?',(rid,)).fetchone())

class Handler(BaseHTTPRequestHandler):
    server_version='EvercraftSitePlanner/0.1'
    def log_message(self,format,*args):
        print('%s %s'%(self.address_string(),format%args))
    def send(self,code,data,ctype='application/json',extra=None):
        body=(data if isinstance(data,bytes) else json.dumps(data,ensure_ascii=False).encode()) if ctype=='application/json' else data
        self.send_response(code)
        self.send_header('Content-Type',ctype)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('X-Frame-Options','DENY')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        for k,v in (extra or {}).items():self.send_header(k,v)
        self.end_headers()
        self.wfile.write(body)
    def bad(self,message,code=400): self.send(code,{'error':str(message)})
    def authorized(self):
        if TOKEN and not hmac.compare_digest(self.headers.get('Authorization',''), 'Bearer '+TOKEN):
            self.bad('Unauthorized',401);return False
        return True
    def body(self):
        n=int(self.headers.get('Content-Length',0))
        if n<0 or n>MAX_BODY: raise ValueError('Invalid request length')
        data=self.rfile.read(n)
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':raise ValueError('JSON required')
        v=json.loads(data)
        if not isinstance(v,dict):raise ValueError('JSON object required')
        return v
    def upload(self,table,key,id):
        ct=self.headers.get('Content-Type','')
        if not ct.startswith('multipart/form-data;'):raise ValueError('Multipart file required')
        n=int(self.headers.get('Content-Length','0'))
        if not 0<n<=MAX_BODY:raise ValueError('File missing or over 15 MB')
        m=BytesParser(policy=default).parsebytes(b'Content-Type: '+ct.encode()+b'\r\nMIME-Version: 1.0\r\n\r\n'+self.rfile.read(n))
        part=next((x for x in m.iter_parts() if x.get_param('name',header='content-disposition')=='file'),None)
        if part is None:raise ValueError('File part missing')
        original=Path(part.get_filename() or 'file').name[:180]
        ext=Path(original).suffix.lower()
        if ext not in ALLOWED:raise ValueError('Unsupported file extension')
        data=part.get_payload(decode=True)
        if not data or len(data)>15*1024*1024:raise ValueError('File missing or over 15 MB')
        fn=uid('BLOB')+ext
        p=UPLOADS/fn
        with connect() as db:
            r=db.execute(f'SELECT id FROM {table} WHERE id=?',(id,)).fetchone()
            if not r:raise ValueError('Record not found')
            p.write_bytes(data)
            db.execute(f'UPDATE {table} SET file_name=?,file_path=?,file_type=? WHERE id=?',(original,fn,mimetypes.guess_type(original)[0] or 'application/octet-stream',id))
        return {'id':id,'name':original,'sha256':hashlib.sha256(data).hexdigest(),'size':len(data)}
    def download(self,table,id):
        with connect() as db:r=db.execute(f'SELECT file_name,file_path,file_type FROM {table} WHERE id=?',(id,)).fetchone()
        if not r or not r['file_path']:raise ValueError('File not found')
        data=(UPLOADS/Path(r['file_path']).name).read_bytes()
        self.send(200,data,'application/octet-stream',{'Content-Disposition':f'attachment; filename="{re.sub("[^a-zA-Z0-9._-]","_",r["file_name"])}"'})
    def do_GET(self):
        p=urlsplit(self.path).path
        if not self.authorized():return
        try:
            if p=='/' or p=='/index.html':return self.send(200,(ROOT/'index.html').read_bytes(),'text/html; charset=utf-8')
            if p=='/sample' or p=='/sample.html':return self.send(200,(ROOT/'sample.html').read_bytes(),'text/html; charset=utf-8')
            if p=='/plan-studio' or p=='/plan-studio.html':return self.send(200,(ROOT/'plan-studio.html').read_bytes(),'text/html; charset=utf-8')
            if p=='/plan-drafts.js':return self.send(200,(ROOT/'plan-drafts.js').read_bytes(),'application/javascript; charset=utf-8')
            if p=='/plan-pdf.js':return self.send(200,(ROOT/'plan-pdf.js').read_bytes(),'application/javascript; charset=utf-8')
            if p=='/api/health':return self.send(200,{'ok':True,'product':'Evercraft Site Planner','mode':'self-hosted'})
            with connect() as db:
                if p=='/api/engineering/queue':
                    return self.send(200,engineering_queue(db))
                if p=='/api/commercial/readiness':
                    pilot_file=ROOT/'stripe_pilot.json'
                    pilot={}
                    if pilot_file.is_file():
                        try:
                            record=json.loads(pilot_file.read_text(encoding='utf-8'))
                            founding=record.get('founding_five') or {}
                            standard=record.get('standard') or {}
                            if (record.get('schema')=='evercraft.site-planner.stripe-catalog-snapshot.v1'
                                and record.get('product_key')=='evercraft-site-planner-concept-pilot-v1'
                                and record.get('payment_link_active_at_verification') is False
                                and record.get('product_active_at_verification') is False
                                and standard.get('last_verified_link_active') is False
                                and founding.get('last_verified_link_active') is False
                                and standard.get('unit_amount_cents')==49900
                                and founding.get('unit_amount_cents')==34900
                                and founding.get('checkout_completed_session_limit')==5):
                                pilot={'catalog_recorded':True,'merchant_name':record.get('merchant_name'),
                                       'currency':record.get('price_currency'),
                                       'unit_amount_cents':standard['unit_amount_cents'],
                                       'founding_five_unit_amount_cents':founding['unit_amount_cents'],
                                       'founding_five_completed_session_limit':5,
                                       'price_status':'provisional_two_tier_pricing',
                                       'link_status_at_last_verification':'both_inactive',
                                       'live_stripe_status_checked_by_server':False}
                        except (ValueError,OSError):
                            pilot={}
                    return self.send(200,{'product_key':'evercraft-site-planner',
                      'stripe_pilot':pilot,'checkout_configured':False,
                      'payment_verification_connected':False,'systemia_fulfillment_connected':False,
                      'customer_authentication_connected':False,'commercial_release_allowed':False,
                      'next_action':'Approve pilot price and scope, tax classification, then integrate exact Stripe settlement and verified Systemia delivery before enabling checkout'})
                if p=='/api/outbox':
                    return self.send(200,[dict(r) for r in db.execute('SELECT id,site_id,event_type,aggregate_id,payload_sha256,state,created_at,delivered_at FROM outbox ORDER BY created_at,id')])
                if p=='/api/sites':
                    q='''SELECT s.*, (SELECT count(*) FROM orders o WHERE o.site_id=s.id) orders, (SELECT count(*) FROM plans p WHERE p.site_id=s.id) plans FROM sites s ORDER BY updated_at DESC'''
                    return self.send(200,[dict(r) for r in db.execute(q)])
                m=re.fullmatch(r'/api/sites/([A-Za-z0-9-]+)',p)
                if m:return self.send(200,site_detail(db,m[1]))
                m=re.fullmatch(r'/api/reports/([A-Za-z0-9-]+)/export',p)
                if m:
                    r=db.execute('SELECT snapshot_json FROM reports WHERE id=?',(m[1],)).fetchone()
                    if not r:raise ValueError('Report missing')
                    return self.send(200,r['snapshot_json'].encode(),'application/json',{'Content-Disposition':f'attachment; filename="{m[1]}.json"'})
            m=re.fullmatch(r'/api/files/([A-Za-z0-9-]+)',p)
            if m:return self.download('evidence',m[1])
            m=re.fullmatch(r'/api/plan-files/([A-Za-z0-9-]+)',p)
            if m:return self.download('plans',m[1])
            self.bad('Not found',404)
        except (ValueError,sqlite3.Error,FileNotFoundError) as e:self.bad(str(e),404)
    def do_PUT(self):
        if not self.authorized():return
        try:
            m=re.fullmatch(r'/api/sites/([A-Za-z0-9-]+)/orders/([A-Za-z0-9-]+)/status',urlsplit(self.path).path)
            if m:
                v=self.body()
                with connect() as db:
                    result=transition_order(db,m[1],m[2],v.get('status'),v.get('actor'),v.get('reason'))
                    db.commit()
                return self.send(200,result)
            m=re.fullmatch(r'/api/sites/([A-Za-z0-9-]+)',urlsplit(self.path).path)
            if not m: return self.bad('Not found',404)
            v=self.body()
            with connect() as db:
                getsite(db,m[1]);keys=[k for k in FIELDS if k in v]
                if not keys:raise ValueError('Nothing to update')
                if 'address' in keys and not str(v['address']).strip():raise ValueError('Address required')
                db.execute('UPDATE sites SET '+','.join(f'{k}=?' for k in keys)+',updated_at=? WHERE id=?',tuple(v[k] for k in keys)+(now(),m[1]))
                record=getsite(db,m[1]);db.commit();self.send(200,record)
        except (ValueError,sqlite3.Error) as e:self.bad(str(e))
    def do_POST(self):
        if not self.authorized():return
        p=urlsplit(self.path).path
        try:
            m=re.fullmatch(r'/api/(evidence|plans)/([A-Za-z0-9-]+)/file',p)
            if m:return self.send(201,self.upload(m[1],None,m[2]))
            v=self.body()
            m=re.fullmatch(r'/api/sites/([A-Za-z0-9-]+)/source-reports/import',p)
            if m:
                upstream_id=str(v.get('external_report_id','')).strip()
                with connect() as db:
                    site=getsite(db,m[1])
                    existing=db.execute('SELECT * FROM source_reports WHERE site_id=? AND external_report_id=?',(m[1],upstream_id)).fetchone()
                    if existing:return self.send(200,dict(existing))
                verified=fetch_owned_ready_report(upstream_id,site['address'])
                with connect() as db:
                    getsite(db,m[1])
                    existing=db.execute('SELECT * FROM source_reports WHERE site_id=? AND external_report_id=?',(m[1],upstream_id)).fetchone()
                    if existing:return self.send(200,dict(existing))
                    sid=uid('SRC')
                    cols=['external_report_id','report_sha256','source_sha256','report_type','requested_address','gateway_schema','source_coverage_schema','report_created_at','verification_basis']
                    db.execute('INSERT INTO source_reports ('+','.join(['id','site_id']+cols+['created_at'])+') VALUES ('+','.join(['?']*(len(cols)+3))+')',(sid,m[1])+tuple(verified[k] for k in cols)+(now(),))
                    append_event(db,m[1],'site.source_report.linked.v1',sid,{'site_id':m[1],'source_report_id':sid,'external_report_id':upstream_id,'report_sha256':verified['report_sha256'],'source_sha256':verified['source_sha256']})
                    db.commit()
                    return self.send(201,dict(db.execute('SELECT * FROM source_reports WHERE id=?',(sid,)).fetchone()))
            if p=='/api/sites':
                if not str(v.get('address','')).strip():raise ValueError('Address required')
                sid=uid('SITE');t=now()
                with connect() as db:
                    db.execute('INSERT INTO sites ('+','.join(['id']+FIELDS+['created_at','updated_at'])+') VALUES ('+','.join(['?']*(len(FIELDS)+3))+')',(sid,)+tuple(v.get(k, 'draft' if k=='status' else '') for k in FIELDS)+(t,t))
                    record=getsite(db,sid);db.commit();return self.send(201,record)
            m=re.fullmatch(r'/api/sites/([A-Za-z0-9-]+)/(evidence|scenarios|reports|orders|plans|gaps)',p)
            if not m:return self.bad('Not found',404)
            sid,kind=m.groups()
            with connect() as db:
                getsite(db,sid)
                if kind=='reports':
                    r=newreport(db,sid)
                    append_event(db,sid,'site.report.created.v1',r['id'],{'site_id':sid,'report_id':r['id'],'evidence_count':r['evidence_count'],'scenario_count':r['scenario_count']})
                    db.commit();return self.send(201,r)
                if kind=='evidence':
                    if not v.get('finding') or v.get('status') not in ('verified','unverified','assumption'):raise ValueError('Finding and valid classification required')
                    id=uid('EV');keys=['category','status','source','observed_on','reference_url','finding','limitation']
                elif kind=='scenarios':
                    if not v.get('sc_name'):raise ValueError('Scenario name required')
                    id=uid('SCN');keys=['name','chargers','power','layout','cost','notes'];v['name']=v['sc_name']
                    for key in ('chargers','power','cost'):
                        v[key]=float(v[key]) if str(v.get(key,'')) else None
                    if v['chargers'] is not None and (v['chargers'] < 0 or not v['chargers'].is_integer()):raise ValueError('Charger count must be a nonnegative integer')
                    if v['power'] is not None and (v['power'] < 0 or not __import__('math').isfinite(v['power'])):raise ValueError('Power must be finite and nonnegative')
                    if v['cost'] is not None and (v['cost'] < 0 or not __import__('math').isfinite(v['cost'])):raise ValueError('Cost must be finite and nonnegative')
                    v['chargers']=int(v['chargers']) if v['chargers'] is not None else None
                elif kind=='orders':
                    lane=v.get('order_kind','commercial_quote')
                    if lane not in ('commercial_quote','internal_planning'):
                        raise ValueError('Order kind must be commercial_quote or internal_planning')
                    scn=db.execute('SELECT id FROM scenarios WHERE id=? AND site_id=?',(v.get('scenario_id'),sid)).fetchone()
                    if not scn:raise ValueError('Scenario must belong to this site')
                    linked_source_id=str(v.get('source_report_id','')).strip() or None
                    rpt=newreport(db,sid,linked_source_id)
                    id=uid('ORDER');keys=['report_id','scenario_id','scope','requested_by'];v['report_id']=rpt['id']
                elif kind=='plans':
                    order=db.execute('SELECT report_id FROM orders WHERE id=? AND site_id=?',(v.get('order_id'),sid)).fetchone()
                    if not order:raise ValueError('Order must belong to this site')
                    controls=db.execute('SELECT lane FROM order_controls WHERE order_id=? AND site_id=?',(v.get('order_id'),sid)).fetchone()
                    if not controls or controls['lane']!='internal_planning':
                        raise ValueError('Commercial plan return held until provider verified payment and approval workflow exists')
                    if v.get('plan_status') not in ('preliminary','reviewed','revision_requested'):raise ValueError('Invalid plan status')
                    id=uid('PLAN');keys=['order_id','report_id','title','reviewer','status','notes'];v['title']=v.get('plan_title','');v['report_id']=order['report_id'];v['status']=v['plan_status']
                elif kind=='gaps':
                    if not v.get('title'):raise ValueError('Gap title required')
                    id=uid('GAP');keys=['type','severity','title','detail']
                db.execute(f'INSERT INTO {kind} ('+','.join(['id','site_id']+keys+['created_at'])+') VALUES ('+','.join(['?']*(len(keys)+3))+')',(id,sid)+tuple(v.get(k,'') for k in keys)+(now(),))
                record=dict(db.execute(f'SELECT * FROM {kind} WHERE id=?',(id,)).fetchone())
                if kind=='orders':
                    db.execute('INSERT INTO order_controls(order_id,site_id,product_key,lane,payment_state,scope_review_state,capacity_review_state,fulfillment_release_state,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
                        (id,sid,'evercraft-site-planner',lane,'checkout_unconfigured' if lane=='commercial_quote' else 'not_applicable','pending','pending','held',now()))
                    payload={'site_id':sid,'order_id':id,'report_id':record['report_id'],'scenario_id':record['scenario_id'],'scope':record['scope'],'requested_by':record['requested_by']}
                    if linked_source_id:
                        db.execute('INSERT INTO order_source_links VALUES (?,?,?)',(id,sid,linked_source_id))
                        src=db.execute('SELECT external_report_id FROM source_reports WHERE id=?',(linked_source_id,)).fetchone()
                        payload.update({'source_report_id':linked_source_id,'external_report_id':src['external_report_id']})
                    append_event(db,sid,'site.plan.requested.v1',id,payload)
                    if lane=='commercial_quote':
                        append_event(db,sid,'site.plan.commercial_hold.v1',id,{
                            'site_id':sid,'order_id':id,'report_id':record['report_id'],
                            'product_key':'evercraft-site-planner','payment_state':'checkout_unconfigured',
                            'fulfillment_release_state':'held','fulfillment_authorized':False,
                            'hold_reason':'no_verified_site_planner_checkout_or_scope_capacity_approval'})
                if kind=='plans':
                    append_event(db,sid,'site.plan.registered.v1',id,{'site_id':sid,'plan_id':id,'order_id':record['order_id'],'report_id':record['report_id'],'status':record['status']})
                db.commit()
                return self.send(201,record)
        except (ValueError,sqlite3.Error,json.JSONDecodeError) as e:self.bad(str(e))

if __name__=='__main__':
    init()
    require_local_bind(BIND)
    print(f'Evercraft Site Planner at http://{BIND}:{PORT} (data: {DATA})')
    ThreadingHTTPServer((BIND,PORT),Handler).serve_forever()
