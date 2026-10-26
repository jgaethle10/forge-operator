"""In-memory large dynamic-feed test, not a real-social-network integration test."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]/'extension'
N=300
with sync_playwright() as w:
    b=w.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page=b.new_page()
    errs=[]
    page.on('pageerror',lambda e:errs.append(str(e)))
    fixture=''.join(f'<shreddit-post id="card-{i}"><div class="body">'+('I made this with AI' if i % 6 == 0 else f'Nature photo #{i} and a nice human-made post')+'</div></shreddit-post>' for i in range(N))
    page.set_content(f'<!doctype html><body>{fixture}</body>')
    page.evaluate('''() => {window.chrome={storage:{local:{get:async()=>({})},onChanged:{addListener:fn=>{window.changeSettings=fn}}}}}''')
    page.add_style_tag(path=str(ROOT/'content.css'))
    page.add_script_tag(path=str(ROOT/'rules.js'))
    page.add_script_tag(content=(ROOT/'content.js').read_text().replace('const host = location.hostname;', 'const host = "www.reddit.com";'))
    page.wait_for_function('document.querySelectorAll("[data-humanfilter-hidden=true]").length === 50',timeout=15000)
    assert page.locator('.humanfilter-notice').count()==50
    assert page.locator('[data-humanfilter-revealed]').count()==0
    # Rapidly swap content in individual cards to emulate a scrolling feed.
    page.evaluate('''() => {
      for (let i=10; i<110; i++) {
        const x=document.querySelector('#card-'+i+' .body');
        x.textContent= i % 2 ? 'Generated using Midjourney' : 'Hikers at a pond';
      }
    }''')
    page.wait_for_function('document.querySelectorAll("[data-humanfilter-hidden=true]").length === 83',timeout=15000)
    assert page.locator('.humanfilter-notice').count()==83
    page.evaluate('''() => window.changeSettings({settings:{newValue:{enabled:false}}},'local')''')
    page.wait_for_function('document.querySelectorAll("[data-humanfilter-hidden=true]").length === 0',timeout=15000)
    assert page.locator('.humanfilter-notice').count()==0
    assert errs==[],errs
    print('PASS: 300 cards, 50 initial filters, 100 replacements, 83 expected filters, global pause and cleanup, no JS errors')
    b.close()
