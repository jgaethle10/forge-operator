#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from paths import DATA_ROOT, SOURCE_ROOT, COMPILER_ROOT
ROOT=DATA_ROOT
def sha(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()
def load(p): return json.loads(p.read_text()) if p.exists() else None
def norm(v): return ' '.join(str(v or '').upper().replace(',',' ').split())
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--site',type=int,required=True); ap.add_argument('--source-dir',default=str(SOURCE_ROOT)); ap.add_argument('--require-complete',action='store_true'); a=ap.parse_args()
    n=a.site; src=Path(a.source_dir)/f'site_{n:02d}.json'; ident=COMPILER_ROOT/'identity'/f'site_{n:02d}_identity.json'; acq=COMPILER_ROOT/'evidence'/f'site_{n:02d}_acquisition.json'; model=COMPILER_ROOT/'models'/f'site_{n:02d}.json'; geom=COMPILER_ROOT/'geometry'/f'site_{n:02d}.json'
    if not src.exists(): raise SystemExit(f'SOURCE_MISSING:{src}')
    s=load(src); source_sha=sha(src); failures=[]; stale=[]; facts={'source_sha256':source_sha,'source_address':s.get('address'),'installation_mode':s.get('installation_mode'),'charging_stalls':s.get('charging_stalls')}
    if not s.get('address'): failures.append('SOURCE_ADDRESS_MISSING')
    if s.get('installation_mode') not in ('existing_stall_retrofit','proposed_new_build'): failures.append('INSTALLATION_MODE_UNRESOLVED')
    if not s.get('charging_stalls'): failures.append('STALL_COUNT_UNRESOLVED')
    i=load(ident)
    if i:
        if i.get('input_source_sha256')!=source_sha: stale.append('IDENTITY_SOURCE_HASH_STALE')
        if norm(i.get('input_address'))!=norm(s.get('address')): stale.append('IDENTITY_ADDRESS_STALE')
        facts['identity_sha256']=i.get('identity_sha256')
    elif a.require_complete: failures.append('IDENTITY_MISSING')
    q=load(acq)
    if q:
        if q.get('source_record_sha256')!=source_sha: stale.append('ACQUISITION_SOURCE_HASH_STALE')
        if norm(q.get('address'))!=norm(s.get('address')): stale.append('ACQUISITION_ADDRESS_STALE')
        if i and q.get('identity_sha256')!=i.get('identity_sha256'): stale.append('ACQUISITION_IDENTITY_STALE')
    elif a.require_complete: failures.append('ACQUISITION_MISSING')
    m=load(model)
    if m:
        meta=m.get('compiler_meta') or {}
        if meta.get('source_record_sha256')!=source_sha: stale.append('MODEL_SOURCE_HASH_STALE')
        if norm(m.get('address'))!=norm(s.get('address')): stale.append('MODEL_ADDRESS_STALE')
        if q and meta.get('acquisition_receipt_sha256')!=sha(acq): stale.append('MODEL_ACQUISITION_STALE')
        facts['model_sha256']=sha(model)
    elif a.require_complete: failures.append('MODEL_MISSING')
    g=load(geom)
    if g:
        gc=g.get('geometry_compiler') or {}
        if m and gc.get('source_model_sha256')!=sha(model): stale.append('GEOMETRY_MODEL_STALE')
        if norm(g.get('address'))!=norm(s.get('address')): stale.append('GEOMETRY_ADDRESS_STALE')
        facts['geometry_sha256']=sha(geom)
    elif a.require_complete: failures.append('GEOMETRY_MISSING')
    failures.extend(stale)
    rec={'guard_version':'KSS-SITEPLAN-LINEAGE-GUARD-v1','site':n,'source':str(src),'facts':facts,'stale':sorted(set(stale)),'failures':sorted(set(failures)),'pass':not failures}
    print(json.dumps(rec,indent=2))
    if failures: raise SystemExit(2)
if __name__=='__main__': main()
