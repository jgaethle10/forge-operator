#!/usr/bin/env python3
"""Evercraft Photon Forge V2: deterministic offline video canary, never a production master."""
import argparse
import base64
import hashlib
import json
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--output',default=str(root/'photon-forge-v2.mp4'))
parser.add_argument('--width',type=int,default=960)
parser.add_argument('--height',type=int,default=540)
parser.add_argument('--fps',type=int,default=30)
parser.add_argument('--seconds',type=int,default=10)
parser.add_argument('--require-webgl2',action='store_true')
a=parser.parse_args()
if a.width%2 or a.height%2 or a.width<320 or a.height<180 or not 1<=a.fps<=60 or not 1<=a.seconds<=10:
    raise SystemExit('Invalid render dimensions, fps, or duration')
frames=a.fps*a.seconds
source=root/'stage.html'
out=Path(a.output).resolve()
digest=lambda b: hashlib.sha256(b).hexdigest()
started=time.monotonic()
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=[
        '--no-sandbox','--enable-webgl','--ignore-gpu-blocklist',
        '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
    page=browser.new_page(viewport={'width':a.width,'height':a.height},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content(source.read_text(),wait_until='load')
    info=page.evaluate('window.__evercraftStageInfo?.()')
    if not info or errors:
        raise RuntimeError('Stage startup invalid: '+str(errors))
    backend=page.locator('body').get_attribute('data-graphic-backend')
    if a.require_webgl2 and backend!='webgl2':
        raise RuntimeError('GPU rendering required, observed backend: '+str(backend))
    command=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','image2pipe',
             '-vcodec','png','-framerate',str(a.fps),'-i','-','-c:v','libx264',
             '-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-movflags',
             '+faststart','-an',str(out)]
    process=subprocess.Popen(command,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    samples={}
    try:
        for frame in range(frames):
            page.evaluate('([f,fps])=>window.__evercraftRenderFrame(f,fps)',[frame,a.fps])
            if errors:raise RuntimeError('Browser frame error: '+str(errors))
            encoded=page.evaluate('window.__evercraftExportPng()')
            if not encoded.startswith('data:image/png;base64,'):
                raise RuntimeError('Unexpected frame encoding')
            png=base64.b64decode(encoded.partition(',')[2])
            if frame in {0,frames//5,frames//2,3*frames//4,frames-1}:
                samples[str(frame)]={'timeSeconds':frame/a.fps,'pngSha256':digest(png)}
            process.stdin.write(png)
    finally:
        process.stdin.close()
        ffmpeg_errors=process.stderr.read().decode()
        status=process.wait()
        browser.close()
    if status:
        raise RuntimeError('FFmpeg encoding failed: '+ffmpeg_errors[:600])
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames',
    '-show_entries','stream=codec_name,width,height,r_frame_rate,nb_read_frames,codec_type',
    '-show_entries','format=duration','-of','json',str(out)]))
video=[s for s in probe['streams'] if s['codec_type']=='video']
if len(probe['streams'])!=1 or len(video)!=1 or video[0]['codec_name']!='h264' or int(video[0]['nb_read_frames'])!=frames or video[0]['width']!=a.width or video[0]['height']!=a.height:
    raise RuntimeError('Decoded frame validation failed')
receipt={'schema':'evercraft.graphics.photon-forge-export-receipt.v2',
    'status':'rendered_canary_not_mastered','asset':out.name,
    'sha256':digest(out.read_bytes()),'sourceSha256':digest(source.read_bytes()),
    'backend':backend,'width':a.width,'height':a.height,'fps':a.fps,
    'frames':frames,'seconds':a.seconds,'elapsedSec':round(time.monotonic()-started,2),
    'codec':'h264','audio':False,'frameSamples':samples,'synthetic':True,
    'customerReady':False,'publicationAuthority':False,
    'gpuConformanceVerified':False,'worldEngineReplayed':False,
    'humanVisualReviewPassed':False}
out.with_suffix('.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
