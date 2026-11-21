#!/usr/bin/env python3
"""Fallen: source-verified editor selects from genuine HumanFilter extension recordings.

Source pixels only. No fake UI, narrative audio, generated people or release authority.
The fixture feed is fictional: never present it as a naturally occurring social post.
"""
import argparse, hashlib, json, pathlib, subprocess

SHOTS=[
 ('01_actual_toggle_enable','popup',1.50,3.35,(0,0,378,672)),
 ('02_ai_disclosure_softens','feed',.75,3.30,(140,0,810,1440)),
 ('03_strict_mode_selected','popup',4.65,6.55,(0,0,378,672)),
 ('04_keyword_entry','popup',6.45,9.10,(0,0,378,672)),
 ('05_multiple_sample_posts_softened','feed',4.10,7.45,(140,0,810,1440)),
 ('06_show_once_reveal','feed',7.25,9.25,(140,0,810,1440)),
]
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for data in iter(lambda:f.read(1024*1024),b''):h.update(data)
 return h.hexdigest()
def probe(p):
 return json.loads(subprocess.check_output(['ffprobe','-v','quiet','-print_format','json','-show_streams','-show_format',str(p)]))
def run():
 ap=argparse.ArgumentParser()
 ap.add_argument('--capture-dir',required=True,type=pathlib.Path)
 ap.add_argument('--out',required=True,type=pathlib.Path)
 a=ap.parse_args()
 capture=json.loads((a.capture_dir/'source-capture-receipt.json').read_text())
 assert capture['footage_type']=='CONTROLLED_DEMONSTRATION_NOT_LIVE_SOCIAL_FEED'
 assert capture['real_extension_installed'] and capture['native_controls_used']
 assert len(capture['test_actions'])==4 and all(x['passed'] for x in capture['test_actions'])
 assert capture['approved_for_publish'] is False
 sources={'feed':a.capture_dir/'authentic-extension-feed.mp4','popup':a.capture_dir/'authentic-extension-popup.mp4'}
 expected={row['name']:row['sha256'] for row in capture['assets']}
 for key,p in sources.items():
  assert p.is_file() and sha(p)==expected[p.name], 'unverified_source_digest:'+key
  v=[s for s in probe(p)['streams'] if s['codec_type']=='video']
  assert len(v)==1 and (int(v[0]['width']),int(v[0]['height']))==(1080,1920)
 a.out.mkdir(parents=True,exist_ok=True)
 rows=[]
 for name,key,start,end,(x,y,w,h) in SHOTS:
  p=sources[key]
  duration=float(probe(p)['format']['duration'])
  assert end<duration, 'unverified_timing:'+name
  assert w*1920==h*1080
  dest=a.out/(name+'.mp4')
  vf=f'crop={w}:{h}:{x}:{y},scale=1080:1920:flags=lanczos,setsar=1,fps=25,format=yuv420p'
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(start),
    '-t',str(end-start),'-i',str(p),'-vf',vf,'-an','-c:v','libx264',
    '-preset','medium','-crf','18','-movflags','+faststart',str(dest)],check=True)
  info=probe(dest); v=[s for s in info['streams'] if s['codec_type']=='video']
  assert len(v)==1 and v[0]['codec_name']=='h264'
  assert (int(v[0]['width']),int(v[0]['height']))==(1080,1920)
  assert abs(float(info['format']['duration'])-(end-start))<.12
  rows.append({'id':name,'file':dest.name,'sha256':sha(dest),'source':p.name,
      'source_sha256':sha(p),'in_sec':start,'out_sec':end,'crop_xywh':[x,y,w,h],
      'source_label':'controlled_fictional_sample_feed' if key=='feed' else 'real_extension_popup',
      'publish_authority':False,'owner_creative_approval':False})
 receipt={'schema':'evercraft.fallen.humanfilter.editor-selects.v1',
  'status':'EDITOR_SELECTS_ONLY_NOT_A_COMMERCIAL',
  'actual_extension_verified':True,
  'samples_are_fictional':True,
  'face_and_live_action_coverage':False,'bella_voice_included':False,
  'music_included':False,'publication_authority':False,'clips':rows}
 (a.out/'selects-provenance.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps({'status':receipt['status'],'count':len(rows),'out':str(a.out)}))
if __name__=='__main__':run()
