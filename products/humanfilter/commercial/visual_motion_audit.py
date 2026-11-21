#!/usr/bin/env python3
"""Objective visual-motion screening for Fallen source clips (not an aesthetic score).

Detects excessive near-identical frames in video. Never grants publication rights
or creative approval; static hero shots can be deliberate and need human review.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

WIDTH, HEIGHT, FPS = 64, 114, 4
FRAME_BYTES = WIDTH * HEIGHT
LOW_ACTIVITY_THRESHOLD = 0.004


def audit(path):
    path = Path(path).resolve()
    assert path.is_file(), str(path)
    ffprobe = subprocess.run([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height',
        '-of', 'json', str(path)
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    meta = json.loads(ffprobe.stdout)
    duration = float(meta['format']['duration'])
    assert 0 < duration <= 1800
    assert len([s for s in meta['streams'] if s.get('codec_type') == 'video']) == 1
    ffmpeg = subprocess.run([
        'ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', str(path),
        '-map', '0:v:0', '-vf', f'fps={FPS},scale={WIDTH}:{HEIGHT}:flags=area,format=gray',
        '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    raw = ffmpeg.stdout
    assert len(raw) >= FRAME_BYTES*2 and len(raw)%FRAME_BYTES==0
    count = len(raw)//FRAME_BYTES
    changes = []
    longest_low_run = 0
    current_run = 0
    for i in range(1, count):
        a = raw[(i-1)*FRAME_BYTES:i*FRAME_BYTES]
        b = raw[i*FRAME_BYTES:(i+1)*FRAME_BYTES]
        delta = sum(abs(x-y) for x, y in zip(a,b))/(FRAME_BYTES*255)
        changes.append(delta)
        if delta < LOW_ACTIVITY_THRESHOLD:
            current_run += 1
            longest_low_run = max(longest_low_run, current_run)
        else:
            current_run = 0
    sorted_deltas = sorted(changes)
    low_fraction = sum(d < LOW_ACTIVITY_THRESHOLD for d in changes)/len(changes)
    high_fraction = sum(d > 0.025 for d in changes)/len(changes)
    moving = sum(changes)/len(changes)
    report = {
        'schema': 'evercraft.fallen.visual-motion-screen.v1',
        'input': path.name,
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'duration_seconds': round(duration,3),
        'sample_rate_fps':FPS,
        'samples':len(changes)+1,
        'mean_frame_difference':round(moving,5),
        'median_frame_difference':round(sorted_deltas[len(changes)//2],5),
        'low_activity_fraction':round(low_fraction,3),
        'high_activity_fraction':round(high_fraction,3),
        'longest_low_activity_run_seconds':round(longest_low_run/FPS,2),
        'status':'STATIC_HEAVY_REVIEW_REQUIRED' if low_fraction>0.75 else 'MOTION_SCREEN_NO_STATIC_HEAVY_FLAG',
        'boundaries':{
            'objective_luma_only':True,
            'neither_cinematography_nor_authenticity_verified':True,
            'human_director_review_required':True,
            'no_publish_authority':True,
        },
    }
    return report

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('inputs', nargs='+')
    p.add_argument('--out', help='Save JSON audit alongside console output')
    args = p.parse_args()
    result = {'schema':'evercraft.fallen.visual-motion-comparison.v1','reports':[audit(x) for x in args.inputs]}
    payload=json.dumps(result, indent=2)+'\n'
    if args.out: Path(args.out).write_text(payload,encoding='utf8')
    print(payload)