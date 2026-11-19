#!/usr/bin/env python3
"""Evercraft-owned site planning workspace. Python standard library + SQLite."""
import datetime as dt
import hashlib
import hmac
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from email.parser import BytesParser
from email.policy import default

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

def now(): return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
def uid(prefix): return prefix + '-' + secrets.token_hex(6).upper()
def connect():
    db=sqlite3.connect(DB,timeout=15)
    db.row_factory=sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA journal_mode=WAL')
    return db

def init():
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS sites(id TEXT PRIMARY KEY,name TEXT,address TEXT NOT NULL,city TEXT,region TEXT,postal TEXT,country TEXT,owner TEXT,site_type TEXT,goal TEXT,status TEXT NOT NULL DEFAULT 'draft',decision_reason TEXT,created_at TEXT,updated_at TEXT);
        CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),category TEXT NOT NULL,status TEXT NOT NULL,source TEXT,observed_on TEXT,reference_url TEXT,finding TEXT NOT NULL,limitation TEXT,file_name TEXT,file_path TEXT,file_type TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS scenarios(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),name TEXT NOT NULL,chargers INTEGER,power REAL,layout TEXT,cost REAL,notes TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),created_at TEXT,snapshot_json TEXT NOT NULL,evidence_count INTEGER,scenario_count INTEGER);
        CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),report_id TEXT NOT NULL REFERENCES reports(id),scenario_id TEXT NOT NULL REFERENCES scenarios(id),scope TEXT,requested_by TEXT,status TEXT NOT NULL DEFAULT 'queued',created_at TEXT);
        CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),order_id TEXT NOT NULL REFERENCES orders(id),report_id TEXT NOT NULL REFERENCES reports(id),title TEXT,reviewer TEXT,status TEXT NOT NULL,notes TEXT,file_name TEXT,file_path TEXT,file_type TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS gaps(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),type TEXT,severity TEXT,title TEXT,detail TEXT,status TEXT NOT NULL DEFAULT 'open',created_at TEXT);
        CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),event_type TEXT NOT NULL,aggregate_id TEXT NOT NULL,payload_json TEXT NOT NULL,payload_sha256 TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,delivered_at TEXT);
        CREATE INDEX IF NOT EXISTS idx_outbox_state ON outbox(state,created_at);
        CREATE INDEX IF NOT EXISTS idx_evidence_site ON evidence(site_id);
        CREATE INDEX IF NOT EXISTS idx_order_report ON orders(report_id);
        CREATE INDEX IF NOT EXISTS idx_plan_order ON plans(order_id);
        """)

def rows(db,table,site_id):
    return [dict(r) for r in db.execute(f'SELECT * FROM {table} WHERE site_id=? ORDER BY created_at DESC',(site_id,))]
def getsite(db,sid):
    row=db.execute('SELECT * FROM sites WHERE id=?',(sid,)).fetchone()
    if not row: raise ValueError('Site not found')
    return dict(row)
def site_detail(db,sid):
    return {'site':getsite(db,sid),**{t:rows(db,t,sid) for t in ['evidence','scenarios','reports','orders','plans','gaps']}}
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

def newreport(db,sid):
    d=snapshot(db,sid)
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
            if p=='/api/health':return self.send(200,{'ok':True,'product':'Evercraft Site Planner','mode':'self-hosted'})
            with connect() as db:
                if p=='/api/outbox':
                    return self.send(200,[dict(r) for r in db.execute('SELECT id,site_id,event_type,aggregate_id,payload_sha256,state,created_at,delivered_at FROM outbox ORDER BY created_at,id')])
                if p=='/api/sites':
                    q="""SELECT s.*, (SELECT count(*) FROM orders o WHERE o.site_id=s.id) orders, (SELECT count(*) FROM plans p WHERE p.site_id=s.id) plans FROM sites s ORDER BY updated_at DESC"""
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
                    scn=db.execute('SELECT id FROM scenarios WHERE id=? AND site_id=?',(v.get('scenario_id'),sid)).fetchone()
                    if not scn:raise ValueError('Scenario must belong to this site')
                    rpt=newreport(db,sid)
                    id=uid('ORDER');keys=['report_id','scenario_id','scope','requested_by'];v['report_id']=rpt['id']
                elif kind=='plans':
                    order=db.execute('SELECT report_id FROM orders WHERE id=? AND site_id=?',(v.get('order_id'),sid)).fetchone()
                    if not order:raise ValueError('Order must belong to this site')
                    if v.get('plan_status') not in ('preliminary','reviewed','revision_requested'):raise ValueError('Invalid plan status')
                    id=uid('PLAN');keys=['order_id','report_id','title','reviewer','status','notes'];v['title']=v.get('plan_title','');v['report_id']=order['report_id'];v['status']=v['plan_status']
                elif kind=='gaps':
                    if not v.get('title'):raise ValueError('Gap title required')
                    id=uid('GAP');keys=['type','severity','title','detail']
                db.execute(f'INSERT INTO {kind} ('+','.join(['id','site_id']+keys+['created_at'])+') VALUES ('+','.join(['?']*(len(keys)+3))+')',(id,sid)+tuple(v.get(k,'') for k in keys)+(now(),))
                record=dict(db.execute(f'SELECT * FROM {kind} WHERE id=?',(id,)).fetchone())
                if kind=='orders':
                    append_event(db,sid,'site.plan.requested.v1',id,{'site_id':sid,'order_id':id,'report_id':record['report_id'],'scenario_id':record['scenario_id'],'scope':record['scope'],'requested_by':record['requested_by']})
                if kind=='plans':
                    append_event(db,sid,'site.plan.registered.v1',id,{'site_id':sid,'plan_id':id,'order_id':record['order_id'],'report_id':record['report_id'],'status':record['status']})
                db.commit()
                return self.send(201,record)
        except (ValueError,sqlite3.Error,json.JSONDecodeError) as e:self.bad(str(e))

if __name__=='__main__':
    init()
    if BIND not in ('127.0.0.1','localhost','::1') and not TOKEN:
        raise SystemExit('Set EVERCRAFT_SITE_TOKEN before binding to non-loopback interfaces')
    print(f'Evercraft Site Planner at http://{BIND}:{PORT} (data: {DATA})')
    ThreadingHTTPServer((BIND,PORT),Handler).serve_forever()
