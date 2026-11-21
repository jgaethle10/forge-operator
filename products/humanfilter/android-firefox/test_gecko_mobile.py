"""Firefox (Gecko) mobile-sized synthetic DOM validation.

Not a genuine Firefox for Android install, Mozilla signing, or live account test.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / 'extension'
SITES = {
    'm.facebook.com': '<div role="article" id="target"><span>AI info</span><p>Portrait</p></div><div role="article" id="human">A family hiking trip</div>',
    'm.youtube.com': '<ytm-video-with-context-renderer id="target"><span aria-label="Made with AI">A picture</span></ytm-video-with-context-renderer><ytm-video-with-context-renderer id="human">A family hiking trip</ytm-video-with-context-renderer>',
    'www.reddit.com': '<shreddit-post id="target"><p>Made using Midjourney</p></shreddit-post><shreddit-post id="human">A family hiking trip</shreddit-post>',
}
with sync_playwright() as p:
    browser = p.firefox.launch(headless=True)
    for host, markup in SITES.items():
        page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content('<html><body>' + markup + '</body></html>')
        page.evaluate("""() => {
          window.__onSettingsChanged = null;
          window.chrome = {storage: {
            local: {get: async()=>({})},
            onChanged: {addListener:fn=>window.__onSettingsChanged=fn}
          }};
        }""")
        page.add_style_tag(path=str(ROOT / 'content.css'))
        page.add_script_tag(path=str(ROOT / 'rules.js'))
        js=(ROOT/'content.js').read_text().replace(
            'const host = location.hostname;', "const host = '" + host + "';")
        js=js.replace("ytd-reel-item-renderer'", "ytd-reel-item-renderer, ytm-video-with-context-renderer, ytm-shorts-lockup-view-model'")
        page.add_script_tag(content=js)
        page.wait_for_selector('#target[data-humanfilter-hidden="true"] .humanfilter-notice')
        assert page.locator('#human[data-humanfilter-hidden="true"]').count() == 0
        page.locator('#target button').click()
        assert page.locator('#target[data-humanfilter-revealed="true"]').count() == 1
        page.evaluate("""() => window.__onSettingsChanged({settings:{newValue:{enabled:false}}}, 'local')""")
        page.wait_for_function("!document.querySelector('#target').hasAttribute('data-humanfilter-hidden')")
        assert not errors, f'{host}: {errors}'
        page.close()
        print('Gecko mobile synthetic fixture PASS:', host)
    browser.close()
print('Real Android device, live site compatibility and AMO approval remain unverified.')
