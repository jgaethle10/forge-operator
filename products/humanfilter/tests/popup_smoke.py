"""Verifies actual popup HTML and settings persistence against a mocked chrome.storage API."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[1]
ext = root/'extension'
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = b.new_page(viewport={'width':420,'height':850}, device_scale_factor=2)
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.evaluate("""(() => {
        window.__saved = null;
        window.chrome = {
            storage: { local: {
                get: async () => ({settings: window.__saved}),
                set: async values => {window.__saved = values.settings;}
            } }
        };
    })();""")
    html = (ext/'popup.html').read_text().replace('<link rel="stylesheet" href="popup.css">', '').replace('<script defer src="rules.js"></script>', '').replace('<script defer src="popup.js"></script>', '')
    def show_popup():
        page.set_content(html)
        page.add_style_tag(path=str(ext/'popup.css'))
        page.add_script_tag(path=str(ext/'rules.js'))
        page.add_script_tag(path=str(ext/'popup.js'))
    show_popup()
    page.wait_for_function("document.querySelector('#enabled').checked === true")
    assert page.locator('input[name="mode"][value="balanced"]').is_checked()
    page.locator('input[name="mode"][value="strict"]').check()
    page.wait_for_function("window.__saved?.mode === 'strict'")
    page.locator('#reddit').uncheck()
    page.wait_for_function("window.__saved?.sites?.reddit === false")
    page.locator('#keywords').fill('Sponsored, Virtual assistant')
    page.wait_for_function("window.__saved?.customKeywords?.length === 2")
    page.locator(".switch span").click()
    page.wait_for_function("window.__saved?.enabled === false")
    show_popup()
    page.wait_for_function("document.querySelector('#enabled').checked === false")
    assert page.locator('input[name="mode"][value="strict"]').is_checked()
    assert not page.locator('#reddit').is_checked()
    assert 'Sponsored' in page.locator('#keywords').input_value()
    # Restore a clean defaults preview for accurate visual artifact.
    page.evaluate("window.__saved = null")
    show_popup()
    page.wait_for_function("document.querySelector('#enabled').checked === true")
    page.screenshot(path=str(root/'HumanFilter-popup-preview.png'),full_page=True)
    assert not errors, errors
    b.close()
print('popup/settings smoke passed; screenshot reflects the actual extension popup HTML')
