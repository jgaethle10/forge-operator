#!/usr/bin/env python3
"""Static gate for Apple's Safari Web Extension Packager input ZIP.
No claim of a signed binary, Apple device run, or store approval.
"""
import json
import sys
import zipfile
from pathlib import Path

def main(archive):
    expected = {
        'https://www.facebook.com/*', 'https://web.facebook.com/*',
        'https://m.facebook.com/*', 'https://www.reddit.com/*',
        'https://old.reddit.com/*', 'https://www.youtube.com/*',
        'https://m.youtube.com/*'
    }
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None, 'corrupt Safari ZIP'
        names = set(z.namelist())
        assert 'manifest.json' in names, 'manifest is not at ZIP root'
        m = json.loads(z.read('manifest.json'))
        assert m['manifest_version'] == 3
        assert m['version'] == '0.1.4'
        assert m['permissions'] == ['storage'], 'least privilege violated'
        assert not m.get('host_permissions'), 'no additional host permissions permitted'
        assert not m.get('optional_host_permissions'), 'unexpected optional access'
        assert 'minimum_chrome_version' not in m
        assert len(m['content_scripts']) == 1
        cs = m['content_scripts'][0]
        assert set(cs['matches']) == expected, 'unexpected website access scope'
        assert cs['js'] == ['rules.js','content.js']
        for file in ('popup.html','popup.js','popup.css','rules.js',
                     'content.js','content.css','options.html'):
            assert file in names, 'missing resource: ' + file
            assert z.read(file), 'empty resource: ' + file
        assert b'ytm-video-with-context-renderer' in z.read('content.js')
        assert b'ytm-shorts-lockup-view-model' in z.read('content.js')
        assert b'safari-mark' in z.read('popup.html')
        assert b'width:min(350px,100vw)' in z.read('popup.css')
        assert b'<div class="mark">H<span>F</span></div>' not in z.read('popup.html')
        for size in (16, 48, 128, 512):
            icon = 'icons/icon%d.png' % size
            assert icon in names, 'missing icon: ' + icon
            assert z.read(icon).startswith(bytes.fromhex('89504e470d0a1a0a'))
        assert len(z.read('icons/icon512.png')) > 500, 'unrendered icon'
        print('Safari source integrity PASS:', archive, 'resources=', len(names))
    print('NOTE: synthetic/source validation only; Apple TestFlight device QA pending.')

if __name__ == '__main__':
    main(Path(sys.argv[1]))
