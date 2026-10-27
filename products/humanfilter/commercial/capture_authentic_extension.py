#!/usr/bin/env python3
"""Proof-first original source capture of the actual HumanFilter extension.

All social-card content is CONTROLLED FIXTURE DATA, not an observed post.
Actual extension binaries are loaded in Chromium via Manifest V3, and actual
popup settings, MutationObserver behavior and Show once are exercised.
This produces review plates, not a publishable commercial.
"""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

EXT_DIR = Path(os.environ['HF_EXTENSION_DIR']).resolve()
OUT_DIR = Path(os.environ.get('HF_CAPTURE_OUT', 'artifacts/humanfilter-rc3/captured')).resolve()
OUT_DIR.mkdir(parents=True, exist_ok=True)
VID_DIR = OUT_DIR / 'raw'
VID_DIR.mkdir(exist_ok=True)

STUB_HTML = """<!doctype html><html lang='en'><head><meta charset='UTF-8'><title>HumanFilter Product Lab | Controlled Demonstration</title>
<style>
*{box-sizing:border-box}html,body{background:#10151a;color:#eaf3f2;font:18px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0}
.wrap{margin:0 auto;max-width:830px;padding:35px 46px 90px}.label{font-weight:800;letter-spacing:3px;font-size:14px;color:#82c3b3}
h1{font-size:33px;letter-spacing:-1px;margin:9px 0 8px}.sub{color:#a8bbb8;font-size:16px;margin-bottom:28px}
.banner{background:#173128;color:#92e9cf;border:1px solid #35675c;padding:13px 18px;font-size:13px;border-radius:11px;margin-bottom:24px;letter-spacing:.1px}
.post{background:#192229;border:1px solid #34474a;border-radius:21px;padding:25px 28px;margin-bottom:22px;min-height:184px;position:relative;overflow:hidden}
.top{display:flex;align-items:center;gap:14px;margin-bottom:13px}.avatar{width:43px;height:43px;border-radius:50%;background:linear-gradient(135deg,#70b5a3,#2f606a);}
.user{font-weight:700;font-size:17px}.time{font-size:12px;color:#90acae}.text{font-size:21px;line-height:1.34;margin:11px 0 16px}
.pill{display:inline-block;border-radius:7px;padding:5px 10px;color:#e3eee8;font-size:13px;background:#465457}
.footer{margin-top:25px;border-top:1px solid #2b4544;padding-top:15px;color:#9caeaf;font-size:13px;letter-spacing:1px}
.note{color:#86a3a5;font-size:13px;line-height:1.4;margin-bottom:17px}
</style></head><body><div class='wrap'>
<div class='label'>EVERCRAFT / PRODUCT LAB</div><h1>HumanFilter • Live extension behavior</h1>
<div class='sub'>The controls and filtering below run from the installed extension.</div>
<div class='banner'>CONTROLLED DEMONSTRATION · These sample posts are fictional. This is NOT a live social-media feed.</div>
<div class='note'>Use Balanced to filter self-disclosed AI posts. Strict adds optional AI-related topics. Reveal any softened post with Show once.</div>
<article data-testid='post-container' class='post' id='human-card'><div class='top'><div class='avatar'></div><div><div class='user'>Maya • Sample author</div><div class='time'>Sample card · 2h ago</div></div></div>
<div class='text'>Took the long way home through the mountains. This view was worth it.</div><span class='pill'>Photography</span><div class='footer'>♡ &nbsp; comment &nbsp; share</div></article>
<article data-testid='post-container' class='post' id='declared-card'><div class='top'><div class='avatar'></div><div><div class='user'>Jordan • Sample author</div><div class='time'>Sample card · 3h ago</div></div></div>
<div class='text'>I created this with AI to explore different lighting styles.</div><span class='pill' aria-label='Made with AI'>Made with AI</span><div class='footer'>♡ &nbsp; comment &nbsp; share</div></article>
<article data-testid='post-container' class='post' id='topic-card'><div class='top'><div class='avatar'></div><div><div class='user'>Sam • Sample author</div><div class='time'>Sample card · 5h ago</div></div></div>
<div class='text'>A discussion of deepfake videos and how to recognize them.</div><span class='pill'>Discussion</span><div class='footer'>♡ &nbsp; comment &nbsp; share</div></article>
<article data-testid='post-container' class='post' id='keyword-card'><div class='top'><div class='avatar'></div><div><div class='user'>Casey • Sample author</div><div class='time'>Sample card · 8h ago</div></div></div>
<div class='text'>This weekend we planted a community garden at the library.</div><span class='pill'>Community</span><div class='footer'>♡ &nbsp; comment &nbsp; share</div></article>
</div></body></html>"""


def sha(data):
    return hashlib.sha256(data).hexdigest()


def chromium_extension_id(browser_context):
    page = browser_context.new_page()
    page.goto('chrome://extensions/', wait_until='domcontentloaded')
    page.wait_for_timeout(1800)
    ident = page.evaluate("""() => {
       let m=document.querySelector('extensions-manager');
       let l=m?.shadowRoot?.querySelector('extensions-item-list');
       const items=l?.shadowRoot?.querySelectorAll('extensions-item') || [];
       return Array.from(items).map(x => ({id:x.data?.id||x.id||x.getAttribute('id'),
          name:x.data?.name||''}));
    }""")
    page.close()
    rows = [row for row in ident if 'HumanFilter' in row.get('name','') and row.get('id')]
    if len(rows) != 1:
        raise RuntimeError(f'Unable to identify the installed HumanFilter extension: {ident}')
    return rows[0]['id']


