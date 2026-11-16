#!/usr/bin/env python3
"""Reconcile the one extra 2026 Oregon FHWA JSON record without erasing it.

Official public highway bridge count: 8,325 = G 2,470 + F 5,426 + P 429.
The pinned raw JSON contains 8,326 objects: those 8,325 + exactly one N.
N is preserved as unclassified; it is NOT poor, unsafe, or a live alert.

This exception is intentionally Oregon/2026/source-hash-specific.
The generic source-count-strict importer remains unchanged.
"""
from __future__ import annotations
from collections import Counter
from hashlib import sha256
import json
import math
import os
from pathlib import Path

URL='https://www.fhwa.dot.gov/bridge/nbi/2026/JSON/OR26.json'
SHA='773af32721950315adb5b5cb64560ef698d3752dabd7ac7c3d5cc41d631bdcf2'
OFFICIAL=8325
RAW=8326
COUNTS={'G':2470,'F':5426,'P':429,'N':1}
SOURCE_TABLE='https://www.fhwa.dot.gov/bridge/nbi/no10/condition26.cfm'

def normalize(payload):
    if not isinstance(payload,list) or len(payload)!=RAW:
        raise ValueError('Unexpected Oregon raw count: reconciliation requires exactly 8326 objects')
    seen=set(); conditions=Counter(); records=[]
    for i,row in enumerate(payload):
        if not isinstance(row,dict):raise ValueError(f'Non-object record {i}')
        code=row.get('BL01')
        if isinstance(code,bool) or str(code).strip().zfill(2)!='41':
            raise ValueError(f'Wrong state BL01 at record {i}: {code!r}')
        bid=row.get('BID01')
        if not isinstance(bid,str) or not bid.strip():raise ValueError(f'Missing BID01 at record {i}')
        if bid in seen:raise ValueError(f'Duplicate bridge ID {bid}')
        seen.add(bid)
        condition=row.get('BC12')
        if condition not in COUNTS:raise ValueError(f'Unexpected condition {condition!r} at {bid}')
        conditions[condition]+=1
        lat,lon=row.get('BL05'),row.get('BL06')
        valid=(isinstance(lat,(float,int)) and not isinstance(lat,bool) and
               isinstance(lon,(float,int)) and not isinstance(lon,bool) and
               math.isfinite(lat) and math.isfinite(lon) and
               41.5<=lat<=46.35 and -125.1<=lon<=-116.3)
        records.append({
            'state':'Oregon','state_fips':'41','bridge_id':bid.strip(),
            'name':str(row.get('BID02') or '').strip(),
            'latitude':lat if valid else None,'longitude':lon if valid else None,
            'coordinate_quality':'plottable' if valid else 'review',
            'condition':condition,
            'condition_classified':condition in 'GFP',
            'source_url':URL,'year':2026,
            'current_imminent_danger_verified':False
        })
    if dict(conditions)!=COUNTS:
        raise ValueError(f'Conditions do not reconcile with official 2026 FHWA table: {dict(conditions)}')
    if sum(conditions[c] for c in ('G','F','P'))!=OFFICIAL:
        raise ValueError('Reported rated bridge count mismatch')
    return records

def process(raw:bytes,dest):
    digest=sha256(raw).hexdigest()
    if digest!=SHA:raise ValueError('FHWA raw file changed; do not use old Oregon-specific exception')
    records=normalize(json.loads(raw))
    out=Path(dest);out.mkdir(parents=True,exist_ok=True)
    filepath=out/'oregon_2026_reconciled.ndjson'
    temp=filepath.with_suffix('.tmp')
    with temp.open('w',encoding='utf8') as f:
        for record in records:f.write(json.dumps(record,separators=(',',':'))+'\n')
        f.flush();os.fsync(f.fileno())
    os.replace(temp,filepath)
    extra=[r for r in records if r['condition']=='N']
    audit={'schema':'evercraft.aiw.or_2026_reconciliation.v1',
        'source_url':URL,'source_sha256':digest,'source_summary_url':SOURCE_TABLE,
        'state':'Oregon','year':2026,'raw_records':len(records),
        'official_classified_total':OFFICIAL,'conditions':dict(Counter(r['condition'] for r in records)),
        'unclassified_N_records':[{'bridge_id':r['bridge_id'],'name':r['name'],
                                   'coordinate_quality':r['coordinate_quality']} for r in extra],
        'plottable':sum(r['coordinate_quality']=='plottable' for r in records),
        'coordinate_review':sum(r['coordinate_quality']=='review' for r in records),
        'verified_source_and_counts':True,'national_import_complete':False,
        'important':'The one N record is preserved but not counted in 8,325 FHWA Good/Fair/Poor total. No safety inference.'}
    (out/'oregon_2026_reconciliation_audit.json').write_text(json.dumps(audit,indent=2)+'\n')
    return audit

def main():
    import argparse
    from urllib.request import Request,urlopen
    p=argparse.ArgumentParser();p.add_argument('--out',required=True)
    p.add_argument('--input',help='Locally saved raw 2026 OR26.json')
    a=p.parse_args()
    if a.input:raw=Path(a.input).read_bytes()
    else:
        req=Request(URL,headers={'User-Agent':'EvercraftAIW/0.14 source-reconciliation'})
        with urlopen(req,timeout=75) as res:
            if res.geturl()!=URL:raise ValueError('Unsafe URL redirect')
            raw=res.read(180_000_001)
            if len(raw)>180_000_000:raise ValueError('Source exceeds safety limit')
    audit=process(raw,a.out);print(json.dumps(audit,indent=2))
if __name__=='__main__':main()
