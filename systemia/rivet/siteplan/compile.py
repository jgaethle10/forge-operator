import argparse,json,hashlib,copy,os,math,urllib.parse,urllib.request
from pathlib import Path
from paths import DATA_ROOT, SOURCE_ROOT, COMPILER_ROOT, IDENTITY_ROOT, AERIAL_CACHE_ROOT
ROOT=DATA_ROOT; SRC=Path(os.getenv('RIVET_SITEPLAN_SOURCE_ROOT', str(SOURCE_ROOT))); IDENT=IDENTITY_ROOT; EVID=COMPILER_ROOT/'evidence'; REDEV=EVID/'redevelopment'; MODELS=COMPILER_ROOT/'models'; MODELS.mkdir(parents=True,exist_ok=True); AERIAL_CACHE_ROOT.mkdir(parents=True,exist_ok=True)

def sha(p):
 h=hashlib.sha256();
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()

def state(value,source=None,kind='source-derived',limit=None):
 return {'state':kind,'present':value is not None,'source':source,'limit':limit}

NAIP_ENDPOINT='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage'
USER_AGENT='Evercraft-RIVET-SitePlan/1.0'


def _xy_pairs(value):
 if isinstance(value,(list,tuple)):
  if len(value)>=2 and isinstance(value[0],(int,float)) and isinstance(value[1],(int,float)):
   yield float(value[0]),float(value[1])
  else:
   for item in value:
    yield from _xy_pairs(item)

def local_bounds(d):
 pts=list(_xy_pairs(((d.get('parcel') or {}).get('coordinates') or [])))
 if not pts: raise RuntimeError('PARCEL_COORDINATES_MISSING')
 xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
 return min(xs),min(ys),max(xs),max(ys)

def local_to_lonlat(d,x,y):
 lat0=float(d['lat']); lon0=float(d['lon'])
 lat=lat0+float(y)/111320.0
 lon=lon0+float(x)/(111320.0*max(.2,math.cos(math.radians(lat0))))
 return lon,lat

def aerial_bounds(d,area=False):
 minx,miny,maxx,maxy=local_bounds(d)
 span=max(maxx-minx,maxy-miny)
 pad=max(60.0 if area else 15.0,span*(1.25 if area else .18))
 a=local_to_lonlat(d,minx-pad,miny-pad); b=local_to_lonlat(d,maxx+pad,maxy+pad)
 return min(a[0],b[0]),min(a[1],b[1]),max(a[0],b[0]),max(a[1],b[1])

def aerial_fingerprint(site,source_sha,identity_sha,bounds,key,size):
 payload={'site':site,'source_sha256':source_sha,'identity_sha256':identity_sha,'bounds':[round(float(v),8) for v in bounds],'key':key,'size':[int(size[0]),int(size[1])],'source':'USGSNAIPImagery/ImageServer'}
 return hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:20]

def fetch_naip(site,source_sha,identity_sha,bounds,key,size=(1800,1400),offline=False):
 fp=aerial_fingerprint(site,source_sha,identity_sha,bounds,key,size)
 cache=AERIAL_CACHE_ROOT/f'naip_site_{site:02d}_{key}_{fp}.jpg'
 if cache.exists() and cache.stat().st_size>10000: return cache,'cache'
 if offline: raise RuntimeError(f'OFFLINE_AERIAL_CACHE_MISS site={site} key={key} fingerprint={fp}')
 params={'bbox':','.join(str(v) for v in bounds),'bboxSR':'4326','imageSR':'4326','size':f'{int(size[0])},{int(size[1])}','format':'jpg','f':'image'}
 req=urllib.request.Request(NAIP_ENDPOINT+'?'+urllib.parse.urlencode(params),headers={'User-Agent':USER_AGENT,'Accept':'image/jpeg'})
 with urllib.request.urlopen(req,timeout=45) as resp: data=resp.read()
 if len(data)<10000 or not data.startswith(b'\xff\xd8'): raise RuntimeError(f'NAIP_FETCH_INVALID site={site} key={key} bytes={len(data)}')
 cache.write_bytes(data)
 return cache,'network'

def acquisition_current(n,src,identity):
 receipt=EVID/f'site_{n:02d}_acquisition.json'
 if not receipt.exists(): return False
 try: a=json.loads(receipt.read_text())
 except Exception: return False
 if a.get('source_record_sha256')!=sha(src): return False
 if a.get('identity_sha256')!=identity.get('identity_sha256'): return False
 aerials=a.get('aerials') or {}
 for key in ('plan','area'):
  row=aerials.get(key) or {}
  p=Path(row.get('path','')) if isinstance(row,dict) else Path(str(row or ''))
  if not p.exists() or p.stat().st_size<=10000: return False
 return True

