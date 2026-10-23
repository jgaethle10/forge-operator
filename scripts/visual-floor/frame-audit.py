#!/usr/bin/env python3
"""Sample actual decoded pixels. Flags require human review, not an invented 'beauty score'."""
import argparse
import hashlib
import json
from pathlib import Path
import cv2
import numpy as np

def audit(file,samples=20):
    file=Path(file).resolve()
    if not file.is_file():raise ValueError('missing_media')
    digest=hashlib.sha256(file.read_bytes()).hexdigest()
    cap=cv2.VideoCapture(str(file))
    total=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total<1:raise ValueError('empty_media')
    points=sorted(set(np.linspace(0,total-1,num=min(samples,total),dtype=int).tolist()))
    rows=[];previous=None
    for ix in points:
        cap.set(cv2.CAP_PROP_POS_FRAMES,ix)
        ok,frame=cap.read()
        if not ok:raise ValueError('unreadable_frame:'+str(ix))
        small=cv2.resize(frame,(320,180),interpolation=cv2.INTER_AREA)
        gray=cv2.cvtColor(small,cv2.COLOR_BGR2GRAY)
        difference=None if previous is None else float(np.mean(cv2.absdiff(gray,previous))/255)
        rows.append({
            'frame':ix,'meanLuma':round(float(gray.mean()/255),4),
            'blackPixelFraction':round(float(np.mean(gray<14)),4),
            'highlightPixelFraction':round(float(np.mean(np.max(small,axis=2)>248)),4),
            'edgeFraction':round(float(np.mean(cv2.Canny(gray,60,140)>0)),4),
            'normalizedInterSampleChange':None if difference is None else round(difference,4),
            'sampledFramePixelSha256':hashlib.sha256(frame.tobytes()).hexdigest()
        })
        previous=gray
    cap.release()
    flags=[]
    if max(x['highlightPixelFraction'] for x in rows)>.28:flags.append('inspect_possible_highlight_clipping')
    if sum(x['normalizedInterSampleChange'] is not None and x['normalizedInterSampleChange']<.003 for x in rows)>=len(rows)*.85:flags.append('inspect_low_visible_motion')
    if sum(x['blackPixelFraction']>.97 for x in rows)>len(rows)*.55:flags.append('inspect_long_near_black_sections')
    return {'schema':'evercraft.visual-floor.frame-evidence.v1',
        'sourceType':'decoded_video_samples','mediaSha256':digest,
        'sampleCount':len(rows),'frameCountObserved':total,'samples':rows,'diagnostics':flags,
        'method':'OpenCV actual video decode; normalized 320x180 pixel signals, not aesthetic acceptance',
        'publicationAuthority':False,'manualReviewRequired':True}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('video');p.add_argument('--output');p.add_argument('--samples',type=int,default=20);a=p.parse_args()
    report=audit(a.video,a.samples)
    output=json.dumps(report,indent=2)+'\n'
    if a.output:Path(a.output).write_text(output)
    print(output)
