"""True Chromium unpacked-extension injection checks with intercepted fixture websites.

No contact with live Facebook, Reddit or YouTube. The page URLs match real domains,
but their network requests are served as inert local HTML test fixtures.
"""
import tempfile
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / 'extension'
SITES = {
    'www.facebook.com': '<div role="article" id="target"><p>I made this with AI today!</p></div><div role="article" id="human">Dogs are good.</div>',
    'www.reddit.com': '<shreddit-post id="target"><p>Made using Midjourney</p></shreddit-post><shreddit-post id="human">Dogs are good.</shreddit-post>',
    'www.youtube.com': '<ytd-rich-grid-media id="target"><div aria-label="Made with AI"></div><p>Mountain video</p></ytd-rich-grid-media><ytd-video-renderer id="human">Camping video</ytd-video-renderer>',
}

with tempfile.TemporaryDirectory(prefix='hf-chrome-') as home:
  with sync_playwright() as p:
    context = p.chromium.launch_persistent_context(
        home, headless=True, **({'executable_path': os.environ['HF_CHROMIUM_BIN']} if os.environ.get('HF_CHROMIUM_BIN') else {}),
        args=['--no-sandbox', f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}'],
    )
    context.route('**/*', lambda route: route.fulfill(
        status=200, content_type='text/html',
        body='<!doctype html><html><body>' + SITES[route.request.url.split('/')[2]] + '</body></html>'
    ) if route.request.url.split('/')[2] in SITES else route.abort())
    for host in SITES:
      page = context.new_page()
      page.goto(f'https://{host}/', wait_until='domcontentloaded')
      page.wait_for_selector('#target[data-humanfilter-hidden="true"]', timeout=10000)
      page.wait_for_timeout(300)
      assert page.locator('#target .humanfilter-notice').count() == 1, f'{host}: notice missing'
      assert page.locator('#human[data-humanfilter-hidden="true"]').count() == 0, f'{host}: human content covered'
      page.locator('#target button').click()
      assert page.locator('#target[data-humanfilter-revealed="true"]').count() == 1
      page.wait_for_timeout(300)
      assert page.locator('#target .humanfilter-notice').count() == 0
      print(f'{host}: extension injected; post hidden; human visible; reveal persists')
      page.close()
    context.close()
print('3 actual extension injection fixtures passed')
