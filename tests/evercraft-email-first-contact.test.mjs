import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = name => readFileSync(new URL('../'+name, import.meta.url),'utf8');

test('Only EPS follows founder's emergency email-first contact policy',()=>{
  const s=read('public/eps/index.html');
  assert.match(s,/mailto:jessegaethle10@gmail\.com/);
  assert.doesNotMatch(s,/tel:|sms:|Call \(509\)|Text this request|id="textQuote"/i);
  assert.match(s,/review and send/i);
});
test('HAVENLY remains Nikki-controlled and no inquiries are routed to founder email',()=>{
  const s=read('public/havenly/index.html');
  for(const marker of ['mailto:havenlycleaning@gmail.com','tel:+15095605190','sms:+15095605190','id="textRequest"']) assert.ok(s.includes(marker));
  assert.doesNotMatch(s,/mailto:jessegaethle10@gmail\.com/);
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
  assert.doesNotMatch(EPS_HTML,/tel:|sms:/i);
  assert.match(HAVENLY_HTML,/mailto:havenlycleaning@gmail\.com/);
  assert.match(HAVENLY_HTML,/sms:\+15095605190/);
});
