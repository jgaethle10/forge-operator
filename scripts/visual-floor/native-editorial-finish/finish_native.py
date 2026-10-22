#!/usr/bin/env python3
"""Owned cinematic editorial layer for native World Engine review footage.

Outputs a sourced, labeled *finishing preview*, not a native-resolution GPU film,
verified customer result, or owner-approved commercial. No network/assets.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W,H,FPS=1280,720,24
SCHEMA='evercraft.cinema.native-editorial-finish.v1'
BEATS=(('DISCOVER','Find the signal.'),('CONNECT','See the relationships.'),('UNDERSTAND','Make complexity navigable.'))

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for c in iter(lambda:f.read(1<<20),b''):h.update(c)
    return h.hexdigest()

def font(size, medium=False):
    candidates=(['/usr/share/fonts/truetype/clear-sans/ClearSans-Bold.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if medium else ['/usr/share/fonts/truetype/clear-sans/ClearSans-Regular.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'])
    for path in candidates:
        if Path(path).exists(): return ImageFont.truetype(path,size)
    return ImageFont.load_default()

def smooth(x):
    t=max(0.0,min(1.0,x))
    return t*t*(3-2*t)

def render_frame(bgr,index,count):
    time=index/FPS
    beat=min(2,int(index/(count/3)))
    local=(index-beat*count/3)/(count/3)
    # Editorial layer works on real, decoded World Engine frames.
    frame=cv2.resize(bgr,(W,H),interpolation=cv2.INTER_LANCZOS4).astype(np.float32)
    frame=cv2.convertScaleAbs(frame,alpha=1.05,beta=3).astype(np.float32)
    xx=np.linspace(0,1,W,dtype=np.float32)[None,:,None]
    yy=np.linspace(0,1,H,dtype=np.float32)[:,None,None]
    # Black-fade only under the typography; do not pretend additional 3D detail.
    mask=(.65*np.maximum(0,1-xx/.50)**1.2+.14*np.maximum(0,(yy-.55)/.45))
    frame=frame*(1-mask)
    cold=np.array([24,12,7],dtype=np.float32)[None,None,:]
    frame=np.clip(frame+cold*(.30+.18*yy),0,255).astype(np.uint8)
    img=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB),'RGB')
    dr=ImageDraw.Draw(img,'RGBA')
    # Top: brand + machine truth, not fabricated product UI.
    dr.rounded_rectangle([34,28,59,53],radius=4,fill=(105,224,247,240))
    dr.line([(41,46),(52,35)],fill=(12,32,50,255),width=4)
    dr.text((75,27),'EVERCRAFT',font=font(24,True),fill=(246,250,255,255))
    dr.text((79,65),'WORLD ENGINE   /   CINEMATIC SYSTEMS',font=font(12),fill=(141,170,189,255))
    dr.line([(34,104),(W-35,104)],fill=(145,190,212,64),width=1)
    dr.text((W-312,43),'ORIGINAL GPU SCENE  ·  24 FPS',font=font(13),fill=(156,203,220,255))
    # Deliberate three-part cinematic language. Horizontal signal builds when
    # text enters and retracts on each cut, rather than random glowing particles.
    entry=smooth(local*6)
    fade=min(1.0, max(0.0, (1-local)*8))
    amt=entry*fade
    ox=int((1-entry)*-38)
    dr.text((42+ox,141),f'0{beat+1} / 03',font=font(18,True),fill=(95,219,241,int(245*amt)))
    dr.line([(42,179),(42+int(50*amt),179)],fill=(100,219,244,int(200*amt)),width=3)
    dr.text((39+ox,194),BEATS[beat][0],font=font(66,True),fill=(244,249,255,int(250*amt)))
    dr.text((43+ox,273),BEATS[beat][1],font=font(19),fill=(191,214,226,int(220*amt)))
    # The hero node must remain visible; keep informational UI in outer bands.
    dr.line([(34,596),(W-34,596)],fill=(171,210,218,80),width=1)
    dr.text((40,614),'DATA CONSTELLATION',font=font(16,True),fill=(223,241,248,245))
    dr.text((40,644),'A visual study of connections and complexity',font=font(13),fill=(137,172,186,240))
    dr.text((850,615),'SYNTHETIC DATA  /  VISUAL R&D',font=font(15,True),fill=(158,201,217,235))
    dr.text((850,644),'NOT CUSTOMER EVIDENCE  ·  NOT PUBLISHED',font=font(12),fill=(113,152,171,218))
    # Timeline: distinct story beats and actual elapsed position.
    left,right=40,W-40
    for i in range(3):
        x1=left+i*(right-left)/3+4
        x2=left+(i+1)*(right-left)/3-10
        dr.rounded_rectangle([x1,687,x2,691],radius=1,fill=(70,110,134,130))
        prog=min(1,max(0,(index-i*count/3)/(count/3)))
        if prog>0:
            dr.rounded_rectangle([x1,687,x1+(x2-x1)*prog,691],radius=1,fill=(109,225,240,236))
    return np.asarray(img)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--video',type=Path,required=True)
    ap.add_argument('--out',type=Path,required=True)
    ap.add_argument('--receipt',type=Path,required=True)
    args=ap.parse_args()
    if not args.video.is_file():raise SystemExit('source_video_missing')
    cap=cv2.VideoCapture(str(args.video))
    count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT));fps=cap.get(cv2.CAP_PROP_FPS)
    if count!=96 or abs(fps-24)>0.01:raise SystemExit('source_native_canary_contract_invalid')
    args.out.parent.mkdir(parents=True,exist_ok=True)
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24',
         '-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','-','-an','-c:v','libx264',
         '-preset','veryfast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(args.out)]
    enc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    samples=[]
    for i in range(count):
        ok,frame=cap.read()
        if not ok:raise SystemExit('decoded_gpu_frame_missing')
        img=render_frame(frame,i,count)
        if i in (8,43,86):samples.append(hashlib.sha256(img.tobytes()).hexdigest())
        enc.stdin.write(img.tobytes())
    enc.stdin.close();err=enc.stderr.read();ret=enc.wait();cap.release()
    if ret!=0:raise SystemExit(f'encode_failure:{err.decode()[-500:]}')
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames',
          '-show_entries','stream=codec_type,codec_name,width,height,nb_read_frames',
          '-of','json',str(args.out)],text=True))
    v=[s for s in probe['streams'] if s['codec_type']=='video']
    if len(v)!=1 or v[0]['codec_name']!='h264' or v[0]['width']!=W or v[0]['height']!=H or int(v[0]['nb_read_frames'])!=96 or any(s['codec_type']=='audio' for s in probe['streams']):raise SystemExit('encoded_preview_integrity_failed')
    report={'schema':SCHEMA,'sourceSha256':sha(args.video),'previewSha256':sha(args.out),'sourceNativeResolution':'640x360','editorialOutputResolution':f'{W}x{H}',
            'sourceWasResampled':True,'trueNativeHdClaim':False,'outputCodec':'h264','fps':FPS,'decodedFrames':count,
            'sampleHashes':samples,'beats':[{'id':v[0].lower(),'caption':v[1]} for v in BEATS],
            'syntheticData':True,'audioPresent':False,'customerReady':False,'publicationAuthority':False,
            'creativeReviewRequired':True,'note':'Source-native GPU scene plus editorial typography, not new 3D geometric detail.'}
    args.receipt.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'output':str(args.out),'sha256':report['previewSha256'],'frames':count,'publicationAuthority':False}))
if __name__=='__main__':main()

