#!/usr/bin/env python3
"""Fail-closed, source-first intake for owner-exported RC3 human video.

Checks ZIP integrity, declared permissions, real media metadata and SHA256.
Does NOT certify that a person appears, that a scene depicts the script, or
that the footage has commercial rights beyond the submitter's attestation.
No network, no publication and no remastering.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

SCHEMA = 'evercraft.humanfilter.fallen.live-action-intake.v1'
SHOT_IDS = ('wide', 'hands', 'reaction', 'hero')
MAX_PACK_BYTES = 650 * 1024 * 1024
MAX_CLIP_BYTES = 250 * 1024 * 1024

def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for data in iter(lambda: f.read(1024 * 1024), b''):
            h.update(data)
    return h.hexdigest()

def require(condition, reason):
    if not condition:
        raise ValueError(reason)

def ffprobe(path: Path) -> dict:
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)], capture_output=True, text=True)
    require(r.returncode == 0, 'ffprobe_failed: ' + (r.stderr or 'unknown')[-200:])
    return json.loads(r.stdout)

def sample(path: Path, output: Path, timestamp: float):
    r = subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-ss',str(round(timestamp,3)),
        '-i',str(path),'-frames:v','1','-vf','scale=640:-2:flags=lanczos',str(output)],capture_output=True,text=True)
    require(r.returncode == 0 and output.exists() and output.stat().st_size>1000, 'frame_extraction_failed')

def ingest(source_zip: Path, output: Path) -> dict:
    require(source_zip.is_file(), 'source_zip_missing')
    require(not output.exists(), 'output_exists_no_overwrite')
    with zipfile.ZipFile(source_zip) as z:
        members = z.infolist()
        require(2 <= len(members) <= 5, 'zip_member_count_invalid')
        names = [m.filename for m in members]
        require(len(names) == len(set(names)), 'duplicate_archive_member')
        require('intake-manifest.json' in names, 'manifest_missing')
        require(all(n == 'intake-manifest.json' or
            (n.startswith('footage/') and len(n.split('/')) == 2 and n.split('/')[-1].split('.')[0] in SHOT_IDS and
             Path(n).suffix.lower() in {'.mov','.mp4','.m4v','.webm'}) for n in names), 'unapproved_zip_member_or_path')
        require(sum(m.file_size for m in members) <= MAX_PACK_BYTES, 'zip_total_size_exceeded')
        require(all(0 <= m.file_size <= MAX_CLIP_BYTES for m in members if m.filename != 'intake-manifest.json'), 'clip_size_exceeded')
        require(all((m.external_attr >> 16) & 0o170000 != 0o120000 for m in members), 'symlink_not_allowed')
        require(z.getinfo('intake-manifest.json').file_size < 70_000, 'manifest_too_large')
        manifest = json.loads(z.read('intake-manifest.json'))
        require(manifest.get('schema') == SCHEMA, 'manifest_schema_invalid')
        require(manifest.get('project') == 'humanfilter-launch-rc3', 'wrong_project')
        require(manifest.get('rights_attested') is True and manifest.get('consent_attested') is True, 'consent_or_rights_unattested')
        require(manifest.get('publication_authority') is False and manifest.get('owner_creative_approved') is False, 'premature_authority_claim')
        claims = manifest.get('files', [])
        require(isinstance(claims, list) and len(claims) == len(members)-1, 'manifest_file_count_mismatch')
        require(1 <= len(claims) <= len(SHOT_IDS), 'shot_count_invalid')
        ids = [x.get('shot_id') for x in claims]
        paths = [x.get('path') for x in claims]
        require(len(ids) == len(set(ids)) and all(x in SHOT_IDS for x in ids), 'invalid_or_duplicate_shot_id')
        require(len(paths) == len(set(paths)) and set(paths) == set(names)-{'intake-manifest.json'}, 'archive_manifest_mismatch')
        require(all(x.get('human_consent') == 'owner_attested' and x.get('source_rights') == 'owner_attested' and x.get('creative_approval') is False for x in claims), 'per_shot_rights_or_approval_invalid')
        with tempfile.TemporaryDirectory(prefix='hf-rc3-import-') as tmp:
            temp = Path(tmp)
            records = []
            for item in claims:
                member = z.getinfo(item['path'])
                target = temp / member.filename.split('/')[-1]
                with z.open(member) as source, target.open('wb') as dest:
                    shutil.copyfileobj(source, dest)
                require(target.stat().st_size == member.file_size == item.get('size_bytes'), 'file_size_mismatch')
                actual = sha(target)
                if item.get('sha256') is not None:
                    require(item['sha256'] == actual, 'client_hash_mismatch:'+item['shot_id'])
                probe = ffprobe(target)
                videos = [s for s in probe.get('streams', []) if s.get('codec_type') == 'video']
                require(len(videos) == 1, 'video_stream_missing_or_ambiguous')
                width, height = int(videos[0].get('width',0)), int(videos[0].get('height',0))
                duration = float(probe.get('format',{}).get('duration',0))
                require(400 <= width <= 8192 and 400 <= height <= 8192, 'source_video_dimensions_invalid')
                require(2 <= duration <= 90, 'source_video_duration_out_of_bounds')
                records.append({'shot_id':item['shot_id'], 'source_member':item['path'],
                    'file_name':item['path'].split('/')[-1], 'sha256':actual, 'bytes':target.stat().st_size,
                    'observed_duration_seconds':round(duration,3), 'observed_width':width, 'observed_height':height,
                    'codec':videos[0].get('codec_name'), 'source_rights':'submitter_attestation_only',
                    'human_consent':'submitter_attestation_only', 'observed_human':'not_verified',
                    'visual_approval':False, 'publication_authority':False})
            output.mkdir(parents=True)
            original = output / 'originals'
            original.mkdir()
            frames = output / 'frame-evidence'
            frames.mkdir()
            for record in records:
                src = temp / record['file_name']
                dest = original / record['file_name']
                shutil.copyfile(src, dest)
                require(sha(dest) == record['sha256'], 'output_copy_corrupted')
                frame_receipts = []
                for i, relative in enumerate((.15,.5,.85), 1):
                    f = frames / f"{record['shot_id']}-{i}.jpg"
                    sample(dest, f, record['observed_duration_seconds'] * relative)
                    frame_receipts.append({'relative_position':relative,'file':f.name,'sha256':sha(f)})
                record['sampled_frames'] = frame_receipts
    pending = [id for id in SHOT_IDS if id not in {r['shot_id'] for r in records}]
    receipt = {'schema':'evercraft.humanfilter.fallen.live-action-intake-receipt.v1',
       'status':'TECHNICAL_ACCEPTED_HUMAN_VISUAL_REVIEW_REQUIRED',
       'source_pack_sha256':sha(source_zip),'source_count':len(records), 'sources':records,
       'missing_shots':pending, 'review_required':[
         'confirm people actually appear in frame', 'confirm human likeness and brand authenticity',
         'verify actor consent outside self-attestation', 'verify display content and no personal information',
         'confirm editability and artistic quality', 'owner must approve every shot'],
       'automated_visual_subject_verification':False, 'owner_creative_approved':False,
       'film_master_created':False, 'publication_authority':False}
    (output/'intake-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    (output/'production-needs.json').write_text(json.dumps({
      'schema':'evercraft.humanfilter.fallen.production-needs.v1',
      'status':'PENDING_HUMAN_APPROVAL_AND_ADDITIONAL_ASSETS',
      'missing_live_action_shots':pending,
      'awaiting_owner_visual_approval':[r['shot_id'] for r in records],
      'awaiting_audio':['approved_Bella_performance','owner_approved_original_score','owner_approved_original_sfx'],
      'ready_for_final_fallen_assembly':False},indent=2)+'\n')
    return receipt

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--zip',required=True,type=Path)
    p.add_argument('--out',required=True,type=Path)
    a=p.parse_args()
    try:
        r=ingest(a.zip,a.out)
        print(json.dumps({'status':r['status'],'source_count':r['source_count'],
            'missing_shots':r['missing_shots'],'publication_authority':False},indent=2))
    except Exception as exc:
        p.error(f'REJECTED: {type(exc).__name__}: {exc}')