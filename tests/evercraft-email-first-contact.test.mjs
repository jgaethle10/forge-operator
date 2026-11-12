import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = name => readFileSync(new URL('../'+name, import.meta.url),'utf8');

test('Evercraft public EPS and HAVENLY routes are email-first while founder line is unavailable',()=>{
  for(const file of ['public/eps/index.html','public/havenly/index.html']){
    const s=read(file);
    assert.match(s,/mailto:jessegaethle10@gmail\.com/);
    assert.doesNotMatch(s,/tel:|sms:|Call \(509\)|Text this request|Text HAVENLY|id="textRequest"|id="textQuote"/i);
    assert.match(s,/review and send/i);
  }
});
test('Fabric human payment assistance never routes to inactive phone',()=>{
  const s=read('systemia/mcp/fabric-public-site.mjs');
  assert.doesNotMatch(s,/tel:\+15097590440|Call Evercraft/);
  assert.match(s,/Email Evercraft for invoicing/);
  assert.match(s,/Email Evercraft for payment help/);
});
test('Evercraft embedded front door reflects the same contact policy',async()=>{
  const {EPS_HTML,HAVENLY_HTML}=await import('../infra/evercraft-edge/service-frontdoor/embedded-sites.mjs');
  const eps=read('public/eps/index.html'), havenly=read('public/havenly/index.html');
  assert.equal(EPS_HTML,eps);
  assert.equal(HAVENLY_HTML,havenly);
  for(const page of [EPS_HTML,HAVENLY_HTML])assert.doesNotMatch(page,/tel:|sms:/i);
});
