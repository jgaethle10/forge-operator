import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../systemia/saban/production-capacity-radar.mjs',import.meta.url),'utf8');

test('capacity radar covers ingress, RIVET, and AliEV separately',()=>{
  for(const role of ['public_ingress','rivet_runtime','aliev_source_store']){
    assert.match(src,new RegExp("role:'"+role+"'"));
  }
  assert.match(src,/require_public_ingress:true/);
  assert.match(src,/require_persistent_storage:true/);
});

test('capacity radar is discovery-only and cannot spend',()=>{
  assert.match(src,/negotiation_level:'discover'/);
  assert.match(src,/market_order_created:false/);
  assert.match(src,/paid_lease_created:false/);
  assert.match(src,/no_paid_lease_without_explicit_spend_authority:true/);
});

test('capacity radar returns ranked backup candidates',()=>{
  assert.match(src,/rankComputeOffers/);
  assert.match(src,/top_candidates:ranking\.eligible\.slice\(0,5\)/);
  assert.match(src,/selected_candidate/);
});

test('capacity radar preserves authorization boundary',()=>{
  assert.match(src,/visibility_is_not_authorization:true/);
  assert.match(src,/discovered_capacity_is_not_leased_capacity:true/);
  assert.match(src,/prefer_owned_or_authorized_zero_cost_capacity:true/);
});
