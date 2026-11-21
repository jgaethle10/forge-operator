#!/usr/bin/env python3
"""Prepare an UNSIGNED Firefox for Android AMO-review candidate from the existing HumanFilter source.

No APK or Google Play app is generated. Real phone testing and Mozilla signing remain required.
"""
import hashlib
import io
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parents[1]
SOURCE = ROOT / 'extension'
FIREFOX_ID = 'humanfilter@systemiacommandcenters.com'
MOBILE_HOSTS = ['https://m.facebook.com/*', 'https://m.youtube.com/*']
NEW_SELECTORS = ', ytm-video-with-context-renderer, ytm-shorts-lockup-view-model'

def build(destination: Path):
    extension_files = {
        p.relative_to(SOURCE).as_posix(): p.read_bytes()
        for p in SOURCE.rglob('*') if p.is_file()
    }
    manifest = json.loads(extension_files['manifest.json'])
    assert manifest['manifest_version'] == 3
    assert manifest['version'] == '0.1.4'
    manifest.pop('minimum_chrome_version', None)
    manifest['name'] = 'HumanFilter by Evercraft'
    manifest['description'] = 'Local, reversible filters for recognized AI disclosures and keywords on supported Firefox web feeds.'
    hosts = manifest['content_scripts'][0]['matches']
    for host in MOBILE_HOSTS:
        if host not in hosts:
            hosts.append(host)
    manifest['browser_specific_settings'] = {
        'gecko': {
            'id': FIREFOX_ID,
            'strict_min_version': '140.0',
            'data_collection_permissions': {'required': ['none']}
        }
    }
    assert manifest['permissions'] == ['storage']
    assert 'host_permissions' not in manifest
    extension_files['manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    js = extension_files['content.js'].decode()
    target = "ytd-reel-item-renderer'"
    assert target in js
    js = js.replace(target, "ytd-reel-item-renderer" + NEW_SELECTORS + "'")
    extension_files['content.js'] = js.encode()
    # Product branding must match the live website, without the old HF monogram.
    try:
        import cairosvg
    except ImportError as exc:
        raise SystemExit('Install cairoSVG: python -m pip install cairosvg==2.8.2') from exc
    icon = REPO_ROOT / 'public/humanfilter-beta/assets/shield.svg'
    assert icon.exists(), icon
    for size in (16, 48, 128):
        extension_files[f'icons/icon{size}.png'] = cairosvg.svg2png(bytestring=icon.read_bytes(), output_width=size, output_height=size)
    popup = extension_files['popup.html'].decode()
    legacy = '<div class="mark">H<span>F</span></div>'
    assert legacy in popup
    popup = popup.replace(legacy, '<img class="mark-android" src="icons/icon48.png" alt="" width="47" height="47">')
    extension_files['popup.html'] = popup.encode()
    extension_files['popup.css'] += b'\nbody{width:min(350px,100vw)}.mark-android{object-fit:contain;width:47px;height:47px}.feeds label{min-height:44px}@media(max-width:340px){main{padding:12px}h1{font-size:25px}.modes span{padding:8px}}\n'
    extension_files['options.html'] = extension_files['options.html'].replace(
        b'on your computer in Chrome local extension storage',
        b'on your device in browser extension local storage')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, blob in sorted(extension_files.items()):
            z.writestr(name, blob)
    with zipfile.ZipFile(destination) as z:
        assert z.testzip() is None
    return {'path': str(destination), 'bytes': destination.stat().st_size, 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'files': len(extension_files)}

if __name__ == '__main__':
    output = Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'dist/Evercraft-HumanFilter-Firefox-Android-Review-v0.1.4.zip'
    print(json.dumps(build(output), indent=2))
