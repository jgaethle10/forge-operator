#!/usr/bin/env python3
"""Evercraft Aqua strict live-action editorial pipeline.

No AI/still/CGI substitutions. All sources require manually verified provenance,
license and SHA256. Shot substitutions require a new reviewed manifest. Renders
only after five video files are supplied and independently verified.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def run(cmd):
    return subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def safe_source(root: Path, relative: str) -> Path:
    if Path(relative).is_absolute() or '..' in Path(relative).parts or not relative.startswith('assets/'):
        raise ValueError(f'Invalid source path {relative!r}')
    source = (root / relative).resolve()
    if not source.is_relative_to((root / 'assets').resolve()):
        raise ValueError('Source path escapes assets folder')
    return source


def check_source(root: Path, clip: dict) -> tuple[Path, dict]:
    for field in ('id', 'file', 'source_page', 'license', 'attribution', 'file_sha256', 'title', 'seconds'):
        if not clip.get(field):
            raise ValueError(f'{clip.get("id", "unknown")}: missing {field}')
    if clip['license_verified'] is not True or clip['camera_footage_verified'] is not True:
        raise ValueError(f'{clip["id"]}: clip rights or real-camera classification not approved (HOLD)')
    if not clip['source_page'].startswith('https://'):
        raise ValueError('Unverified source reference')
    source = safe_source(root, clip['file'])
    if not source.is_file():
        raise ValueError(f'{clip["id"]}: no recorded camera footage at {source} (HOLD)')
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if len(clip['file_sha256']) != 64 or digest.lower() != clip['file_sha256'].lower():
        raise ValueError(f'{clip["id"]}: downloaded bytes SHA256 mismatch (HOLD)')
    result = json.loads(run(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',str(source)]).stdout)
    streams = [s for s in result.get('streams', []) if s.get('codec_type') == 'video']
    if not streams:
        raise ValueError(f'{clip["id"]}: no playable video track')
    seconds = float(clip['seconds'])
    offset = float(clip.get('in_seconds', 0))
    if not (2 <= seconds <= 12 and offset >= 0 and offset + seconds + .05 <= float(result['format']['duration'])):
        raise ValueError(f'{clip["id"]}: invalid shot timing or insufficient source duration')
    if min(int(streams[0].get('width',0)),int(streams[0].get('height',0))) < 400:
        raise ValueError('Low resolution camera source, HOLD')
    return source, {'clip':clip['id'],'sha256':digest,'seconds':seconds,'source_page':clip['source_page'],
                    'attribution':clip['attribution'],'license':clip['license']}


def validate(manifest: dict, root: Path) -> list:
    if len(manifest.get('clips', [])) != 5:
        raise ValueError('Require 5 verified real-camera shots')
    if manifest.get('width') != 1280 or manifest.get('height') != 720 or manifest.get('frames_per_second') != 24:
        raise ValueError('RC02 output must be 1280x720 at 24fps')
    ids = [c.get('id') for c in manifest['clips']]
    if len(set(ids)) != 5:
        raise ValueError('Duplicate source ID')
    if not (root/manifest.get('soundtrack','')).is_file():
        raise ValueError('Score file missing')
    return [check_source(root, c) for c in manifest['clips']]


def render(root:Path, manifest:dict, destination:Path) -> dict:
    shots = validate(manifest,root)
    if shutil.which('ffmpeg') is None:
        raise RuntimeError('ffmpeg is required')
    font_candidates=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf']
    font = next((f for f in font_candidates if Path(f).is_file()),None)
    if font is None:
        raise RuntimeError('No usable title font; HOLD')
    receipt={'classification':'FILMED STOCK FOOTAGE; DOES NOT DEPICT AN EVERCRAFT PROTOTYPE','clips':[x[1] for x in shots]}
    destination.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='aqua-rc02-') as tmp:
        intermediate=[]
        for i,(path,detail) in enumerate(shots):
            clip=manifest['clips'][i]
            out=Path(tmp)/f'shot{i:02d}.mp4'
            # Designed for real-camera footage, with grade + modest legible editorial titles.
            title=clip['title'].replace(':','\\:').replace("'","\\'").replace('%','\\%')
            subtitle=clip.get('subtitle','').replace(':','\\:').replace("'","\\'")
            vf=("scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,"
                "fps=24,eq=contrast=1.055:saturation=0.88:brightness=-0.03,"
                "drawbox=x=0:y=515:w=1280:h=205:color=black@0.42:t=fill,"
                f"drawtext=fontfile={font}:text='{title}':fontcolor=white:fontsize=43:x=64:y=552")
            if subtitle:
                vf+=(f",drawtext=fontfile={font}:text='{subtitle}':fontcolor=white@0.77:fontsize=20:x=65:y=631")
            run(['ffmpeg','-y','-v','error','-ss',str(clip.get('in_seconds',0)),'-i',str(path),'-t',str(clip['seconds']),
                 '-vf',vf,'-an','-c:v','libx264','-preset','veryfast','-profile:v','baseline','-level:v','3.1',
                 '-pix_fmt','yuv420p','-r','24','-g','48','-crf','19','-movflags','+faststart',str(out)])
            intermediate.append(out)
        playlist=Path(tmp)/'concat.txt'
        playlist.write_text(''.join(f"file '{p}'\n" for p in intermediate))
        total=sum(float(c['seconds']) for c in manifest['clips'])
        score=root/manifest['soundtrack']
        # Audio is an original reference score, not licensed stock music.
        run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(playlist),'-stream_loop','-1','-i',str(score),
             '-t',str(total),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','160k','-ar','44100',
             '-ac','2','-af',f'volume=0.8,afade=t=in:st=0:d=1.0,afade=t=out:st={max(0,total-1.8)}:d=1.8',
             '-movflags','+faststart',str(destination)])
    receipt['render']={'path':str(destination),'seconds':sum(float(c['seconds']) for c in manifest['clips']),
                       'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()}
    destination.with_suffix('.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    return receipt


def main():
    p=argparse.ArgumentParser(description='Fail-closed Evercraft Aqua filmed-footage editor')
    p.add_argument('--manifest',default='manifest.json')
    p.add_argument('--validate-only',action='store_true')
    args=p.parse_args()
    manifest_path=Path(args.manifest).resolve(); root=manifest_path.parent
    try:
        manifest=json.loads(manifest_path.read_text())
        checked=validate(manifest,root)
        if args.validate_only:
            print(json.dumps({'ready':True,'clip_count':len(checked)},indent=2))
        else:
            out=root/manifest['output'];print(json.dumps(render(root,manifest,out),indent=2))
    except (ValueError,RuntimeError,subprocess.CalledProcessError,FileNotFoundError) as e:
        print('HOLD: '+str(e),file=sys.stderr)
        sys.exit(2)

if __name__=='__main__':main()
