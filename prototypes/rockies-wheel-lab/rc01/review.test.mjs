import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const html=readFileSync(new URL('./review.html',import.meta.url),'utf8');
const source=html.split('<script>')[1]?.split('</script>')[0];

test('review portal is a source-only, offline and noindex local composition',()=>{
  assert.ok(source);
  assert.doesNotThrow(()=>new Script(source));
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html, /src="\.\/index\.html"/);
  assert.match(html, /'\.\/merchant-desk\.html'/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/);
  assert.doesNotMatch(html, /<form\b/i);
  assert.match(html, /NOT A LIVE MERCHANT SERVICE/);
  assert.match(html, /Systemia admission/);
});

test('review tabs safely switch locally without remote navigation or consumer data transfer',()=>{
  const ids=['reviewFrame','tab-shopper','tab-merchant','stepTitle','stepDescription','openFullscreen'];
  const els=Object.fromEntries(ids.map(id=>[id,{
    attrs:{},listeners:{},src:'',title:'',textContent:'',
    setAttribute(key,value){this.attrs[key]=value},
    addEventListener(name,fn){this.listeners[name]=fn}
  }]));
  new Script(source).runInContext(createContext({document:{getElementById(id){
    assert.ok(els[id]);return els[id];
  }}}));
  els['tab-merchant'].listeners.click();
  assert.equal(els.reviewFrame.src,'./merchant-desk.html');
  assert.equal(els.openFullscreen.href,'./merchant-desk.html');
  assert.equal(els['tab-merchant'].attrs['aria-selected'],'true');
  assert.match(els.stepTitle.textContent,/shop-reviewed estimate/);
  els['tab-shopper'].listeners.click();
  assert.equal(els.reviewFrame.src,'./index.html');
  assert.equal(els.openFullscreen.href,'./index.html');
  assert.equal(els['tab-shopper'].attrs['aria-selected'],'true');
});
