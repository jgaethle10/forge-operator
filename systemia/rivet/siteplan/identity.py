import argparse, hashlib, json, math, os, re, urllib.parse, urllib.request
from pathlib import Path

from paths import DATA_ROOT, SOURCE_ROOT, COMPILER_ROOT
ROOT=DATA_ROOT
DEFAULT_SRC=Path(os.getenv('KSS_IDENTITY_SOURCE_ROOT', str(SOURCE_ROOT)))
OUT=COMPILER_ROOT/'identity'
OUT.mkdir(parents=True, exist_ok=True)
UA='Evercraft-KSS-RIVET/2.0 identity-normalizer'

ROANOKE_ADDRESS='https://gis03.roanokeva.gov/arcgis/rest/services/Public/Addresses/FeatureServer/0/query'
ROANOKE_PARCEL='https://gis03.roanokeva.gov/arcgis/rest/services/Public/Parcels/FeatureServer/0/query'

SUFFIXES={'ST','STREET','AVE','AVENUE','RD','ROAD','DR','DRIVE','BLVD','BOULEVARD','PKWY','PARKWAY','LN','LANE','WAY','CT','COURT','CIR','CIRCLE','HWY','HIGHWAY'}
DIRS={'N','S','E','W','NE','NW','SE','SW','NORTH','SOUTH','EAST','WEST'}

