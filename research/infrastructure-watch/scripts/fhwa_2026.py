#!/usr/bin/env python3
"""Evidence-gated FHWA 2026 SNBI bridge importer and separate SQLite index.

2026 JSON is a different schema from the legacy 2025 ArcGIS layer. Never mix them.
Download direct from official per-state URLs discovered from the FHWA index page.
All inspections are historical; this module makes no current danger assertions.
"""
from __future__ import annotations
import argparse
import csv
from datetime import datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
import json
import math
import os
from pathlib import Path
import sqlite3
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

INDEX = 'https://www.fhwa.dot.gov/bridge/nbi/nbi_data_2026.cfm'
PREFIX = 'https://www.fhwa.dot.gov/bridge/nbi/2026/JSON/'
NATIONAL = 624939
FIPS = dict(zip(
    ('Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware',
     'District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
     'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota',
     'Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey',
     'New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon',
     'Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas',
     'Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming',
     'Puerto Rico','U.S. Virgin Islands'),
    ('01','02','04','05','06','08','09','10','11','12','13','15','16','17','18','19',
     '20','21','22','23','24','25','26','27','28','29','30','31','32','33','34',
     '35','36','37','38','39','40','41','42','44','45','46','47','48',
     '49','50','51','53','54','55','56','72','78')))

def utc(): return datetime.now(timezone.utc).isoformat()
def digest(path):
    h=sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(1024*1024), b''):h.update(block)
    return h.hexdigest()
