#!/usr/bin/env python3
"""Inspect the exact unsigned Firefox Android ZIP before Mozilla submission."""
import json
import pathlib
import sys
import zipfile

archive = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    names = set(z.namelist())
    assert 'manifest.json' in names
    m = json.loads(z.read('manifest.json'))
    assert m['manifest_version'] == 3
    assert m['version'] == '0.1.4'
    assert m['permissions'] == ['storage']
    assert not m.get('host_permissions'), 'unrequested global site access'
    assert not m.get('optional_host_permissions')
    assert m['browser_specific_settings']['gecko']['id'] == 'humanfilter@systemiacommandcenters.com'
    assert m['browser_specific_settings']['gecko']['data_collection_permissions']['required'] == ['none']
    matches = set(m['content_scripts'][0]['matches'])
    assert 'https://m.facebook.com/*' in matches
    assert 'https://m.youtube.com/*' in matches
    assert '<all_urls>' not in matches
    expected = {'popup.html', 'popup.js', 'popup.css', 'options.html', 'content.js', 'content.css', 'rules.js'}
    assert expected.issubset(names)
    assert b'ytm-video-with-context-renderer' in z.read('content.js')
    assert b'ytm-shorts-lockup-view-model' in z.read('content.js')
    assert b'mark-android' in z.read('popup.html')
    assert b'<div class="mark">H<span>F</span></div>' not in z.read('popup.html')
    for size in (16,48,128):
        image = z.read(f'icons/icon{size}.png')
        assert image.startswith(bytes.fromhex('89504e470d0a1a0a'))
print('Firefox Android candidate archive and permission gate: PASS')
print('Not Mozilla signed. No real Android device has been tested by this check.')
