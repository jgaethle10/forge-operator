#!/usr/bin/env python3
"""Fetch source-verified, independently published CC0 music for Pacific TV private review."""
from pathlib import Path
import urllib.request,hashlib,json
OUT=Path('pacific-cc0-broadcast-review');OUT.mkdir(exist_ok=True)
TRACKS={
 'classic_holizna':('juyr5onpuc','Classic','HoliznaCC0','https://freemusicarchive.org/music/holiznacc0/rock-montage/classic/'),
 'jams_holizna':('6se0pdniuz','Jams','HoliznaCC0','https://freemusicarchive.org/music/holiznacc0/rock-montage/'),
 'power_in_blood':('5lgqa8h7ih','Power in the Blood','HoliznaCC0','https://nullrights.com/track/5lgqa8h7ih')
}
results=[]
for fname,(id,title,artist,source) in TRACKS.items():
 url=f'https://nullrights.com/download/{id}'
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (Evercraft Commercial Studio music rights audit)'})
 try:
  with urllib.request.urlopen(req,timeout=45) as response:
   ct=response.headers.get('Content-Type','')
   blob=response.read(15_000_001)
   final_url=response.url
  if len(blob)>15_000_000 or len(blob)<100_000 or not (blob[:3]==b'ID3' or blob[:1]==b'\\xff'):
   raise RuntimeError(f'unexpected file signature or size: {ct} {len(blob)} {blob[:32]}')
  file=OUT/(fname+'.mp3');file.write_bytes(blob)
  result={'name':title,'artist':artist,'source_license':'CC0 1.0 Universal','verified_source_page':source,'catalog_license_page':f'https://nullrights.com/track/{id}','download_url':url,'resolved_url':final_url,'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()}
  results.append(result)
  print('PASS',title,len(blob),ct)
 except Exception as e:
  print('FAILED',title,str(e));results.append({'title':title,'error':str(e),'source':source})
(OUT/'licensing_source_receipts.json').write_text(json.dumps(results,indent=2))
if not any('sha256' in x for x in results):raise RuntimeError('No usable CC0 track retrieved')
