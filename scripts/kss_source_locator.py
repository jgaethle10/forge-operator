#!/usr/bin/env python3
"""Offline, read-only search for the original KSS Python site-plan toolchain.

Explicit local roots only. No network, secrets, extraction, upload or modification.
"""
from __future__ import annotations
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import sys
import zipfile

TARGETS = {
    'build_rivet_vdot_submission_pair_v1.py',
    'kss_siteplan_profiles.py',
    'kss_siteplan_v2_layout_qa.py',
    'kss_visual_maturity_qa.py',
    'kss_review_pdf_optimize.py',
}
EXCLUDE_DIRS = {'.git','node_modules','.venv','venv','__pycache__','.npm','.cargo'}
MAX_MATCH_BYTES = 20 * 1024 * 1024


def inspect_roots(roots: list[Path], *, include_zip: bool = False, max_files: int = 100000) -> dict:
    found = []
    count = 0
    warnings = []
    for root in roots:
        root = root.expanduser().resolve()
        if not root.is_dir():
            warnings.append('not_a_directory:' + str(root))
            continue
        for directory,dirs,filenames in os.walk(root,followlinks=False):
            dirs[:] = [name for name in dirs if name not in EXCLUDE_DIRS and
                       not (Path(directory)/name).is_symlink()]
            for name in filenames:
                count += 1
                if count > max_files:
                    warnings.append('max_files_reached')
                    break
                p=Path(directory)/name
                if p.is_symlink():
                    continue
                if name.casefold() in TARGETS:
                    try:
                        size=p.stat().st_size
                        if size > MAX_MATCH_BYTES:
                            warnings.append('source_too_large_to_hash:' + str(p))
                            continue
                        digest=sha256(p.read_bytes()).hexdigest()
                        found.append({'kind':'file','name':name,'local_path':str(p),
                                      'bytes':size,'sha256':digest})
                    except OSError:
                        warnings.append('source_read_error:' + str(p))
                elif include_zip and name.lower().endswith('.zip'):
                    try:
                        with zipfile.ZipFile(p) as z:
                            for info in z.infolist():
                                item=Path(info.filename).name
                                if item.casefold() in TARGETS and not info.is_dir():
                                    found.append({'kind':'archive_entry','name':item,
                                                  'archive_path':str(p),
                                                  'entry_path':info.filename,
                                                  'uncompressed_bytes':info.file_size,
                                                  'crc32':f'{info.CRC:08x}',
                                                  'content_extracted':False})
                    except (OSError,zipfile.BadZipFile):
                        warnings.append('archive_unreadable:' + str(p))
            if count>max_files:
                break
        if count>max_files:
            break
    return {'schema':'evercraft.kss.offline-source-locator.v1','roots':[str(x.expanduser().resolve()) for x in roots],
            'filenames_sought':sorted(TARGETS),'files_examined':min(count,max_files),
            'hits':found,'warnings':warnings,'source_bytes_uploaded':False,
            'network_requests':0,'modified_files':0}


def main() -> int:
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--root',type=Path,action='append',required=True,help='Owned local directory; can repeat')
    ap.add_argument('--include-zips',action='store_true',help='Search ZIP central directories without extracting')
    ap.add_argument('--max-files',type=int,default=100000)
    ap.add_argument('--output',type=Path,help='Optional report file path; without this prints JSON to stdout')
    args=ap.parse_args()
    if args.max_files<1:
        raise SystemExit('--max-files must be positive')
    result=inspect_roots(args.root,include_zip=args.include_zips,max_files=args.max_files)
    serialized=json.dumps(result,indent=2)+'\n'
    if args.output:
        args.output.write_text(serialized)
    else:
        sys.stdout.write(serialized)
    return 0

if __name__=='__main__':
    raise SystemExit(main())
