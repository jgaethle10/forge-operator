"""Chromium QA of real content code, using in-memory fixtures because navigation is sandbox-blocked."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / 'extension'

def add_extension_scripts(page, host='www.reddit.com'):
    page.evaluate("""() => {
      window.__onSettingsChanged = null;
      window.chrome = {storage: {
        local: {get:async()=>({})},
        onChanged: {addListener: fn => {window.__onSettingsChanged=fn}}
      }};
    }""")
    page.add_style_tag(path=str(ROOT/'content.css'))
    page.add_script_tag(path=str(ROOT/'rules.js'))
    code=(ROOT/'content.js').read_text().replace('const host = location.hostname;', f'const host = "{host}";')
    page.add_script_tag(content=code)

with sync_playwright() as p:
  browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
  page=browser.new_page()
  errors=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  page.set_content('<html><body><shreddit-post id="slot">I made this with AI today</shreddit-post></body></html>')
  add_extension_scripts(page)
  page.wait_for_selector('#slot[data-humanfilter-hidden="true"] .humanfilter-notice')
  page.locator('#slot .humanfilter-notice button').click()
  assert page.locator('#slot[data-humanfilter-revealed="true"]').count()==1
  # Rescan must preserve reveal for same item.
  page.evaluate("""() => document.querySelector('#slot').append(document.createTextNode(''))""")
  page.wait_for_timeout(180)
  assert page.locator('#slot[data-humanfilter-hidden="true"]').count()==0
  # Replace contents in the *same element* (virtualized lists reuse cards).
  page.evaluate("""() => {let s=document.querySelector('#slot');s.replaceChildren(document.createTextNode('Made using Midjourney'));}""")
  page.wait_for_selector('#slot[data-humanfilter-hidden="true"] .humanfilter-notice')
  assert page.locator('#slot[data-humanfilter-revealed="true"]').count()==0
  # Replace with normal content; it must become visible.
  page.evaluate("""() => {let s=document.querySelector('#slot');s.replaceChildren(document.createTextNode('Normal human discussion of hiking'));}""")
  page.wait_for_function("document.querySelector('#slot').hasAttribute('data-humanfilter-hidden') === false")
  # Manual user keyword and strict mode.
  page.evaluate("""() => window.__onSettingsChanged({settings:{newValue:{enabled:true,mode:'strict'}}},'local')""")
  page.evaluate("""() => {let s=document.querySelector('#slot');s.replaceChildren(document.createTextNode('Should we debate ChatGPT?'));}""")
  page.wait_for_selector('#slot[data-humanfilter-hidden="true"] .humanfilter-notice')
  # Pause and leave post alone.
  page.evaluate("""() => window.__onSettingsChanged({settings:{newValue:{enabled:false,mode:'strict'}}},'local')""")
  page.wait_for_function("document.querySelector('#slot').hasAttribute('data-humanfilter-hidden') === false")
  # No exceptions.
  assert not errors,errors
  print('PASS: reveal preserved for same post, revoked on recycled card, normal post restored, strict mode, pause')
  browser.close()
