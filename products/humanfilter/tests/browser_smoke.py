"""Playwright DOM integration fixtures. No claims about live social sites.
Run: python tests/browser_smoke.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / 'extension'
HTML = {
    'facebook': '<div role="article" id="target"><p>I made this with AI today!</p></div><div role="article" id="human">Dogs are good.</div>',
    'reddit': '<shreddit-post id="target"><p>Made using Midjourney</p></shreddit-post><shreddit-post id="human">Dogs are good.</shreddit-post>',
    'youtube': '<ytd-rich-grid-media id="target"><div aria-label="Made with AI"></div><p>Mountain video</p></ytd-rich-grid-media><ytd-video-renderer id="human">Camping video</ytd-video-renderer>',
}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for site in HTML:
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.set_content('<!doctype html><html><body>' + HTML[site] + '</body></html>')
        page.evaluate("""() => {
            window.__onSettingsChanged = null;
            window.chrome = { storage: {
                local: {get: async()=>({})},
                onChanged: {addListener:(fn)=>{window.__onSettingsChanged = fn}}
            }};
        }""")
        page.add_style_tag(path=str(ROOT/'content.css'))
        page.add_script_tag(path=str(ROOT/'rules.js'))
        content = (ROOT/'content.js').read_text().replace('const host = location.hostname;', f'const host = "www.{site}.com";')
        page.add_script_tag(content=content)
        page.wait_for_selector('#target[data-humanfilter-hidden="true"] .humanfilter-notice')
        page.wait_for_timeout(120)
        assert page.locator('#target .humanfilter-notice').count() == 1, f'{site}: notice flickered away'
        assert page.locator('#human[data-humanfilter-hidden="true"]').count() == 0
        assert not page.locator('#target p').is_visible() if site == 'facebook' else True
        page.locator('#target button').click()
        assert page.locator('#target[data-humanfilter-revealed="true"]').count() == 1
        page.wait_for_timeout(120)
        assert page.locator('#target .humanfilter-notice').count() == 0
        # Disabling must restore everything. Then reenable to verify dynamic rescanning.
        page.evaluate("""() => window.__onSettingsChanged({settings:{newValue:{enabled:false}}}, 'local')""")
        page.wait_for_function("document.querySelector('#target').hasAttribute('data-humanfilter-hidden') === false")
        assert page.locator('[data-humanfilter-hidden="true"]').count() == 0
        page.evaluate("""() => window.__onSettingsChanged({settings:{newValue:{enabled:true}}}, 'local')""")
        page.wait_for_selector('#target[data-humanfilter-hidden="true"] .humanfilter-notice')
        # Virtualized feeds change their markup; removing the matching text should uncover the post.
        page.evaluate("""() => {
            const post = document.querySelector('#target');
            post.replaceChildren(document.createTextNode('An ordinary human post about hiking.'));
        }""")
        page.wait_for_function("document.querySelector('#target').hasAttribute('data-humanfilter-hidden') === false")
        page.wait_for_timeout(100)
        assert page.locator('#target .humanfilter-notice').count() == 0
        assert not errors, f'{site}: {errors}'
        page.close()
        print(f'{site}: filter, stable rescan, reveal, pause, resume, replacement passed')
    # Native metadata disclosure can be a short visible label without ARIA.
    page = browser.new_page()
    page.set_content('<div role="article" id="label"><span>AI info</span><p>Portrait image</p></div>')
    page.evaluate("""() => { window.chrome={storage:{local:{get:async()=>({})},onChanged:{addListener:()=>{}}}} }""")
    page.add_style_tag(path=str(ROOT/'content.css'))
    page.add_script_tag(path=str(ROOT/'rules.js'))
    page.add_script_tag(content=(ROOT/'content.js').read_text().replace('const host = location.hostname;', 'const host = "www.facebook.com";'))
    page.wait_for_selector('#label[data-humanfilter-hidden="true"] .humanfilter-notice')
    page.close()
    # YouTube Shorts cards now participate in Strict mode.
    page = browser.new_page()
    page.set_content('<ytd-reel-item-renderer id="short"><p>New AI short film</p></ytd-reel-item-renderer>')
    page.evaluate("""() => { window.chrome={storage:{local:{get:async()=>({settings:{mode:'strict'}})},onChanged:{addListener:()=>{}}}} }""")
    page.add_style_tag(path=str(ROOT/'content.css'))
    page.add_script_tag(path=str(ROOT/'rules.js'))
    page.add_script_tag(content=(ROOT/'content.js').read_text().replace('const host = location.hostname;', 'const host = "www.youtube.com";'))
    page.wait_for_selector('#short[data-humanfilter-hidden="true"] .humanfilter-notice')
    page.close()
    browser.close()
print('3 mocked site fixtures passed')
