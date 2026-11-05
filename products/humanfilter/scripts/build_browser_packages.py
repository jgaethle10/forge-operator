#!/usr/bin/env python3
"""Create a reproducible set of HumanFilter developer/submission browser ZIPs.

All archives are developer-test or store-submission files. No package is signed.
The Safari ZIP is source for Apple's packager, not an iOS/macOS installer.
"""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

FIREFOX_ID = 'humanfilter@systemiacommandcenters.com'


def pack(output, files):
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name in sorted(files):
            info = zipfile.ZipInfo(name, (2026, 10, 26, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, files[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(output) as z:
        assert z.testzip() is None
        assert json.loads(z.read('manifest.json'))['version'] == '0.1.4'
    return {'file': output.name,
            'bytes': output.stat().st_size,
            'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--extension-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'extension')
    ap.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'dist')
    args = ap.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    files = {p.relative_to(args.extension_dir).as_posix(): p.read_bytes()
             for p in args.extension_dir.rglob('*') if p.is_file()}
    manifest = json.loads(files['manifest.json'])
    version = manifest['version']
    def p(label):
        return args.output_dir / f'Evercraft-HumanFilter-{label}-v{version}.zip'
    chrom = p('Chromium-Desktop'); edge = p('Edge-Beta')
    fx = p('Firefox-Temporary-Beta'); saf = p('Safari-Submission-Source')
    checks = [pack(chrom, files), pack(edge, files)]
    assert chrom.read_bytes() == edge.read_bytes()
    firefox_manifest = manifest.copy()
    firefox_manifest.pop('minimum_chrome_version', None)
    firefox_manifest['browser_specific_settings'] = {
        'gecko': {'id': FIREFOX_ID, 'strict_min_version': '140.0',
                  'data_collection_permissions': {'required': ['none']}}}
    checks.append(pack(fx, {**files, 'manifest.json': (json.dumps(firefox_manifest, indent=2)+'\n').encode()}))
    safari_manifest = manifest.copy()
    safari_manifest.pop('minimum_chrome_version', None)
    checks.append(pack(saf, {**files, 'manifest.json': (json.dumps(safari_manifest, indent=2)+'\n').encode()}))
    print(json.dumps(checks, indent=2))

if __name__ == '__main__':
    main()
