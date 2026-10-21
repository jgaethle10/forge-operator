#!/usr/bin/env python3
"""A recorded Steinway pilot, not a synth or commercial master."""
from __future__ import annotations
import argparse, hashlib, json, math, urllib.parse, urllib.request
from pathlib import Path
import numpy as np
import soundfile as sf

SAMPLE_PAGE='https://theremin.music.uiowa.edu/MISPiano.html'
RIGHTS_PAGE='https://theremin.music.uiowa.edu/MIS.html'
BASE='https://theremin.music.uiowa.edu/sound%20files/MIS/Piano_Other/piano/'
FS=44100
DURATION=29.0
# hand-composed, no four-chord loops. Each entry: second, note, recorded layer, gain, keydown, pan
EVENTS=[
 (.38,'E4','pp',.48,1.12,-.11),(1.88,'G4','pp',.46,1.13,.10),
 (3.28,'A4','pp',.42,.65,-.04),(4.22,'Gb4','pp',.43,1.36,.09),
 (6.14,'E4','pp',.45,1.65,-.08),
 (7.55,'C4','pp',.22,2.15,-.24),(7.73,'G4','pp',.20,1.90,.19),
 (9.20,'B4','mf',.29,.67,-.03),(10.00,'A4','mf',.31,.68,.04),
 (10.90,'G4','mf',.38,1.60,-.08),
 (11.75,'E3','pp',.27,2.10,-.29),(11.89,'B3','pp',.18,1.70,.23),
 (13.38,'E4','pp',.38,.85,-.10),(14.68,'Gb4','pp',.33,1.10,.06),
 (15.74,'B4','mf',.37,.78,-.02),(16.70,'D5','mf',.38,1.25,.11),
 (18.50,'E3','pp',.26,1.90,-.24),(18.68,'B3','pp',.15,1.80,.20),
 (19.14,'C5','mf',.32,1.02,-.03),(20.36,'B4','pp',.34,1.05,.04),
 (21.73,'A4','pp',.32,.98,-.10),(23.18,'G4','pp',.39,1.16,.07),
 (24.51,'E4','pp',.47,3.20,-.03),(24.38,'E3','pp',.24,3.00,-.28),
 (24.57,'B3','pp',.18,2.75,.23),
]
def sha256(file):
 h=hashlib.sha256()
 with Path(file).open('rb') as f:
  while part:=f.read(1024*1024): h.update(part)
 return h.hexdigest()
def sample_url(dynamic,pitch):
 if dynamic not in ('pp','mf') or not pitch.replace('b','').isalnum():
  raise ValueError('sample_identity_not_admitted')
 return BASE+urllib.parse.quote(f'Piano.{dynamic}.{pitch}.aiff')
def fetch_one(dynamic,pitch,root):
 filename=f'Piano.{dynamic}.{pitch}.aiff';file=root/filename
 if not file.exists():
  req=urllib.request.Request(sample_url(dynamic,pitch),headers={'User-Agent':'Evercraft-Internal-Research/1.0'})
  with urllib.request.urlopen(req,timeout=45) as response:
   if response.status!=200:raise RuntimeError('sample_download_non_200')
   blob=response.read(18*1024*1024+1)
  if len(blob)>18*1024*1024 or len(blob)<50000:raise RuntimeError('sample_size_outside_bounds')
  file.write_bytes(blob)
 audio,sr=sf.read(file,dtype='float32',always_2d=True)
 if sr!=FS or audio.shape[1]!=2 or len(audio)<FS*.5:raise RuntimeError('recording_format_invalid:'+filename)
 if not np.isfinite(audio).all() or np.max(np.abs(audio))>.99999:raise RuntimeError('recording_amplitude_invalid:'+filename)
 return file,audio
