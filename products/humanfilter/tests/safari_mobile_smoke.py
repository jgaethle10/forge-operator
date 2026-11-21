"""Synthetic Safari WebKit viewport checks (NOT real iOS Safari or signed App Store app).

Run after: python -m playwright install webkit
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1] / 'extension'
cases = {
    'm.facebook.com': (
        '<div role="article" id="target"><span>AI info</span><p>Portrait</p></div>'
        '<div role="article" id="human">Human-made hiking memory</div>'
    ),
    'm.youtube.com': (
        '<ytm-video-with-context-renderer id="target"><span aria-label="Made with AI">Art reel</span></ytm-video-with-context-renderer>'
        '<ytm-video-with-context-renderer id="human">Human-made hiking memory</ytm-video-with-context-renderer>'
    ),
    'www.reddit.com': (
        '<shreddit-post id="target"><p>Made with Midjourney</p></shreddit-post>'
        '<shreddit-post id="human">Human-made hiking memory</shreddit-post>'
    ),
}
with sync_playwright() as pw:
    browser = pw.webkit.launch(headless=True)
    for hostname, html in cases.items():
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = context.new_page()
        errors=[]
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.set_content('<html><body>' + html + '</body></html>')
        page.evaluate("""() => {
          window.__safariSettingsChanged = null;
          window.chrome = { storage: {
            local: {get: async()=>({})},
            onChanged: {addListener: fn=>{window.__safariSettingsChanged = fn}}
          }};
        }""")
        page.add_style_tag(path=str(root/'content.css'))
        page.add_script_tag(path=str(root/'rules.js'))
        source = (root/'content.js').read_text().replace(
            'const host = location.hostname;', 'const host = ' + repr(hostname) + ';'
        )
        page.add_script_tag(content=source)
        page.wait_for_selector('#target[data-humanfilter-hidden="true"] .humanfilter-notice')
        assert page.locator('#human[data-humanfilter-hidden="true"]').count() == 0
        assert page.locator('#target button').is_visible()
        page.locator('#target button').click()
        assert page.locator('#target[data-humanfilter-revealed="true"]').count() == 1
        page.evaluate("""() => window.__safariSettingsChanged(
           {settings:{newValue:{enabled:false}}}, 'local')""")
        page.wait_for_function("!document.querySelector('#target').hasAttribute('data-humanfilter-hidden')")
        assert page.locator('[data-humanfilter-hidden="true"]').count() == 0
        assert not errors, f'{hostname} script exceptions: {errors}'
        context.close()
        print(hostname, ': touch viewport WebKit filter/reveal/pause PASS')
    browser.close()
print('WebKit mobile synthetic smoke PASS; real Safari device validation remains required.')