def atomic_json(path,payload):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_name(path.name+'.tmp')
    tmp.write_text(json.dumps(payload,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    os.replace(tmp,path)

def official_get(url,max_bytes=180_000_000):
    parts=urlsplit(url)
    if parts.scheme!='https' or parts.hostname!='www.fhwa.dot.gov':
        raise ValueError('Only official FHWA HTTPS data can be ingested')
    req=Request(url,headers={'User-Agent':'AmericanInfrastructureWatch/0.10 public-data-research'})
    with urlopen(req,timeout=65) as resp:
        if urlsplit(resp.geturl()).hostname!='www.fhwa.dot.gov':
            raise ValueError('Official download redirected outside FHWA')
        chunks=[];total=0
        while True:
            part=resp.read(1024*1024)
            if not part:break
            total+=len(part)
            if total>max_bytes:raise ValueError('FHWA file exceeds configured size limit')
            chunks.append(part)
    return b''.join(chunks)

class StateIndex(HTMLParser):
    def __init__(self):
        super().__init__();self.rows=[];self.row=None;self.cell=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='tr':self.row=[]
        if tag in ('th','td') and self.row is not None:self.cell={'text':'','href':[]}
        if tag=='a' and self.cell is not None and 'href' in a:self.cell['href'].append(a['href'])
    def handle_data(self,data):
        if self.cell is not None:self.cell['text']+=data
    def handle_endtag(self,tag):
        if tag in ('td','th') and self.cell is not None and self.row is not None:
            self.row.append(self.cell);self.cell=None
        if tag=='tr' and self.row is not None:
            if self.row:self.rows.append(self.row)
            self.row=None

def parse_official_index(html, target_state=None):
    """Full national import rejects duplicate links; safe state import quarantines unrelated duplicates."""
    parser=StateIndex();parser.feed(html)
    parsed={}
    for row in parser.rows:
        if len(row)<3:continue
        name=' '.join(row[0]['text'].split()).strip()
        if name not in FIPS:continue
        count_text=row[1]['text'].strip().replace(',','')
        if not count_text.isdigit():raise ValueError(f'No numeric bridge count for {name}')
        links=[urljoin(INDEX,u) for c in row for u in c['href'] if '/2026/JSON/' in urljoin(INDEX,u)]
        links=[u for u in links if u.startswith(PREFIX) and u.endswith('.json')]
        if len(set(links))!=1:raise ValueError(f'Missing or ambiguous official JSON URL: {name}')
        if name in parsed:raise ValueError('Duplicate official state '+name)
        parsed[name]={'count':int(count_text),'url':links[0],'fips':FIPS[name]}
    if set(parsed)!=set(FIPS):raise ValueError('Incomplete 2026 state index: '+str(sorted(set(FIPS)-set(parsed))))
    if sum(x['count'] for x in parsed.values())!=NATIONAL:raise ValueError('2026 official national count mismatch')
    urls=[x['url'] for x in parsed.values()]
    if len(set(urls))!=len(urls):
        if target_state is None:
            raise ValueError('Federal index has duplicate state download links; cannot safely import')
        if target_state not in parsed:
            raise ValueError('Target state missing from official index')
        if urls.count(parsed[target_state]['url'])!=1:
            raise ValueError(f'Federal index download URL for {target_state} is ambiguous; do not import')
        collisions={u:sorted(n for n,x in parsed.items() if x['url']==u)
                    for u in set(urls) if urls.count(u)>1}
        parsed[target_state]['source_index_warning'] = ('Unrelated state URL collision(s) quarantined; '
            + repr(list(collisions.values())) + '; national completeness blocked.')
    return parsed

def load_pinned_counts(csv_path):
    with open(csv_path,newline='',encoding='utf8') as f:rows=list(csv.DictReader(f))
    d={r['area']:int(r['bridges_2026']) for r in rows if r['status']=='reported'}
    if set(d)!=set(FIPS) or sum(d.values())!=NATIONAL:
        raise ValueError('Pinned 2026 state count CSV is incomplete/inconsistent')
    return d

def normalize_state(payload,name,expected):
    if not isinstance(payload,list) or len(payload)!=expected:
        raise ValueError(f'{name}: official file count differs from published count')
    records=[];seen=set();state=FIPS[name]
    for i,r in enumerate(payload):
        if not isinstance(r,dict):raise ValueError(f'{name}: record {i} is not an object')
        sr=str(r.get('BL01')).strip().zfill(2)
        if sr!=state:raise ValueError(f'{name}: record {i} belongs to state {sr}, expected {state}')
        identifier=r.get('BID01')
        if not isinstance(identifier,str) or not identifier.strip():
            raise ValueError(f'{name}: missing bridge identifier at {i}')
        if identifier in seen:raise ValueError(f'{name}: duplicate bridge identifier {identifier}')
        seen.add(identifier)
        lat,lon=r.get('BL05'),r.get('BL06')
        if not (isinstance(lat,(int,float)) and not isinstance(lat,bool) and math.isfinite(lat) and -90<=lat<=90
                and isinstance(lon,(int,float)) and not isinstance(lon,bool) and math.isfinite(lon) and -180<=lon<=180):
            lat=lon=None
        condition=r.get('BC12')
        if condition not in ('G','F','P'):condition='U'
        records.append({'year':2026,'state':name,'state_fips':state,'bridge_id':identifier.strip(),
            'name':str(r.get('BID02') or '').strip(),'latitude':lat,'longitude':lon,
            'condition':condition,'condition_source_field':'BC12',
            'condition_raw':str(r.get('BC12') or ''),'source_url':None,
            'current_danger_verified':False})
    return records

def state_paths(out,state_fips):
    d=Path(out);return d/f'state_{state_fips}_2026.ndjson',d/f'state_{state_fips}_2026.receipt.json'

def import_one(out,name,info,data_fetcher=official_get):
    raw=data_fetcher(info['url'])
    raw_hash=sha256(raw).hexdigest()
    normalized=normalize_state(json.loads(raw),name,info['count'])
    records,receipt=state_paths(out,info['fips'])
    records.parent.mkdir(parents=True,exist_ok=True)
    temp=records.with_name(records.name+'.tmp')
    with temp.open('w',encoding='utf8') as f:
        for r in normalized:
            r['source_url']=info['url'];f.write(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n')
        f.flush();os.fsync(f.fileno())
    os.replace(temp,records)
    atomic_json(receipt,{'state':name,'state_fips':info['fips'],'year':2026,
        'expected':info['count'],'indexed':len(normalized),'source_url':info['url'],
        'raw_sha256':raw_hash,'normalized_sha256':digest(records),'verified':True,
        'imported_at_utc':utc(),'source_index_url':INDEX,
        'source_index_warning':info.get('source_index_warning'),
        'notice':'2026 inspection snapshot. Condition is not an imminent threat warning.'})
    return receipt

def validate_receipts(out,pinned):
    verified={}
    for name in FIPS:
        p,r=state_paths(out,FIPS[name])
        if not p.exists() and not r.exists():continue
        if not p.is_file() or not r.is_file():raise ValueError(f'{name}: incomplete state artifact')
        x=json.loads(r.read_text(encoding='utf8'))
        if x.get('verified') is not True or x.get('state')!=name or x.get('expected')!=pinned[name] or x.get('indexed')!=pinned[name] or x.get('normalized_sha256')!=digest(p):
            raise ValueError(f'{name}: receipt failed verification')
        verified[name]=x
    return verified

def build_index(out,db,pinned):
    receipts=validate_receipts(out,pinned)
    dest=Path(db);dest.parent.mkdir(parents=True,exist_ok=True)
    temp=dest.with_name(dest.name+'.building')
    if temp.exists():temp.unlink()
    con=sqlite3.connect(temp)
    try:
        con.executescript('''CREATE TABLE bridges(state TEXT,state_fips TEXT,bridge_id TEXT,
            name TEXT,latitude REAL,longitude REAL,condition TEXT,condition_raw TEXT,
            source_url TEXT,PRIMARY KEY(state_fips,bridge_id));
            CREATE INDEX idx_condition ON bridges(state_fips,condition);
            CREATE TABLE meta(k TEXT PRIMARY KEY,v TEXT NOT NULL);''')
        total=0
        for name in sorted(receipts):
            path,_=state_paths(out,FIPS[name]);count=0
            with path.open(encoding='utf8') as f:
                batch=[]
                for line in f:
                    r=json.loads(line)
                    if r.get('year')!=2026 or r.get('state')!=name or r.get('state_fips')!=FIPS[name] or r.get('current_danger_verified') is not False:
                        raise ValueError(f'{name}: record provenance invalid')
                    batch.append((name,FIPS[name],r['bridge_id'],r['name'],r['latitude'],r['longitude'],r['condition'],r['condition_raw'],r['source_url']))
                    count+=1
                    if len(batch)>=1000:
                        con.executemany('INSERT INTO bridges VALUES (?,?,?,?,?,?,?,?,?)',batch);batch=[]
                if batch:con.executemany('INSERT INTO bridges VALUES (?,?,?,?,?,?,?,?,?)',batch)
            if count!=pinned[name]:raise ValueError(f'{name}: count drift since verified receipt')
            total+=count
        complete=(len(receipts)==len(FIPS) and total==NATIONAL)
        metadata={'year':2026,'records':total,'expected_national':NATIONAL,
                  'complete_national_import':complete,'partial':not complete,
                  'states_verified':len(receipts),'states_expected':len(FIPS),
                  'missing_states':sorted(set(FIPS)-set(receipts)),
                  'official_index':INDEX,'built_at_utc':utc(),
                  'warning':'Historical FHWA bridge data, not a live safety feed. No current threat declarations.'}
        con.executemany('INSERT INTO meta VALUES (?,?)',[(k,json.dumps(v)) for k,v in metadata.items()]);con.commit()
    except Exception:
        con.close();temp.unlink(missing_ok=True);raise
    con.close();os.replace(temp,dest)
    return metadata

def query(db,state_fips,limit=50):
    if state_fips not in FIPS.values() or not 1<=limit<=250:raise ValueError('Invalid state/limit')
    with sqlite3.connect(db) as con:
        con.row_factory=sqlite3.Row
        rows=[dict(x) for x in con.execute('SELECT * FROM bridges WHERE state_fips=? ORDER BY bridge_id LIMIT ?',(state_fips,limit))]
        meta={k:json.loads(v) for k,v in con.execute('SELECT k,v FROM meta')}
    return {'records':rows,'returned':len(rows),'partial':meta['partial'],'year':2026,
            'notice':'2026 historical condition only. Check current official alerts for danger or closures.'}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='cmd',required=True)
    a=sub.add_parser('sync');a.add_argument('--out',default='data-2026');a.add_argument('--counts',default='fhwa_state_inventory_counts_2025_2026.csv');g=a.add_mutually_exclusive_group(required=True);g.add_argument('--state',choices=sorted(FIPS));g.add_argument('--all',action='store_true')
    a=sub.add_parser('build');a.add_argument('--out',default='data-2026');a.add_argument('--counts',default='fhwa_state_inventory_counts_2025_2026.csv');a.add_argument('--db',default='data-2026/bridges2026.sqlite')
    a=sub.add_parser('query');a.add_argument('--db',default='data-2026/bridges2026.sqlite');a.add_argument('--state-fips',required=True);a.add_argument('--limit',type=int,default=50)
    args=p.parse_args()
    if args.cmd=='query':print(json.dumps(query(args.db,args.state_fips,args.limit),indent=2));return
    pinned=load_pinned_counts(args.counts)
    if args.cmd=='build':print(json.dumps(build_index(args.out,args.db,pinned),indent=2));return
    official=parse_official_index(official_get(INDEX,max_bytes=2_000_000).decode('utf8'),
        target_state=args.state if not args.all else None)
    for name,info in official.items():
        if info['count']!=pinned[name]:raise ValueError(f'Official 2026 index count changed for {name}; re-review pinned counts')
    targets=sorted(FIPS) if args.all else [args.state]
    for name in targets:
        if official[name].get('source_index_warning'):
            print('SOURCE WARNING:',official[name]['source_index_warning'],flush=True)
        receipt=import_one(args.out,name,official[name]);print(name,receipt,flush=True)
    verified=validate_receipts(args.out,pinned)
    print(json.dumps({'verified_state_count':len(verified),
        'expected_state_count':len(FIPS),'complete_national_import':len(verified)==len(FIPS)},indent=2))
if __name__=='__main__':main()