def render(samples,events=EVENTS,duration=DURATION):
 if not 1<=duration<=120:raise ValueError('duration_invalid')
 out=np.zeros((int(FS*duration),2),dtype=np.float32);used=[]
 for start,pitch,layer,gain,held,pan in events:
  if not (0<=start<duration and .05<=held<=5 and 0<=gain<=1 and -1<=pan<=1):
   raise ValueError('event_invalid')
  audio=samples[(layer,pitch)] # Fail closed, no oscillator substitute for absent recordings
  offset=int(round(start*FS));available=min(len(audio),len(out)-offset,int((held+.95)*FS))
  if available<=0:continue
  env=np.ones(available,dtype=np.float32);release=int(held*FS)
  if release<available:
   t=np.arange(available-release,dtype=np.float32)/FS
   env[release:]=np.exp(-4.8*t)
  attack=min(132,available)
  env[:attack]*=np.sin(np.linspace(0,np.pi/2,attack,dtype=np.float32))
  left=math.sqrt((1-pan)/2)*1.4142;right=math.sqrt((1+pan)/2)*1.4142
  out[offset:offset+available,0]+=audio[:available,0]*gain*left*env
  out[offset:offset+available,1]+=audio[:available,1]*gain*right*env
  used.append({'start_seconds':start,'pitch':pitch,'layer':layer,'gain':gain,'held_seconds':held})
 peak=float(np.max(np.abs(out)))
 if peak<1e-5:raise RuntimeError('recorded_performance_below_minimum_signal')
 # Gain-only recording normalization; never add a compressor or limiter.
 safety=.72/peak
 if safety>16:raise RuntimeError('recorded_performance_requires_excessive_gain')
 out*=safety
 fade=min(int(.25*FS),len(out)//8)
 out[-fade:]*=np.linspace(1,0,fade,dtype=np.float32)[:,None]
 return out,{'events':used,'peak_before_safety':round(peak,6),
             'safety_gain':round(safety,6),'peak_after':round(float(np.max(np.abs(out))),6)}
def build(out_dir,source_dir):
 out_dir.mkdir(parents=True,exist_ok=True);source_dir.mkdir(parents=True,exist_ok=True)
 sources={};receipts=[]
 for layer,pitch in sorted({(e[2],e[1]) for e in EVENTS}):
  file,audio=fetch_one(layer,pitch,source_dir)
  sources[(layer,pitch)]=audio
  receipts.append({'sample':file.name,'url':sample_url(layer,pitch),'sha256':sha256(file),
                  'bytes':file.stat().st_size,'frames':len(audio),'sample_rate':FS})
  print('source',file.name,sha256(file)[:12],flush=True)
 output=out_dir/'Evercraft_Iowa_Recorded_Steinway_Pilot.wav'
 pcm,info=render(sources)
 sf.write(output,pcm,FS,subtype='PCM_24')
 receipt={'schema':'evercraft.internal.recorded-steinway-pilot.v1',
  'title':'A Door Left Open (recorded-piano study)',
  'origin':'University of Iowa Electronic Music Studios Musical Instrument Samples',
  'sample_page':SAMPLE_PAGE,'rights_page':RIGHTS_PAGE,
  'instrument':'Steinway & Sons Model B','recorded_performer':'Evan Mazunik',
  'source_audio_owned_by_evercraft':False,'music_release_approved':False,
  'human_listening_accepted':False,'not_a_commercial_master':True,
  'composition':'new authored 25-event piano-only note arrangement',
  'source_receipts':receipts,'render':info,'output_sha256':sha256(output),
  'output_bytes':output.stat().st_size,'sample_rate':FS,'duration_seconds':DURATION}
 (out_dir/'recording-custody.json').write_text(json.dumps(receipt,indent=2)+'\n')
 (out_dir/'LISTEN_FIRST.txt').write_text(
  'Genuine Iowa recorded Steinway study. Original score, no TimGM6mb, no synthetic strings.\n'
  'Internal listening only. Compare to rejected demo. Source credit and hashes: recording-custody.json.\n'
  'Human approval: NOT GIVEN.\n')
 print('output',output,'sha256',receipt['output_sha256'])
def main():
 p=argparse.ArgumentParser()
 p.add_argument('--out',required=True,type=Path)
 p.add_argument('--source-cache',required=True,type=Path)
 args=p.parse_args()
 build(args.out,args.source_cache)
if __name__=='__main__':main()
