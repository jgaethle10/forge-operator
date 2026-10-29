import test from 'node:test';
import assert from 'node:assert/strict';
import {renderForensiScopeBuyerPage} from '../systemia/mcp/forensiscope-sales-page.mjs';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

test('ForensiScope buyer page renders every published duration-price tier without inventing checkout',()=>{
 const html=renderForensiScopeBuyerPage();
 for(const [duration,price] of [
  ['Up to 5 minutes',15],['Up to 30 minutes',35],['Up to 2 hours',75],
  ['Up to 6 hours',149],['Up to 12 hours',249]
 ]){
  assert.ok(html.includes(duration),'Duration missing: '+duration);
  assert.ok(html.includes('$'+price),'Price missing: '+price);
 }
 assert.equal((html.match(/class="tier"/g)||[]).length,5);
 assert.equal((html.match(/class="choose"/g)||[]).length,5);
 assert.match(html,/Evercraft Payments/);
 assert.match(html,/secure intake/);
 assert.match(html,/do not charge|does not charge/i);
 assert.ok(!/base44|buy.stripe|checkout.stripe/i.test(html));
 assert.doesNotMatch(html,/<form|type="file"/i);
});
test('ForensiScope public page is available even when payment backend is held',async()=>{
 const rt=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,purchaseIntentUrl:'',paymentOpsUrl:''});
 try{
  const response=await fetch(rt.url+'/forensiscope');
  assert.equal(response.status,200);
  assert.ok(response.headers.get('content-type').includes('text/html'));
  const html=await response.text();
  assert.match(html,/Understand the whole recording/);
  assert.match(html,/Request review/);
  assert.doesNotMatch(html,/Continue to checkout/);
  const offers=await fetch(rt.url+'/offers').then(x=>x.text());
  assert.ok(offers.includes('ForensiScope'));
  assert.ok(offers.includes('href="/forensiscope"'));
    const sitemap=await fetch(rt.url+'/sitemap.xml').then(x=>x.text());
  assert.ok(sitemap.includes('https://fabric.systemiacommandcenters.com/forensiscope'));
 } finally { await rt.close(); }
});
