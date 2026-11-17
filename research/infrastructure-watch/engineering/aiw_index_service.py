#!/usr/bin/env python3
"""American Infrastructure Watch: owned read-only 2026 PNW evidence service.

Builds a durable SQLite index from the EXACT vetted v0.14 standalone
research atlas. This is a derived display snapshot, not an independent
redownload or proof of present bridge safety. No production deployment here.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import sqlite3
from urllib.parse import parse_qs, urlsplit

SOURCE_HTML_SHA256 = 'c29c079d04817f85657fa3e8f7c7ea0b83d6809f5ed2dfb09b592f1e430ed8f4'
SOURCE_URLS = {x: f'https://www.fhwa.dot.gov/bridge/nbi/2026/JSON/{suffix}26.json'
               for x, suffix in [('WA','WA'),('ID','ID'),('OR','OR')]}
RAW_SOURCE_SHA256 = {
    'WA':'c97fb57339f8f7bd9ae82cb807814443fb7cd8bb9fb99c45adc74f2ae3912c79',
    'ID':'e1e0c3c4024ad43e97e8123d9dc8df3db45910d4278ee06000e03fde395a43d7',
    'OR':'773af32721950315adb5b5cb64560ef698d3752dabd7ac7c3d5cc41d631bdcf2',
}
EXPECTED = {
    'WA':{'G':4298,'F':3918,'P':403,'N':0},
    'ID':{'G':1644,'F':2753,'P':248,'N':0},
    'OR':{'G':2470,'F':5426,'P':429,'N':1},
}
# Exactly one source-verified unclassified Oregon record is retained.
OREGON_N_ID = '000013570-00286'
REGION = {
    'WA':(45.5,49.1,-125.0,-116.8),
    'ID':(41.5,49.1,-117.3,-110.8),
    'OR':(41.5,46.35,-125.1,-116.3),
}
FIELDS = ('bridge_id','name','state','condition','county_code','county_name','latitude','longitude','source_url')


def extract_vetted_rows(html_bytes:bytes):
    actual = sha256(html_bytes).hexdigest()
    if actual != SOURCE_HTML_SHA256:
        raise ValueError('Atlas SHA-256 changed; re-verify snapshot against original FHWA receipts before indexing')
    body = html_bytes.decode('utf-8')
    marker='const data='
    if body.count(marker)!=1:
        raise ValueError('Missing or duplicated embedded bridge payload')
    decoder=json.JSONDecoder()
    rows, read = decoder.raw_decode(body[body.index(marker)+len(marker):])
    if not isinstance(rows,list) or not body[body.index(marker)+len(marker)+read:].lstrip().startswith(';'):
        raise ValueError('Unexpected embedded data format')
    expected_total = sum(sum(x.values()) for x in EXPECTED.values())
    if len(rows)!=expected_total:
        raise ValueError('Unexpected nationwide/pilot source record count')
    counts=Counter()
    seen=set()
    normalized=[]
    for position,row in enumerate(rows):
        if not isinstance(row,list) or len(row)!=len(FIELDS):
            raise ValueError(f'Malformed source row {position}')
        bridge_id,name,state,condition,county_code,county_name,lat,lon,url=row
        if state not in EXPECTED or condition not in EXPECTED[state]:
            raise ValueError(f'Unexpected state or condition at row {position}')
        if url!=SOURCE_URLS[state]:
            raise ValueError(f'Source URL mismatch at row {position}')
        if not isinstance(bridge_id,str) or not bridge_id.strip() or (state,bridge_id) in seen:
            raise ValueError(f'Missing/duplicate bridge ID at row {position}')
        seen.add((state,bridge_id))
        if not isinstance(name,str) or not isinstance(county_code,str) or not isinstance(county_name,str):
            raise ValueError('Name/county field type changed')
        if state=='WA':
            if county_code and (len(county_code)!=3 or not county_code.isdigit() or int(county_code) not in range(1,78,2) or not county_name):
                raise ValueError(f'Invalid Washington county code at {bridge_id}')
            if not county_code and county_name:
                raise ValueError('Unassigned county must not be guessed')
        elif county_code or county_name:
            raise ValueError('Idaho/Oregon county not independently verified in this display snapshot')
        if condition=='N' and (state!='OR' or bridge_id!=OREGON_N_ID):
            raise ValueError('Unreviewed unclassified condition record')
        if (lat is None) != (lon is None):
            raise ValueError('Incomplete coordinate pair')
        plottable=lat is not None
        if plottable:
            if (not isinstance(lat,(int,float)) or isinstance(lat,bool) or not math.isfinite(lat)
                or not isinstance(lon,(int,float)) or isinstance(lon,bool) or not math.isfinite(lon)):
                raise ValueError('Invalid coordinate numeric type')
            lowlat,highlat,lowlon,highlon=REGION[state]
            if not (lowlat<=lat<=highlat and lowlon<=lon<=highlon):
                raise ValueError('Outside previously checked geographic bounds')
        counts[(state,condition)]+=1
        normalized.append((state,bridge_id,name,condition,county_code,county_name,lat,lon,
                           'plottable' if plottable else 'review',url))
    for state,ratings in EXPECTED.items():
        for code,expected in ratings.items():
            if counts[(state,code)]!=expected:
                raise ValueError(f'Condition tally mismatch for {state}/{code}')
    wa=[r for r in normalized if r[0]=='WA']
    if sum(not r[4] for r in wa)!=559:
        raise ValueError('Washington unassigned county reconciliation drifted')
    yakima=[r for r in wa if r[4]=='077']
    if len(yakima)!=531 or sum(r[3]=='P' for r in yakima)!=27:
        raise ValueError('Yakima county evidence counts changed')
    if sum(r[8]=='review' for r in normalized)!=4:
        raise ValueError('Prior geographic QA counts changed')
    return normalized


def build_index(source_html,db_path):
    path=Path(source_html)
    raw=path.read_bytes()
    records=extract_vetted_rows(raw)
    dest=Path(db_path)
    dest.parent.mkdir(parents=True,exist_ok=True)
    tmp=dest.with_name(dest.name+'.building')
    tmp.unlink(missing_ok=True)
    conn=sqlite3.connect(tmp)
    try:
        conn.executescript('''
        CREATE TABLE bridges (
          state TEXT NOT NULL,
          bridge_id TEXT NOT NULL,
          name TEXT NOT NULL,
          condition TEXT NOT NULL CHECK(condition IN ('G','F','P','N')),
          county_code TEXT NOT NULL,
          county_name TEXT NOT NULL,
          latitude REAL,
          longitude REAL,
          coordinate_quality TEXT NOT NULL CHECK(coordinate_quality IN ('plottable','review')),
          source_url TEXT NOT NULL,
          PRIMARY KEY(state,bridge_id)
        );
        CREATE INDEX idx_state_condition ON bridges(state,condition);
        CREATE INDEX idx_county_condition ON bridges(state,county_code,condition);
        CREATE TABLE metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
        ''')
        conn.executemany('INSERT INTO bridges VALUES (?,?,?,?,?,?,?,?,?,?)',records)
        counts={state:{c:sum(r[0]==state and r[3]==c for r in records)
                       for c in ('G','F','P','N')} for state in EXPECTED}
        meta={
            'schema':'evercraft.aiw.v015.derived.v1',
            'vintage':2026,
            'built_at_utc':datetime.now(timezone.utc).isoformat(),
            'source_asset':'American Infrastructure Watch v0.14 embedded PNW atlas',
            'source_asset_sha256':sha256(raw).hexdigest(),
            'source_original_fhwa_sha256':RAW_SOURCE_SHA256,
            'source_urls':SOURCE_URLS,
            'raw_records':len(records),
            'official_classified_records':sum(v for m in counts.values() for k,v in m.items() if k!='N'),
            'unclassified_records':sum(x['N'] for x in counts.values()),
            'states':counts,
            'states_verified':['WA','ID','OR'],
            'national_import_complete':False,
            'washington_county_bl02_assigned':8060,
            'washington_county_bl02_unassigned':559,
            'yakima_county_code':'077',
            'yakima_county_records':531,
            'yakima_county_poor_condition':27,
            'source_lineage':'Derived from previously FHWA-reconciled pinned raw downloads; this index does not fetch or independently re-validate new federal updates.',
            'public_safety':'Historical conditions only. Not a current closure, imminent danger, structural safety or route-clearance service.',
            'last_live_emergency_check':None,
            'repair_funding_coverage':'not_linked',
        }
        conn.executemany('INSERT INTO metadata VALUES (?,?)',[(k,json.dumps(v)) for k,v in meta.items()])
        conn.commit()
        actual=conn.execute('SELECT COUNT(*) FROM bridges').fetchone()[0]
        if actual != 21590:
            raise ValueError('SQLite inserted row count changed')
        conn.close()
        os.replace(tmp,dest)
        return meta
    except BaseException:
        conn.close()
        tmp.unlink(missing_ok=True)
        raise


def get_meta(db):
    with sqlite3.connect(f'file:{Path(db).resolve()}?mode=ro',uri=True) as c:
        m={k:json.loads(v) for k,v in c.execute('SELECT key,value FROM metadata')}
        count=c.execute('SELECT COUNT(*) FROM bridges').fetchone()[0]
    if m.get('raw_records')!=count or m.get('national_import_complete') is not False:
        raise ValueError('Index completeness metadata invalid')
    return m


def param(params,key,default=None):
    items=params.get(key)
    if items is None:return default
    if len(items)!=1:raise ValueError(f'{key} must be provided only once')
    return items[0]


def filtered_sql(params):
    state=param(params,'state','')
    county=param(params,'county','')
    condition=param(params,'condition','')
    query=param(params,'q','').strip()
    if state and state not in EXPECTED:raise ValueError('Unknown state')
    if county and (state!='WA' or (county!='unassigned' and (len(county)!=3 or not county.isdigit() or int(county) not in range(1,78,2)))):
        raise ValueError('County filtering requires WA and a valid BL02 code or unassigned')
    if condition and condition not in ('G','F','P','N'):raise ValueError('Unknown condition')
    if len(query)>120:raise ValueError('Search query too long')
    where=[];args=[]
    if state:where.append('state=?');args.append(state)
    if county:where.append('county_code=?');args.append('' if county=='unassigned' else county)
    if condition:where.append('condition=?');args.append(condition)
    if query:
        escaped=query.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')
        where.append("(name LIKE ? ESCAPE '\\' COLLATE NOCASE OR bridge_id LIKE ? ESCAPE '\\' COLLATE NOCASE)")
        args.extend(('%'+escaped+'%','%'+escaped+'%'))
    return ' WHERE '+' AND '.join(where) if where else '',args


def list_bridges(db,params):
    where,args=filtered_sql(params)
    try:
        limit=int(param(params,'limit','50'))
        offset=int(param(params,'offset','0'))
    except (ValueError,TypeError):raise ValueError('Invalid pagination values')
    if not 1<=limit<=250 or not 0<=offset<=100000:raise ValueError('Pagination out of range')
    with sqlite3.connect(f'file:{Path(db).resolve()}?mode=ro',uri=True) as c:
        c.row_factory=sqlite3.Row
        total=c.execute('SELECT COUNT(*) FROM bridges'+where,args).fetchone()[0]
        items=[dict(x) for x in c.execute('SELECT * FROM bridges'+where+' ORDER BY state,bridge_id LIMIT ? OFFSET ?',args+[limit,offset])]
    for x in items:
        x['current_imminent_danger_verified']=None  # None = not checked, NOT 'safe'
        x['condition_is_emergency']=False
    return {'items':items,'total_matching':total,'returned':len(items),'limit':limit,'offset':offset,
            'national_complete':False,'year':2026,'live_alerts_connected':False,
            'evidence_notice':'Historical condition only, not live safety or closure status.'}


def single_bridge(db,params):
    state=param(params,'state');bid=param(params,'id')
    if state not in EXPECTED or not bid or len(bid)>100:raise ValueError('state and valid id are required')
    with sqlite3.connect(f'file:{Path(db).resolve()}?mode=ro',uri=True) as c:
        c.row_factory=sqlite3.Row
        row=c.execute('SELECT * FROM bridges WHERE state=? AND bridge_id=?',(state,bid)).fetchone()
    if row is None:return None
    data=dict(row)
    data['current_imminent_danger_verified']=None
    data['condition_is_emergency']=False
    data['evidence_notice']='Historical inspection condition, not a live safety determination.'
    return data


def handler(db,html):
    class Handler(BaseHTTPRequestHandler):
        def response(self,status,payload):
            raw=json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode('utf8')
            self.send_response(status)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Content-Length',str(len(raw)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.end_headers()
            self.wfile.write(raw)
        def do_GET(self):
            p=urlsplit(self.path)
            try:params=parse_qs(p.query,keep_blank_values=True,strict_parsing=False,max_num_fields=12)
            except ValueError:return self.response(400,{'error':'Invalid query'})
            try:
                if p.path=='/healthz':
                    m=get_meta(db)
                    return self.response(200,{'status':'ready','dataset_rows':m['raw_records'],
                        'national_complete':False,'live_alerts_connected':False})
                if p.path=='/api/v1/coverage':
                    return self.response(200,get_meta(db))
                if p.path=='/api/v1/bridges':
                    return self.response(200,list_bridges(db,params))
                if p.path=='/api/v1/bridge':
                    item=single_bridge(db,params)
                    return self.response(200,item) if item is not None else self.response(404,{'error':'Not found'})
                if p.path in ('/','/atlas','/pnw-2026.html'):
                    # Query strings are client-side deep links (e.g. ?county=077).
                    raw=Path(html).read_bytes()
                    self.send_response(200)
                    self.send_header('Content-Type','text/html; charset=utf-8')
                    self.send_header('Content-Length',str(len(raw)))
                    self.send_header('X-Content-Type-Options','nosniff')
                    self.send_header('Referrer-Policy','no-referrer')
                    self.send_header('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'")
                    self.end_headers();self.wfile.write(raw);return
                return self.response(404,{'error':'Unknown route'})
            except ValueError as e:return self.response(400,{'error':str(e)})
            except Exception:
                self.log_error('Read-only service exception')
                return self.response(503,{'error':'Index unavailable; no coverage or safety claim'})
        def do_POST(self):return self.response(405,{'error':'Read-only service'})
        def do_PUT(self):return self.response(405,{'error':'Read-only service'})
        def do_DELETE(self):return self.response(405,{'error':'Read-only service'})
        def log_message(self,format,*args):
            pass # No user search terms or IP addresses in ordinary service logs
    return Handler


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    subs=ap.add_subparsers(dest='command',required=True)
    build=subs.add_parser('build')
    build.add_argument('--source',required=True)
    build.add_argument('--db',required=True)
    serve=subs.add_parser('serve')
    serve.add_argument('--db',required=True)
    serve.add_argument('--html',required=True)
    serve.add_argument('--host',default='127.0.0.1')
    serve.add_argument('--port',type=int,default=8786)
    audit=subs.add_parser('audit')
    audit.add_argument('--db',required=True)
    args=ap.parse_args()
    if args.command=='build':print(json.dumps(build_index(args.source,args.db),indent=2))
    elif args.command=='audit':print(json.dumps(get_meta(args.db),indent=2))
    else:
        get_meta(args.db)
        if not 0<=args.port<=65535:raise ValueError('Invalid port')
        print('Serving read-only AIW index on',args.host,args.port,flush=True)
        ThreadingHTTPServer((args.host,args.port),handler(args.db,args.html)).serve_forever()
if __name__=='__main__':main()