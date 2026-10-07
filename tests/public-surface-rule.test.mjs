import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const candidates=JSON.parse(fs.readFileSync('registry/public-surface-candidates.json','utf8'));
const directory=JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json','utf8'));
const byKey=new Map((directory.products||[]).map((p)=>[p.product_key,p]));
const publicRequired=new Set(['demonstrable','commercial_ready','sell_now']);

test('demonstrable products have a truthful public surface',()=>{
  for(const candidate of candidates.candidates||[]){
    if(!publicRequired.has(candidate.surface_state))continue;
    const product=byKey.get(candidate.product_key);
    assert.ok(product,'Missing public product directory entry for '+candidate.product_key);
    assert.match(String(product.canonical_url||''),/^https:\/\//);
    assert.ok(Array.isArray(product.intents)&&product.intents.length>0,'Missing intents for '+candidate.product_key);
    assert.ok(Array.isArray(product.boundaries)&&product.boundaries.length>0,'Missing boundaries for '+candidate.product_key);

    if(candidate.commercial_state==='not_for_sale_yet'){
      assert.equal(product.commercial?.status,'not_for_sale_yet');
      assert.notEqual(product.commercial?.machine_commerce_handoff?.state,'live_verified');
      assert.ok(!product.buyer_frontage_url,'Not-for-sale product must not declare buyer frontage.');
      assert.ok(!product.human_start_url,'Unverified owned-host route must not be promoted as a human start URL.');
    }
  }
});

test('inventory existence alone still does not auto-publish',()=>{
  assert.match(String(candidates.policy),/Inventory alone never grants publication/);
});
