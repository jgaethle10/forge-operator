import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {withOwnedNativeWorkflowXray} from '../systemia/chum/owned-native-offer-overlay.mjs';
import {publicPaymentOffer} from '../systemia/mcp/public-payment-offers.mjs';

const source=JSON.parse(fs.readFileSync(new URL('../public/.well-known/evercraft-machine-catalog.json',import.meta.url),'utf8'));

test('native Workflow X-Ray survives Machine Commerce snapshot regeneration, with exact paid contract',()=>{
 const native=publicPaymentOffer('workflow-xray');
 assert.equal(native.offer_key,'workflow_foundry.xray_250.v1');
 assert.equal(native.amount_cents,25000);
 assert.equal(native.currency,'usd');
 const offers=withOwnedNativeWorkflowXray(source.offers);
 const matches=offers.filter(x=>x.public_id==='workflow-foundry-xray-v1');
 assert.equal(matches.length,1);
 assert.equal(offers.length,source.offers.length+1);
 assert.equal(matches[0].commercial_state,'sell_now');
 assert.equal(matches[0].machine_state,'human_handoff_ready');
 assert.equal(matches[0].public_url,'https://fabric.systemiacommandcenters.com/offers/workflow-xray');
 assert.equal(matches[0].human_start_url_state,'public_https_verified');
 assert.equal(matches[0].offers[0].offer_key,native.offer_key);
 assert.equal(matches[0].offers[0].price_usd,250);
 assert.match(matches[0].confirmation,/provider-paid receipt/);
 // Rebuilds must not create duplicates if canonical Machine Commerce gains the same offer.
 assert.equal(withOwnedNativeWorkflowXray(offers).length,offers.length);
});

test('conflicting upstream Workflow X-Ray terms fail closed, and unrelated offers stay intact',()=>{
 const existing=withOwnedNativeWorkflowXray(source.offers);
 const wrongPrice=existing.map(x=>x.public_id==='workflow-foundry-xray-v1'
  ? {...x,offers:[{...x.offers[0],price_usd:299}]}
  : x);
 assert.throws(()=>withOwnedNativeWorkflowXray(wrongPrice),/workflow_xray_upstream_offer_conflict/);
 const wrongUrl=existing.map(x=>x.public_id==='workflow-foundry-xray-v1'
  ? {...x,public_url:'https://example.invalid/pay'}
  : x);
 assert.throws(()=>withOwnedNativeWorkflowXray(wrongUrl),/workflow_xray_upstream_offer_conflict/);
 assert.ok(existing.some(x=>x.public_id==='aliev-site-opportunity-snapshot-v1'));
 assert.ok(existing.some(x=>x.public_id==='rivet-site-underwriting-v1'));
});

test('both public CHUM generators consume the same native offer overlay',()=>{
 for(const path of ['build-capability-mirror.mjs','build-revenue-watershed.mjs']){
  const code=fs.readFileSync(new URL('../systemia/chum/'+path,import.meta.url),'utf8');
  assert.match(code,/withOwnedNativeWorkflowXray\(catalog\.offers/);
 }
});
