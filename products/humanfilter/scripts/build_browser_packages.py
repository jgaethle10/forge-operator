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
    # Apple App Store Connect accepts a ZIP of source resources with manifest.json
    # at the archive root. It is NOT an installable, signed iPhone/Mac application.
    safari_dir = Path(__file__).resolve().parents[1] / 'safari'
    safari_manifest = json.loads((safari_dir / 'manifest.json').read_text())
    assert safari_manifest['manifest_version'] == 3
    assert safari_manifest['version'] == version
    assert safari_manifest['permissions'] == ['storage']
    assert 'minimum_chrome_version' not in safari_manifest
    safari_files = dict(files)
    safari_files['manifest.json'] = (json.dumps(safari_manifest, indent=2) + '\n').encode()
    safari_files['popup.css'] += b'\n' + (safari_dir / 'popup-mobile.css').read_bytes()
    # A real brand asset rather than the old HF monogram: local, reproducible PNGs.
    # cairoSVG is installed explicitly in CI and is NOT bundled in the extension.
    try:
        import cairosvg
    except ImportError as exc:
        raise SystemExit('Safari packaging requires: python -m pip install cairosvg==2.8.2') from exc
    icon_svg = Path(__file__).resolve().parents[3] / 'public/humanfilter-beta/assets/shield.svg'
    assert icon_svg.is_file(), icon_svg
    for size in (16, 48, 128, 512):
        safari_files[f'icons/icon{size}.png'] = cairosvg.svg2png(
            bytestring=icon_svg.read_bytes(), output_width=size, output_height=size)
    before = b'<div class="mark">H<span>F</span></div>'
    assert before in safari_files['popup.html']
    safari_files['popup.html'] = safari_files['popup.html'].replace(
        before, b'<img class="safari-mark" src="icons/icon48.png" alt="" width="46" height="46">')
    safari_files['options.html'] = safari_files['options.html'].replace(
        b'on your computer in Chrome local extension storage',
        b'on this device in browser extension local storage')
    checks.append(pack(saf, safari_files))
    print(json.dumps(checks, indent=2))

if __name__ == '__main__':
    main()
