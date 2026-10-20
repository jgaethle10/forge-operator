#!/usr/bin/env python3
"""Fallen observational-action diagnostic: optical motion after approximate camera compensation.
This is NOT footage authentication, an aesthetic judgment, or a publication gate.
"""
import argparse
import hashlib
import json
from pathlib import Path
import cv2
import numpy as np

cv2.setNumThreads(2)
MIN_TRACKS=18
RESIDUAL_PIXELS=2.7
MIN_INDEPENDENT_FRACTION=.09

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):
            h.update(chunk)
    return h.hexdigest()

def view(frame):
    h,w=frame.shape[:2]
    picture=frame[int(h*.085):int(h*.915),int(w*.035):int(w*.965)]
    return cv2.resize(cv2.cvtColor(picture,cv2.COLOR_BGR2GRAY),(640,360),interpolation=cv2.INTER_AREA)

def motion_pair(frame_a,frame_b):
    a,b=view(frame_a),view(frame_b)
    corners=cv2.goodFeaturesToTrack(a,maxCorners=360,qualityLevel=.011,minDistance=5,blockSize=7)
    if corners is None or len(corners)<MIN_TRACKS:
        return dict(status='insufficient_features',tracks=0,independentFraction=None,medianResidualPixels=None)
    tracked,status,_=cv2.calcOpticalFlowPyrLK(a,b,corners,None,winSize=(21,21),maxLevel=2,criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,25,.03))
    if tracked is None or status is None:
        return dict(status='optical_flow_failed',tracks=0,independentFraction=None,medianResidualPixels=None)
    valid=status.reshape(-1)==1
    before=corners.reshape(-1,2)[valid]
    after=tracked.reshape(-1,2)[valid]
    if len(before)<MIN_TRACKS:
        return dict(status='insufficient_tracks',tracks=len(before),independentFraction=None,medianResidualPixels=None)
    transform,inliers=cv2.estimateAffinePartial2D(before,after,method=cv2.RANSAC,ransacReprojThreshold=2.2,maxIters=2000,confidence=.995)
    if transform is None:
        return dict(status='camera_model_failed',tracks=len(before),independentFraction=None,medianResidualPixels=None)
    projection=before@transform[:,:2].T+transform[:,2]
    residual=np.linalg.norm(after-projection,axis=1)
    fraction=float(np.mean(residual>RESIDUAL_PIXELS))
    return dict(status='measured',tracks=int(len(before)),independentFraction=round(fraction,4),medianResidualPixels=round(float(np.median(residual)),3),p90ResidualPixels=round(float(np.percentile(residual,90)),3),cameraInlierFraction=round(float(np.mean(inliers)),4) if inliers is not None else None)

def evaluate(video_path,manifest,sample_pairs=3):
    video_path=Path(video_path)
    if not video_path.is_file():
        raise ValueError('video_missing')
    if manifest.get('schema')!='evercraft.fallen.observational-motion-input.v1':
        raise ValueError('motion_schema_invalid')
    shots=manifest.get('shots')
    if not isinstance(shots,list) or not shots:
        raise ValueError('motion_shots_missing')
    cap=cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError('video_decode_unavailable')
    try:
        fps=cap.get(cv2.CAP_PROP_FPS)
        count=cap.get(cv2.CAP_PROP_FRAME_COUNT)
        if fps<=0 or count<=0:
            raise ValueError('video_timebase_invalid')
        end=count/fps
        schedule=[];needed=set();ids=set();results=[];failures=[]
        for shot in shots:
            sid=shot.get('id');start=shot.get('startSec');dur=shot.get('durationSec')
            if not isinstance(sid,str) or not sid or sid in ids:
                raise ValueError('shot_id_invalid_or_duplicate')
            ids.add(sid)
            if not isinstance(start,(int,float)) or not isinstance(dur,(int,float)) or start<0 or dur<1.2 or start+dur>end+.03:
                raise ValueError('shot_timing_invalid:'+sid)
            if type(shot.get('requiresIndependentMotion')) is not bool:
                raise ValueError('shot_action_intent_missing:'+sid)
            centers=np.linspace(start+max(.32,dur*.22),start+dur-max(.32,dur*.22),num=sample_pairs)
            gap=min(.42,max(.23,dur*.13))
            pairs=[]
            for center in centers:
                ta=max(start+.12,float(center)-gap/2)
                tb=min(start+dur-.12,float(center)+gap/2)
                if tb-ta<.16:
                    continue
                a=int(round(ta*fps));b=int(round(tb*fps))
                pairs.append((a,b));needed.update((a,b))
            schedule.append((shot,pairs))
        if not needed:
            raise ValueError('no_valid_frame_samples')
        # A monotonic decode is much faster than repeatedly seeking H.264.
        frames={}
        for index in range(max(needed)+1):
            ok,frame=cap.read()
            if not ok:
                raise ValueError('video_frame_unreadable_at:'+str(index))
            if index in needed:
                frames[index]=frame
        for shot,pairs in schedule:
            readings=[motion_pair(frames[a],frames[b]) for a,b in pairs]
            measured=[r for r in readings if r['status']=='measured']
            hits=sum(r['independentFraction']>=MIN_INDEPENDENT_FRACTION and r['tracks']>=MIN_TRACKS for r in measured)
            observed=bool(len(measured)>=2 and hits>len(measured)/2)
            if shot['requiresIndependentMotion'] and not observed:
                failures.append('independent_motion_not_observed:'+shot['id'])
            results.append(dict(id=shot['id'],requiresIndependentMotion=shot['requiresIndependentMotion'],measuredPairs=len(measured),independentlyMovingPairs=hits,independentMotionObserved=observed,readings=readings))
        return dict(schema='evercraft.fallen.observational-motion-report.v1',status='rejected' if failures else 'diagnostic_accepted',videoSha256=sha(video_path),videoDurationSec=round(float(end),3),fps=round(float(fps),3),failures=failures,shots=results,boundaries=dict(cameraCompensationApproximate=True,actualPhysicalActionNotProven=True,sourceAuthenticityNotProven=True,rightsNotVerified=True,storyQualityNotVerified=True,publicationAuthorityGranted=False))
    finally:
        cap.release()

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('video');p.add_argument('manifest');p.add_argument('report')
    a=p.parse_args()
    result=evaluate(a.video,json.loads(Path(a.manifest).read_text()))
    Path(a.report).parent.mkdir(parents=True,exist_ok=True)
    Path(a.report).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(dict(status=result['status'],failures=result['failures'],videoSha256=result['videoSha256'])))
    raise SystemExit(1 if result['status']=='rejected' else 0)
