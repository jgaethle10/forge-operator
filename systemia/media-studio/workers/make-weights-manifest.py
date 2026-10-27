#!/usr/bin/env python3
"""Create a local SHA256 inventory for a previously downloaded, license-reviewed Wan checkpoint.
This does NOT download model weights or authorize commercial use.
"""
import argparse
import hashlib
import json
from pathlib import Path


def sha256_file(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        while block := stream.read(8 * 1024 * 1024):
            h.update(block)
    return h.hexdigest()


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--model-root', required=True)
    p.add_argument('--license-id', required=True)
    p.add_argument('--out', required=True)
    a = p.parse_args()
    root = Path(a.model_root).resolve()
    out = Path(a.out).resolve()
    if not root.is_dir() or not a.license_id.strip():
        raise ValueError('model root and explicit license evidence identifier are required')
    if out.is_relative_to(root):
        raise ValueError('model manifest must live outside model checkpoint root')
    files = []
    for file in sorted(root.rglob('*')):
        if file.is_symlink():
            raise ValueError('symlinks in checkpoint tree are forbidden')
        if file.is_file():
            files.append({'path':file.relative_to(root).as_posix(),'sha256':sha256_file(file)})
    if not files:
        raise ValueError('empty checkpoint directory')
    manifest = {'schema':'evercraft.local-video.weights-manifest.v1',
        'modelFamily':'wan2.1-t2v-1.3b','modelLicenseId':a.license_id.strip(),'files':files}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, sort_keys=True, indent=2) + '\n')
    print(json.dumps({'manifest':str(out),'sha256':sha256_file(out),'files':len(files)}))


if __name__ == '__main__':
    main()
