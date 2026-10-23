import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const product=read('public/products/systemia-relationship-command/index.html');
const demo=read('public/demos/systemia-relationship-command/index.html');

test('product and preview pages explicitly disclose non-production status',()=>{
 for(const page of [product,demo]){
   assert.match(page,/<meta name="viewport"/);
   assert.match(page,/synthetic|fictional/i);
   assert.match(page,/no.+payment|checkout.+not|no.+checkout/i);
   assert.match(page,/no.+customer|customer.+not|no.+contact|nothing.+connect/i);
   assert.doesNotMatch(page,/type=["']?password/);
   assert.doesNotMatch(page,/<form\b/i);
   assert.doesNotMatch(page,/https?:\/\/api\.(stripe|resend)\.com/i);
 }
});
test('public preview links are local and do not impersonate active checkout',()=>{
 assert.match(product,/href="\/demos\/systemia-relationship-command\/"/);
 assert.match(product,/id="pilot"/);
 assert.doesNotMatch(product,/href="https?:\/\/buy\.stripe\.com/);
 assert.doesNotMatch(product,/mailto:/i);
});
test('interactive dashboard has active navigation and review controls',()=>{
 for(const name of ['overview','relationships','queue','trust']){
   assert.match(demo,new RegExp('data-tab="'+name+'"'));
   assert.match(demo,new RegExp('id="'+name+'"'));
 }
 for(const id of ['stats','highlights','rel-list','details','queue-list','search','filter'])
   assert.match(demo,new RegExp('id="'+id+'"'));
 assert.match(demo,/No message was sent\./);
 assert.match(demo,/Session-only note/);
 assert.match(demo,/aria-live="polite"/);
});
test('inline interactive script is syntactically valid and has no remote send or storage hooks',()=>{
 const scripts=[...demo.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new vm.Script(scripts[0][1],{filename:'systemia-relationship-preview.js'}));
 assert.doesNotMatch(scripts[0][1],/\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|sendBeacon)\s*(\(|\.|\[)/);
 assert.doesNotMatch(scripts[0][1],/\.innerHTML\s*=/);
 assert.doesNotMatch(scripts[0][1],/\bFormData\b/);
});
test('all preview cases are fictional and client note input uses text nodes',()=>{
 assert.match(demo,/Northwind Historical Center/);
 assert.match(demo,/Redwood Trade Services/);
 assert.match(demo,/Beacon Systems Collective/);
 assert.match(demo,/textContent=text/);
 assert.match(demo,/textarea\.value\.trim\(\)/);
 assert.doesNotMatch(demo,/Paola|Pattie Graffe|Yakima Valley Trolleys/);
});


test('commercial offer is explicitly not paid, subscribed or production-provisioned',()=>{
 const offer=JSON.parse(read('systemia/crm/commercial-offer.json'));
 assert.equal(offer.schema,'evercraft.crm.commercial-offer.v1');
 assert.equal(offer.state,'development_preview');
 assert.equal(offer.billing.checkout_enabled,false);
 assert.equal(offer.billing.subscriptions_enabled,false);
 assert.equal(offer.access.self_service_registration,false);
 assert.equal(offer.verification.production_crm_deployed,false);
 assert.equal(offer.verification.live_public_checkout_verified,false);
 assert.ok(offer.readiness_gates.length>=8);
 assert.equal(offer.public_surfaces.interactive_preview,'/demos/systemia-relationship-command/');
});