def check(condition, reason):
    if not condition: raise AssertionError(reason)


def capture():
    records=[]
    with tempfile.TemporaryDirectory(prefix='hf-real-extension-capture-') as tmp, sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(tmp, channel='chromium', headless=True,
              viewport={'width':1080,'height':1920}, record_video_dir=str(VID_DIR),
              record_video_size={'width':1080,'height':1920},
              args=['--no-sandbox', f'--disable-extensions-except={EXT_DIR}', f'--load-extension={EXT_DIR}'])
        ext_id = chromium_extension_id(browser)
        print('Real extension loaded:', ext_id, flush=True)
        panel = browser.new_page()
        panel.goto(f'chrome-extension://{ext_id}/popup.html', wait_until='domcontentloaded')
        panel.wait_for_selector('#enabled')
        check(panel.locator('h1').inner_text()=='HumanFilter','Extension popup not authentic')
        # Prepare before state through actual extension popup controls.
        panel.locator('#enabled').uncheck()
        panel.wait_for_timeout(450)
        page = browser.new_page()
        page.route('**/*', lambda route: route.fulfill(status=200, content_type='text/html',body=STUB_HTML)
                   if route.request.url.startswith('https://www.reddit.com/hf-controlled-demo') else route.continue_())
        page.goto('https://www.reddit.com/hf-controlled-demo', wait_until='domcontentloaded')
        page.wait_for_selector('#declared-card')
        check(page.locator('#declared-card[data-humanfilter-hidden="true"]').count()==0,'Filter off not respected')
        page.wait_for_timeout(1300)
        page.screenshot(path=str(OUT_DIR/'01-before.png'))
        # Toggle in shipped popup, observe actual content script updating.
        panel.locator('#enabled').check()
        page.locator('#declared-card[data-humanfilter-hidden="true"]').wait_for(state='attached', timeout=12000)
        check(page.locator('#human-card[data-humanfilter-hidden="true"]').count()==0,'False positive on human sample')
        page.screenshot(path=str(OUT_DIR/'02-balanced-filtered.png'))
        page.wait_for_timeout(1500)
        records.append({'shot':'balanced_transition','passed':True,'mode':'balanced',
                        'hidden':'declared-card','visible':'human-card'})
        # Show the actual popup UI in a 9:16 captured video + still source.
        panel.screenshot(path=str(OUT_DIR/'03-authentic-popup.png'))
        panel.wait_for_timeout(1200)
        panel.locator('input[name="mode"][value="strict"]').check()
        page.locator('#topic-card[data-humanfilter-hidden="true"]').wait_for(state='attached',timeout=12000)
        page.screenshot(path=str(OUT_DIR/'04-strict-topic.png'))
        page.wait_for_timeout(950)
        records.append({'shot':'strict_mode','passed':True,'mode':'strict',
                        'hidden':'topic-card','visible':'human-card'})
        panel.locator('#keywords').fill('community garden')
        page.locator('#keyword-card[data-humanfilter-hidden="true"]').wait_for(state='attached',timeout=12000)
        page.screenshot(path=str(OUT_DIR/'05-keyword-filtered.png'))
        page.wait_for_timeout(1000)
        records.append({'shot':'keyword_custom','passed':True,'keyword':'community garden','hidden':'keyword-card'})
        page.locator('#declared-card button').click()
        check(page.locator('#declared-card[data-humanfilter-revealed="true"]').count()==1,'Show once failed')
        check(page.locator('#declared-card[data-humanfilter-hidden="true"]').count()==0,'Reveal still hidden')
        page.screenshot(path=str(OUT_DIR/'06-show-once.png'))
        page.wait_for_timeout(1500)
        records.append({'shot':'show_once','passed':True,'revealed':'declared-card'})
        # Persisted options are actual chrome.storage values, not a mock UI.
        data=panel.evaluate('() => chrome.storage.local.get("settings")')
        saved=data.get('settings',{})
        check(saved.get('mode')=='strict','Settings persistence failed')
        check('community garden' in saved.get('customKeywords',[]),'Keyword persistence failed')
        panel.close();page.close();
        # Keep actual page-to-video identity rather than sorting by file size.
        videos=[('authentic-extension-feed.mp4', Path(page.video.path())),
                ('authentic-extension-popup.mp4', Path(panel.video.path()))]
        browser.close()
    outputs=[]
    for name,video in videos:
        target=OUT_DIR/name
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(video),
            '-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(target)],check=True)
        outputs.append({'name':name,'sha256':sha(target.read_bytes()),'bytes':target.stat().st_size})
    receipt={
     'schema':'evercraft.humanfilter.fallen.source-capture.v1',
     'source_family':'owned-original-extension-screen-recording',
     'footage_type':'CONTROLLED_DEMONSTRATION_NOT_LIVE_SOCIAL_FEED',
     'extension_source_sha256':sha((EXT_DIR/'manifest.json').read_bytes()),
     'real_extension_installed':True,
     'native_controls_used':True,
     'test_actions':records,
     'assets':outputs,
     'commercial_source_limitations':['controlled fictional feed; cannot present as a live social-media post',
           'screen recording only; does not supply original cinematic physical footage, Bella voice or licensed music',
           'preproduction evidence only; no public release approval'],
     'approved_for_publish':False}
    (OUT_DIR/'source-capture-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,indent=2),flush=True)

if __name__ == '__main__':
    capture()