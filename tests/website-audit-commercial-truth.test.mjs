import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL('../'+path, import.meta.url),'utf8'));
const catalog=read('public/.well-known/evercraft-machine-catalog.json');
const directory=read('public/chum/capabilities.json');
const fulfillment=read('systemia/organism/product-fulfillment-registry.json');
const key='audit-center-website-audit-machine-v1';
const machine=catalog.offers.find(row=>row.public_id===key);
const publicEntry=directory.capabilities.find(row=>row.public_id===key);
const contract=fulfillment.products?.find(row=>row.public_id===key)
  || fulfillment.offers?.find(row=>row.public_id===key)
  || fulfillment.registry?.find(row=>row.public_id===key);

test('website audit has one consistent $49 scoped entry price',()=>{
 assert.ok(machine && publicEntry, 'source records must exist');
 assert.equal(machine.offers.find(o=>o.offer_key==='quick').price_usd,49);
 assert.equal(publicEntry.entry_paid_offer.price_usd_normalized,49);
 assert.match(machine.pricing,/\$49 one-time/);
 assert.equal(machine.pricing,publicEntry.pricing);
});
test('human-delivery contract is not represented as machine automatic fulfillment',()=>{
 assert.ok(contract, 'Systemia fulfillment registry record required');
 assert.equal(contract.human_review_before_delivery,true);
 assert.equal(machine.offers.find(o=>o.offer_key==='quick').fulfillment,'human_review_after_verified_payment');
 assert.equal(publicEntry.entry_paid_offer.fulfillment,'human_review_after_verified_payment');
 for(const str of [machine.pricing,machine.outputs,publicEntry.pricing,publicEntry.entry_paid_offer.scope]){
   assert.doesNotMatch(str,/machine[- ]fulfilled|automatic delivery|instant delivery/i);
   assert.match(str,/human.review/i);
 }
 assert.match(publicEntry.pricing,/five business days/i);
});
test('no claim of guaranteed rankings, automatic settlement, or untouched permissions',()=>{
 assert.doesNotMatch(machine.pricing,/guaranteed ranking|paid automatically/i);
 assert.equal(machine.offers.find(o=>o.offer_key==='quick').billing,'one_time');
 assert.equal(publicEntry.entry_paid_offer.billing,'one_time');
});