def acquire_site(n,offline=False,force=False):
 src=SRC/f'site_{n:02d}.json'; ident=IDENT/f'site_{n:02d}_identity.json'
 if not src.exists(): raise RuntimeError(f'SOURCE_MISSING:{src}')
 if not ident.exists(): raise RuntimeError(f'IDENTITY_RECEIPT_MISSING:{ident}')
 d=json.loads(src.read_text()); identity=json.loads(ident.read_text())
 source_sha=sha(src)
 if identity.get('input_source_sha256')!=source_sha: raise RuntimeError(f'IDENTITY_SOURCE_HASH_MISMATCH site={n}')
 if not force and acquisition_current(n,src,identity):
  return json.loads((EVID/f'site_{n:02d}_acquisition.json').read_text())
 identity_sha=identity.get('identity_sha256')
 if not identity_sha: raise RuntimeError(f'IDENTITY_HASH_MISSING site={n}')
 plan_bounds=aerial_bounds(d,False); area_bounds=aerial_bounds(d,True)
 plan,plan_mode=fetch_naip(n,source_sha,identity_sha,plan_bounds,'plan',offline=offline)
 area,area_mode=fetch_naip(n,source_sha,identity_sha,area_bounds,'area',offline=offline)
 rec={
  'compiler_version':'EVERCRAFT-RIVET-SITEPLAN-v1','site':n,'address':d.get('address'),
  'source_record':str(src),'source_record_sha256':source_sha,
  'identity_receipt':str(ident),'identity_sha256':identity_sha,
  'aerials':{
   'plan':{'path':str(plan),'sha256':sha(plan),'bytes':plan.stat().st_size,'bounds':plan_bounds,'source':'USGS/USDA NAIP via The National Map','mode':plan_mode},
   'area':{'path':str(area),'sha256':sha(area),'bytes':area.stat().st_size,'bounds':area_bounds,'source':'USGS/USDA NAIP via The National Map','mode':area_mode}
  },
  'acquisition_complete':True,'external_delivery_authorized':False
 }
 out=EVID/f'site_{n:02d}_acquisition.json'; out.write_text(json.dumps(rec,indent=2)+'\n')
 print('ACQUIRED',n,plan_mode,area_mode,'sha',sha(out))
 return rec

def compile_site(n):
 src=SRC/f'site_{n:02d}.json'; acq=EVID/f'site_{n:02d}_acquisition.json'
 if not acq.exists(): raise RuntimeError(f'acquisition receipt missing for site {n}')
 d=json.load(open(src)); a=json.load(open(acq)); out=copy.deepcopy(d)
 redev_path=REDEV/f'site_{n:02d}.json'
 redevelopment=json.load(open(redev_path)) if redev_path.exists() else None
 counts=d.get('feature_counts') or {}
 evidence={
  'parcel':state(d.get('parcel'), 'canonical RIVET site record','source-derived','Public GIS parcel, not boundary survey'),
  'buildings':state(int(counts.get('building',0) or 0), 'canonical normalized features','source-derived','Source-derived mapping evidence'),
  'roads':state(d.get('road_names') or [], 'canonical normalized features','source-derived','Named road geometry/context'),
  'parking_context':state(d.get('parking_context_evidence') or int(counts.get('parking',0) or 0), 'mapped parking and/or cached NAIP','source-derived','Preliminary parking/access context only'),
  'aerial_plan':state(a['aerials']['plan'],'USGS/USDA NAIP','source-derived','Orthophoto context, not survey'),
  'aerial_area':state(a['aerials']['area'],'USGS/USDA NAIP','source-derived','Orthophoto context, not survey'),
  'ev_zone':state(d.get('ev_zone'),'KSS geometry compiler','proposed','Conceptual EV layout'),
  'access_route':state(d.get('access_route'),'KSS geometry compiler','proposed','Conceptual path, final ADA design verify'),
  'trench_route':state(d.get('trench_route'),'KSS geometry compiler','proposed','Concept route only, not utility locate/approval'),
  'redevelopment_context':state(redevelopment, str(redev_path) if redevelopment else None, 'source-derived' if redevelopment else 'not-flagged','If planned/active redevelopment supersedes current conditions, verified future surface is required before geometry')
 }
 required=['parcel','buildings','roads','parking_context','aerial_plan','aerial_area','ev_zone','trench_route']
 failures=[k for k in required if not evidence[k]['present']]
 if redevelopment and redevelopment.get('classification') in ('planned_redevelopment','active_redevelopment') and redevelopment.get('surface_state')!='verified':
  failures.append('DEVELOPMENT_SURFACE_UNRESOLVED')
 out['compiler_meta']={
   'compiler_version':'KSS-SITEPLAN-COMPILER-v2',
   'source_record_sha256':sha(src),'acquisition_receipt_sha256':sha(acq),
   'identity_sha256':a.get('identity_sha256'),'identity_receipt':a.get('identity_receipt'),
   'stall_count':int(d.get('charging_stalls') or 6),
   'stall_count_basis':d.get('charging_stalls_basis') or 'modeled fit-study default',
   'redevelopment_context':redevelopment,
   'typed_evidence':evidence,'compile_failures':failures,'frozen':True
 }
 dst=MODELS/f'site_{n:02d}.json'; dst.write_text(json.dumps(out,indent=2)); print('COMPILED',n,'failures',failures,'sha',sha(dst))
 if failures: raise RuntimeError(f'site {n} compile failures: {failures}')
 return dst

ap=argparse.ArgumentParser(); ap.add_argument('--sites',nargs='+',type=int,required=True); args=ap.parse_args()
for n in args.sites: compile_site(n)