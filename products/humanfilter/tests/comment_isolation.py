"""Synthetic parent-post vs nested-comment precision tests with actual Chromium content script.
These fixtures are NOT live Facebook, Reddit or YouTube integration tests.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]/'extension'
def install(page, host="www.reddit.com"):
    page.evaluate("""() => {
      window.chrome={storage:{
        local:{get:async()=>({})},
        onChanged:{addListener:fn=>{window.hfSettingsChanged=fn}}
      }};
    }""")
    page.add_style_tag(path=str(ROOT/'content.css'))
    page.add_script_tag(path=str(ROOT/'rules.js'))
    js=(ROOT/'content.js').read_text().replace(
        'const host = location.hostname;', f'const host = "{host}";')
    page.add_script_tag(content=js)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page()
    errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.set_content('''<!doctype html><body>
      <shreddit-post id="human">
        <div class="title">Mountain trail photo by a human photographer</div>
        <a href="/r/hiking/comments/post-human">Permalink</a>
        <shreddit-comment><p aria-label="Made with AI">I made this with AI</p>
          <a href="/r/test/comments/ai-comment">comment link</a>
        </shreddit-comment>
      </shreddit-post>
      <shreddit-post id="target">
        <div>HumanFilter example</div><span aria-label="AI info">Generated clip label</span>
        <a href="/r/art/comments/post-ai">Permalink</a>
      </shreddit-post>
      <shreddit-post id="recycled">
        <a class="permalink" href="/r/art/comments/first">Permalink</a>
        <p class="caption">Made using Midjourney</p>
      </shreddit-post>
    </body>''')
    install(page)
    page.wait_for_function("document.querySelector('#target').hasAttribute('data-humanfilter-hidden')")
    page.wait_for_function("document.querySelector('#recycled').hasAttribute('data-humanfilter-hidden')")
    assert page.locator('#human[data-humanfilter-hidden]').count()==0, 'comment AI label must not hide human parent'
    assert page.locator('#target[data-humanfilter-hidden="true"]').count()==1, 'genuine label still filtered'
    assert page.locator('#recycled[data-humanfilter-hidden="true"]').count()==1
    page.locator('#recycled .humanfilter-notice button').click()
    assert page.locator('#recycled[data-humanfilter-revealed="true"]').count()==1
    # Same visible text, but the virtualized card now points at a different post.
    page.evaluate("""() => {
      document.querySelector('#recycled .permalink').setAttribute('href','/r/art/comments/second');
      document.querySelector('#recycled').append(document.createTextNode(''));
    }""")
    page.wait_for_function("document.querySelector('#recycled').getAttribute('data-humanfilter-hidden') === 'true'")
    assert page.locator('#recycled[data-humanfilter-revealed="true"]').count()==0
    # When main post changes to a human post, it must become visible despite AI reply.
    page.evaluate("""() => {
      const t=document.querySelector('#target');
      t.replaceChildren(document.createTextNode('A sunset hiking photo by a real photographer'));
      const comment=document.createElement('shreddit-comment');
      comment.innerHTML='<span aria-label="Made with AI">Generated reply</span>';
      t.append(comment);
    }""")
    page.wait_for_function("!document.querySelector('#target').hasAttribute('data-humanfilter-hidden')")
    assert not errors,errors
    print('PASS nested comment isolation, authentic disclosure, post-permalink recycle, human-card restoration')
    browser.close()
