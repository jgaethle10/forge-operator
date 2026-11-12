#!/usr/bin/env python3
"""FHWA 2026 Washington county evidence extraction.

BL02 is the FHWA county code (3-digit FIPS); it is not estimated from coordinates.
No condition or coordinate from these historical inspection data is an emergency alert.
"""
import argparse
import csv
from collections import Counter, defaultdict
from hashlib import sha256
import io
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen

WA_URL="https://www.fhwa.dot.gov/bridge/nbi/2026/JSON/WA26.json"
EXPECTED_SHA256="c97fb57339f8f7bd9ae82cb807814443fb7cd8bb9fb99c45adc74f2ae3912c79"
EXPECTED_COUNT=8619
EXPECTED_CONDITION={'G':4298,'F':3918,'P':403}
COUNTIES=list(zip(
 ("Adams","Asotin","Benton","Chelan","Clallam","Clark","Columbia","Cowlitz","Douglas",
 "Ferry","Franklin","Garfield","Grant","Grays Harbor","Island","Jefferson","King",
 "Kitsap","Kittitas","Klickitat","Lewis","Lincoln","Mason","Okanogan","Pacific",
 "Pend Oreille","Pierce","San Juan","Skagit","Skamania","Snohomish","Spokane",
 "Stevens","Thurston","Wahkiakum","Walla Walla","Whatcom","Whitman","Yakima"),
 (f'{n:03d}' for n in range(1,78,2))))
COUNTY_BY_FIPS=dict((fips,name) for name,fips in COUNTIES)

def county(raw):
    """No geographic inference; invalid or missing FHWA BL02 is unassigned."""
    if isinstance(raw,bool) or raw is None: return None
    try:
        s=str(int(raw)).zfill(3)
        if isinstance(raw,str) and not raw.strip().isdigit():return None
    except (TypeError,ValueError):return None
    return s if s in COUNTY_BY_FIPS else None

def normalize(payload):
    if not isinstance(payload,list) or len(payload)!=EXPECTED_COUNT:
        raise ValueError('Official 2026 Washington record count mismatch')
    rows=[];seen=set();condition=Counter()
    for i,x in enumerate(payload):
        if not isinstance(x,dict) or str(x.get('BL01')).zfill(2)!='53':
            raise ValueError(f'Wrong state at record {i}')
        bid=x.get('BID01')
        if not isinstance(bid,str) or not bid.strip():
            raise ValueError(f'Missing bridge ID at record {i}')
        if bid in seen:raise ValueError(f'Duplicate bridge ID {bid}')
        seen.add(bid)
        c=x.get('BC12')
        if c not in ('G','F','P'):c='U'
        condition[c]+=1
        code=county(x.get('BL02'))
        lat,lon=x.get('BL05'),x.get('BL06')
        in_wa=(isinstance(lat,(int,float)) and not isinstance(lat,bool)
               and isinstance(lon,(int,float)) and not isinstance(lon,bool)
               and 45.5<=lat<=49.1 and -125<=lon<=-116.8)
        rows.append({
            'bridge_id':bid.strip(),
            'name':str(x.get('BID02') or '').strip(),
            'county_code':code or '',
            'county_name':COUNTY_BY_FIPS.get(code,'Unassigned'),
            'county_source_field':'BL02',
            'condition':c,'condition_source_field':'BC12',
            'latitude':lat if in_wa else '',
            'longitude':lon if in_wa else '',
            'location_quality':'plottable' if in_wa else 'review',
            'source_url':WA_URL,
            'source_year':2026,
        })
    if dict(condition)!=EXPECTED_CONDITION:
        raise ValueError(f'Washington condition totals differ from FHWA published totals: {dict(condition)}')
    return rows

def summary(rows,source_hash):
    total=len(rows)
    counties=defaultdict(lambda:Counter())
    for r in rows:counties[r['county_code'] or 'unassigned'][r['condition']]+=1
    county_rows=[]
    for fips,name in COUNTIES:
        c=counties[fips]
        county_rows.append({'county_code':fips,'county_name':name,'total':sum(c.values()),
             'good':c['G'],'fair':c['F'],'poor':c['P'],'unclassified':c['U']})
    other=counties['unassigned']
    if other:
        county_rows.append({'county_code':'','county_name':'Unassigned','total':sum(other.values()),
            'good':other['G'],'fair':other['F'],'poor':other['P'],'unclassified':other['U']})
    assert sum(x['total'] for x in county_rows)==total
    return {
      'schema':'evercraft.aiw.wa_county_audit.v1','source_year':2026,
      'source_url':WA_URL,'source_sha256':source_hash,
      'bridge_records':total,'county_field':'BL02',
      'county_assignment':'FHWA coded county, not derived geographic position',
      'assigned':sum(1 for r in rows if r['county_code']),
      'unassigned':sum(1 for r in rows if not r['county_code']),
      'plottable':sum(1 for r in rows if r['location_quality']=='plottable'),
      'county_rows':county_rows,
      'safety':'Historic condition, not evidence of current or imminent danger.'
    }

def write_outputs(raw,dest):
    actual=sha256(raw).hexdigest()
    if actual!=EXPECTED_SHA256:
        raise ValueError('FHWA file changed since verified Washington 2026 import; review new SHA before importing')
    parsed=json.loads(raw)
    rows=normalize(parsed)
    stats=summary(rows,actual)
    dest=Path(dest);dest.mkdir(parents=True,exist_ok=True)
    with (dest/'wa_2026_county_bridges.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    with (dest/'wa_2026_county_summary.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=list(stats['county_rows'][0]));w.writeheader();w.writerows(stats['county_rows'])
    (dest/'wa_2026_county_audit.json').write_text(json.dumps(stats,indent=2)+'\n')
    return stats

def download():
    req=Request(WA_URL,headers={'User-Agent':'Evercraft-Infrastructure-Watch/0.13 public-research'})
    with urlopen(req,timeout=75) as r:
        if r.geturl()!=WA_URL:raise ValueError('Unexpected redirect from FHWA source')
        raw=r.read(20_000_000+1)
        if len(raw)>20_000_000:raise ValueError('Refusing unexpectedly large FHWA payload')
        return raw

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--input',help='Locally saved official WA JSON file; required if not downloading')
    p.add_argument('--out',required=True)
    a=p.parse_args()
    raw=Path(a.input).read_bytes() if a.input else download()
    result=write_outputs(raw,a.out)
    print(json.dumps({k:v for k,v in result.items() if k!='county_rows'},indent=2))
    print('Yakima County:',next(x for x in result['county_rows'] if x['county_name']=='Yakima'))
