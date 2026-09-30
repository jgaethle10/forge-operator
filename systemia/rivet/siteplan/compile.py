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