def get_json(url, params, timeout=20):
    req=urllib.request.Request(url+'?'+urllib.parse.urlencode(params),headers={'User-Agent':UA,'Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return json.load(r)

def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()

def sha_file(p):
    return sha_bytes(Path(p).read_bytes())

def haversine_m(lon1,lat1,lon2,lat2):
    R=6371008.8
    p1,p2=math.radians(lat1),math.radians(lat2)
    dp=math.radians(lat2-lat1); dl=math.radians(lon2-lon1)
    a=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(min(1,math.sqrt(a)))

def parse_street(addr):
    first=(addr or '').split(',')[0].strip()
    m=re.match(r'^\s*(\d+)\s+(.+?)\s*$',first)
    if not m: return None,None
    num=int(m.group(1)); toks=m.group(2).upper().replace('.','').split()
    while toks and toks[-1] in DIRS: toks.pop()
    while toks and toks[-1] in SUFFIXES: toks.pop()
    while toks and toks[-1] in DIRS: toks.pop()
    return num,' '.join(toks)

def choose_address(features,current_lon,current_lat):
    if not features: return None
    def score(f):
        a=f.get('attributes') or {}; g=f.get('geometry') or {}
        status=0 if str(a.get('STATUS','')).upper()=='ACTIVE' else 10000
        verified=0 if 'FIELD VERIFIED' in str(a.get('VERIFIED','')).upper() else 500
        if current_lon is not None and current_lat is not None and 'x' in g and 'y' in g:
            dist=haversine_m(float(current_lon),float(current_lat),float(g['x']),float(g['y']))
        else: dist=0
        return status+verified+dist
    return min(features,key=score)

def normalize_roanoke(d):
    num,street=parse_street(d.get('address'))
    if num is None or not street:
        raise RuntimeError('ROANOKE_ADDRESS_PARSE_FAILED')
    where=f"STR_NUM = {num} AND UPPER(STR_NAME) = '{street.replace(chr(39),chr(39)*2)}'"
    ad=get_json(ROANOKE_ADDRESS,{
        'f':'json','where':where,
        'outFields':'FULL_NAME,STATUS,TAX_ID,VERIFIED,ZIP,CITY,STATE',
        'returnGeometry':'true','outSR':'4326'
    })
    if ad.get('error'): raise RuntimeError('ROANOKE_ADDRESS_QUERY_ERROR:'+json.dumps(ad['error'],sort_keys=True))
    chosen=choose_address(ad.get('features') or [],d.get('lon'),d.get('lat'))
    if not chosen: raise RuntimeError('ROANOKE_ADDRESS_NOT_FOUND')
    a=chosen.get('attributes') or {}; g=chosen.get('geometry') or {}
    taxid=str(a.get('TAX_ID') or '').strip()
    if not taxid: raise RuntimeError('ROANOKE_TAXID_MISSING')
    pd=get_json(ROANOKE_PARCEL,{
        'f':'geojson','where':f"TAXID='{taxid.replace(chr(39),chr(39)*2)}'",
        'outFields':'TAXID,OWNER,ASSOCNAME','returnGeometry':'true','outSR':'4326'
    })
    if pd.get('error'): raise RuntimeError('ROANOKE_PARCEL_QUERY_ERROR:'+json.dumps(pd['error'],sort_keys=True))
    pfs=pd.get('features') or []
    if len(pfs)!=1: raise RuntimeError(f'ROANOKE_PARCEL_CARDINALITY:{len(pfs)}')
    pf=pfs[0]; props=pf.get('properties') or {}
    canonical=', '.join(filter(None,[str(a.get('FULL_NAME') or '').strip().title(),str(a.get('CITY') or 'Roanoke').title(),str(a.get('STATE') or 'VA').upper()+' '+str(a.get('ZIP') or '').strip()]))
    lon=float(g['x']); lat=float(g['y'])
    input_zip=str(d.get('postal_code') or re.search(r'\b\d{5}\b',d.get('address','')).group(0) if re.search(r'\b\d{5}\b',d.get('address','')) else '')
    input_parcel=str(d.get('parcel_id') or '').strip()
    contradictions=[]
    if input_zip and input_zip != str(a.get('ZIP') or '').strip(): contradictions.append({'type':'ZIP_MISMATCH','input':input_zip,'official':str(a.get('ZIP') or '').strip()})
    if input_parcel and input_parcel.replace('-','') != taxid.replace('-',''): contradictions.append({'type':'PARCEL_ID_MISMATCH','input':input_parcel,'official':taxid})
    if d.get('lon') is not None and d.get('lat') is not None:
        dm=haversine_m(float(d['lon']),float(d['lat']),lon,lat)
        if dm>20: contradictions.append({'type':'POINT_SHIFT_GT_20M','meters':round(dm,2),'input':[d['lon'],d['lat']],'official':[lon,lat]})
    return {
        'authority':'City of Roanoke Public Addresses + Parcels',
        'authority_rank':'primary',
        'address_status':a.get('STATUS'),
        'address_verified':a.get('VERIFIED'),
        'canonical_address':canonical,
        'official_full_name':a.get('FULL_NAME'),
        'city':a.get('CITY') or 'ROANOKE',
        'state':a.get('STATE') or 'VA',
        'postal_code':str(a.get('ZIP') or ''),
        'official_lon':lon,'official_lat':lat,
        'tax_id':taxid,
        'parcel_owner':props.get('OWNER'),
        'parcel_geometry_geojson':pf.get('geometry'),
        'contradictions':contradictions
    }

def normalize(n,src_root):
    src=Path(src_root)/f'site_{n:02d}.json'
    if not src.exists(): raise RuntimeError(f'SOURCE_MISSING:{src}')
    d=json.load(open(src))
    locality=(d.get('city') or '').strip().lower()
    addr=(d.get('address') or '').lower()
    if locality=='roanoke' or ', roanoke,' in addr:
        result=normalize_roanoke(d)
        adapter='roanoke-v1'
    else:
        result={
          'authority':'canonical source record; locality-specific official adapter not configured',
          'authority_rank':'bounded',
          'canonical_address':d.get('address'),
          'official_lon':d.get('lon'),'official_lat':d.get('lat'),
          'tax_id':d.get('parcel_id'),
          'contradictions':[]
        }
        adapter='canonical-bounded-v1'
    receipt={
      'compiler_version':'KSS-SITEPLAN-COMPILER-v2',
      'identity_version':'KSS-SITE-IDENTITY-v2',
      'site':n,
      'input_source':str(src),
      'input_source_sha256':sha_file(src),
      'input_address':d.get('address'),
      'adapter':adapter,
      'normalized':result,
      'passed':not any(x.get('type') in {'ROANOKE_ADDRESS_NOT_FOUND'} for x in result.get('contradictions',[]))
    }
    raw=json.dumps(receipt,sort_keys=True,separators=(',',':')).encode()
    receipt['identity_sha256']=sha_bytes(raw)
    out=OUT/f'site_{n:02d}_identity.json'
    out.write_text(json.dumps(receipt,indent=2))
    print('IDENTITY',n,'adapter',adapter,'canonical',result.get('canonical_address'),'tax',result.get('tax_id'),'contradictions',result.get('contradictions'),'sha',receipt['identity_sha256'])
    return receipt

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--sites',nargs='+',type=int,required=True)
    ap.add_argument('--source-root',default=str(DEFAULT_SRC))
    a=ap.parse_args()
    for n in a.sites: normalize(n,a.source_root)

if __name__=='__main__': main()