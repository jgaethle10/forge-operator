#!/usr/bin/env python3
"""Evercraft shot dailies: real decoded frame comparisons bound to a production jobpack.

A review aid, NOT an aesthetic scorer, renderer, source authenticator or publish gate.
Run exclusively on owned/licensed local media. No network, provider spending or deployment.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCHEMA = 'evercraft.visual-floor.shot-dailies.v2'
JOBPACK_SCHEMA = 'evercraft.graphics-command.production-jobpack.v1'
ORDER_SCHEMA = 'evercraft.visual-floor.work-order.v1'
SAMPLES = (0.15, 0.50, 0.85)


def _sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def _die(code: str):
    raise ValueError('shot_dailies_' + code)


def _probe(path: Path) -> dict:
    obj = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-count_frames', '-show_entries',
        'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames',
        '-show_entries', 'format=duration', '-of', 'json', str(path)
    ], text=True))
    vids = [s for s in obj.get('streams', []) if s.get('codec_type') == 'video']
    if len(vids) != 1:
        _die('exactly_one_video_stream_required')
    v = vids[0]
    try:
        numer, denom = map(int, v['r_frame_rate'].split('/'))
        if not denom or numer <= 0: _die('invalid_frame_rate')
        fps = numer / denom
        count = int(v['nb_read_frames'])
        width, height = int(v['width']), int(v['height'])
        duration = float(obj['format']['duration'])
    except (KeyError, TypeError, ZeroDivisionError, ValueError):
        _die('incomplete_video_probe')
    if count < 3 or width <= 0 or height <= 0 or abs(count / fps - duration) > max(.15, 2/fps):
        _die('video_duration_or_count_invalid')
    return {'fps':fps, 'frameCount':count, 'width':width, 'height':height,
            'durationSec':round(duration, 6), 'codec':v.get('codec_name'),
            'audioPresent':any(s.get('codec_type') == 'audio' for s in obj.get('streams', []))}


def _work_order_and_spans(jobpack: dict, video: dict) -> tuple[dict,list[dict]]:
    if jobpack.get('schema') != JOBPACK_SCHEMA:
        _die('jobpack_schema_invalid')
    floor = jobpack.get('visualFloor')
    order = floor.get('workOrder') if isinstance(floor, dict) else None
    if not isinstance(order, dict) or order.get('schema') != ORDER_SCHEMA:
        _die('visual_floor_work_order_missing')
    if floor.get('publicationAuthority') is not False or order.get('publicationAuthority') is not False:
        _die('publication_authority_unsafe')
    if order.get('assetId') != jobpack.get('campaignId'):
        _die('asset_identity_mismatch')
    # PlanFloor serializes the core without its digest using JS JSON.stringify order.
    # Compatible ordinary JSON integers/strings. Exact published work-order identity.
    claimed=order.get('digest')
    if not isinstance(claimed,str) or len(claimed)!=64 or any(ch not in '0123456789abcdef' for ch in claimed):
        _die('work_order_digest_missing')
    core={key:value for key,value in order.items() if key!='digest'}
    actual=hashlib.sha256(json.dumps(core,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
    if claimed!=actual:_die('work_order_digest_mismatch')
    if len(order.get('beats', [])) < 3:
        _die('insufficient_beats')
    shots = jobpack.get('shots', [])
    beats = order['beats']
    if len(shots) != len(beats) or len({s.get('id') for s in shots}) != len(shots):
        _die('shot_identity_invalid')
    if [s.get('id') for s in shots] != [b.get('id') for b in beats]:
        _die('shot_work_order_identity_mismatch')
    if (jobpack.get('fps') != video['fps'] or jobpack.get('frameCount') != video['frameCount']
        or jobpack.get('resolution', {}).get('width') != video['width']
        or jobpack.get('resolution', {}).get('height') != video['height']):
        _die('jobpack_video_format_mismatch')
    ordered=[]
    cursor=0
    for s,b in zip(shots, beats):
        start, count = s.get('startFrame'), s.get('frameCount')
        if (not isinstance(start,int) or isinstance(start,bool)
            or not isinstance(count,int) or isinstance(count,bool)
            or start!=cursor or count<3 or not b.get('intent') or not b.get('visualProof')):
            _die('gap_overlap_or_missing_intent')
        ordered.append({'id':s['id'],'startFrame':start,'frameCount':count,
                        'intent':b['intent'],'visualProof':b['visualProof']})
        cursor+=count
    if cursor!=video['frameCount']:
        _die('incomplete_video_coverage')
    return order, ordered


def _sample_frame(cap, index: int):
    cap.set(cv2.CAP_PROP_POS_FRAMES,index)
    valid, frame=cap.read()
    if not valid:
        _die('decoded_frame_missing_'+str(index))
    return frame


def _metrics(frame):
    small=cv2.resize(frame,(320,180),interpolation=cv2.INTER_AREA)
    gray=cv2.cvtColor(small,cv2.COLOR_BGR2GRAY)
    bmax=np.max(small,axis=2)
    return {'meanLuma':round(float(gray.mean()/255),4),
            'nearlyBlackFraction':round(float(np.mean(gray<12)),4),
            'nearWhiteChannelFraction':round(float(np.mean(bmax>249)),4),
            'edgesFraction':round(float(np.mean(cv2.Canny(gray,60,140)>0)),4)},gray


def _font(px, bold=False):
    name='/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if bold else '')+'.ttf'
    try:return ImageFont.truetype(name,px)
    except OSError:return ImageFont.load_default()


def audit(video_path: Path, jobpack_path: Path, out_dir: Path, *, max_tile_width=450):
    video_path=video_path.resolve(); jobpack_path=jobpack_path.resolve()
    if not video_path.is_file() or not jobpack_path.is_file():
        _die('source_file_missing')
    video=_probe(video_path)
    jobpack=json.loads(jobpack_path.read_text())
    order, shots=_work_order_and_spans(jobpack,video)
    if max_tile_width < 240 or max_tile_width > 960:
        _die('invalid_tile_width')
    out_dir.mkdir(parents=True,exist_ok=True)
    media_hash=_sha_file(video_path)
    cap=cv2.VideoCapture(str(video_path))
    if not cap.isOpened():_die('cannot_open_decoder')
    # Display is normalized to a fixed visual area, independent of input resolution.
    tile_w=max_tile_width
    tile_h=round(tile_w*video['height']/video['width'])
    tile_h=min(max(tile_h,190),640)
    text_h=132
    header_h=105
    rows=[]
    for shot in shots:
        sample_indices=sorted(set(shot['startFrame']+min(shot['frameCount']-1,max(0,round((shot['frameCount']-1)*pct))) for pct in SAMPLES))
        if len(sample_indices)<3:_die('insufficient_distinct_samples')
        samples=[]; prev=None
        for idx in sample_indices:
            frame=_sample_frame(cap,idx)
            metrics,gray=_metrics(frame)
            delta=None if prev is None else round(float(np.mean(cv2.absdiff(gray,prev))/255),4)
            prev=gray
            thumbnail=cv2.resize(frame,(tile_w,tile_h),interpolation=cv2.INTER_AREA)
            samples.append({'frame':idx,'timeSec':round(idx/video['fps'],4),
                'decodedPixelSha256':hashlib.sha256(frame.tobytes()).hexdigest(),
                'metric':metrics,'interSampleChange':delta,'thumbnail':thumbnail})
        reasons=[]
        if any(s['metric']['nearWhiteChannelFraction']>.32 for s in samples):
            reasons.append('inspect_potentially_clipped_highlights')
        if any(s['metric']['nearlyBlackFraction']>.90 for s in samples):
            reasons.append('inspect_nearly_black_composition')
        if all(s['interSampleChange'] is not None and s['interSampleChange']<.006 for s in samples[1:]):
            reasons.append('inspect_unintended_visual_stillness')
        rows.append({'id':shot['id'],'intent':shot['intent'],'visualProof':shot['visualProof'],
            'startFrame':shot['startFrame'],'frameCount':shot['frameCount'],
            'frames':[{k:v for k,v in s.items() if k!='thumbnail'} for s in samples],
            'reviewFlags':reasons,'_images':[s['thumbnail'] for s in samples]})
    cap.release()
    # Render single review board; save no raw third-party reference frames.
    W=tile_w*3+48; H=header_h+len(rows)*(tile_h+text_h)
    board=Image.new('RGB',(W,H),'#080d15'); draw=ImageDraw.Draw(board)
    big=_font(26,True); mid=_font(17,True); sm=_font(13)
    draw.text((22,15),'EVERCRAFT / VISUAL FLOOR / SHOT DAILIES',font=big,fill='#ecf5ff')
    draw.text((22,58),f'{video["frameCount"]} decoded frames  |  {video["fps"]:g} fps  |  {video["width"]}×{video["height"]}  |  SHA {media_hash[:16]}',font=sm,fill='#88b7dc')
    draw.line((18,91,W-18,91),fill='#274056',width=2)
    for i,row in enumerate(rows):
        y=header_h+i*(tile_h+text_h)
        draw.text((20,y+6),f'{i+1:02d}  {row["id"]}',font=mid,fill='#e8f7ff')
        label=row['intent'].strip().replace('\n',' ')[:125]
        draw.text((20,y+32),label,font=sm,fill='#a1afc4')
        for j,frame in enumerate(row['_images']):
            tile=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB))
            x=16+j*tile_w
            board.paste(tile,(x,y+57))
            stamp=row['frames'][j]
            draw.text((x+8,y+tile_h+60),f'{stamp["timeSec"]:.2f}s | frame {stamp["frame"]}',font=sm,fill='#98b5d0')
        if row['reviewFlags']:
            draw.text((20,y+tile_h+84),('REVIEW: '+', '.join(row['reviewFlags']))[:150],font=sm,fill='#efc18d')
    jpg=out_dir/'shot-dailies.jpg'; board.save(jpg,quality=92,subsampling=0)
    public_rows=[{k:v for k,v in row.items() if k!='_images'} for row in rows]
    core={'schema':SCHEMA,'status':'visual_review_required_not_a_master','input':{
          'mediaSha256':media_hash,'jobpackSha256':_sha_file(jobpack_path),
          'workOrderDigest':order.get('digest'),'campaignId':jobpack['campaignId'],
          'sourceKind':'local_encoded_video'},
          'video':video,'shots':public_rows,'board':{'file':jpg.name,'sha256':_sha_file(jpg)},
          'notes':['Frame metrics are diagnostics only, not creative quality scores',
                  'Human reviewers must inspect actual video and verify provenance independently'],
          'ownerApprovalRequired':True,'customerReady':False,'publicationAuthority':False}
    core['digest']=hashlib.sha256(json.dumps(core,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    receipt=out_dir/'shot-dailies.json'; receipt.write_text(json.dumps(core,indent=2)+'\n')
    return core


def main():
    ap=argparse.ArgumentParser(description='Create owner-review contact board from an exact-frame Graphics Command jobpack and encoded MP4')
    ap.add_argument('--video',required=True,type=Path)
    ap.add_argument('--jobpack',required=True,type=Path)
    ap.add_argument('--out',required=True,type=Path)
    args=ap.parse_args()
    result=audit(args.video,args.jobpack,args.out)
    print(json.dumps({'status':result['status'],'shots':len(result['shots']),
                      'digest':result['digest'],'board':str(args.out/'shot-dailies.jpg')},indent=2))

if __name__=='__main__':main()
