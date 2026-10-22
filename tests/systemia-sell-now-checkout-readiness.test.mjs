import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const load=(path)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const snapshot=load('../systemia/payments/readiness/sell-now-2026-10-22.json');
const catalog=load('../public/chum/capabilities.json');

test('each current sell-now listing appears once in the payment readiness ledger',()=>{
  assert.equal(snapshot.schema,'evercraft.payments.sell-now-readiness-snapshot.v1');
  const ids=(catalog.capabilities||[])
    .filter(c=>c.commercial_state==='sell_now')
    .map(c=>c.public_id).sort();
  const observed=snapshot.entries.map(e=>e.public_id).sort();
  assert.deepEqual(observed,ids);
  assert.equal(new Set(observed).size,observed.length);
  assert.equal(snapshot.reconciliation.sell_now_count,observed.length);
});

test('provider price inventory is only evidence of a candidate, not a sellable checkout',()=>{
  const catalogById=new Map(catalog.capabilities.map(x=>[x.public_id,x]));
  const candidates=snapshot.entries.filter(e=>e.provider_candidate);
  assert.equal(snapshot.reconciliation.exact_provider_price_candidates,candidates.length);
  assert.equal(snapshot.reconciliation.no_exact_provider_price_candidate,
    snapshot.entries.length-candidates.length);
  for(const entry of snapshot.entries){
    const catalogEntry=catalogById.get(entry.public_id);
    assert.ok(catalogEntry,entry.public_id);
    assert.equal(entry.entry_price_usd,Number(catalogEntry.entry_paid_offer?.price_usd_normalized),
      entry.public_id+': catalog price drift');
    assert.equal(entry.currency,'usd');
    assert.equal(entry.verified_live_checkout_url,null);
    assert.equal(entry.canonical_order_verified,false);
    assert.equal(entry.settlement_verified,false);
    assert.equal(entry.fulfillment_verified,false);
    assert.equal(entry.release_state,'held_checkout_unverified');
    if(entry.provider_candidate){
      assert.match(entry.provider_candidate.product_id,/^prod_[A-Za-z0-9]+$/);
      assert.match(entry.provider_candidate.price_id,/^price_[A-Za-z0-9]+$/);
      assert.equal(entry.provider_candidate.provider_price_read_verified,true);
      assert.equal(entry.provider_candidate.checkout_verified,false);
      assert.equal(entry.provider_candidate.authoritative_evercraft_order_verified,false);
      assert.ok(['Evercraft Media & Technologies','Systemia Forge','Systemia'].includes(entry.provider_candidate.merchant));
    }
  }
  assert.equal(snapshot.reconciliation.verified_sell_now_checkout_urls,0);
  assert.equal(snapshot.reconciliation.verified_canonical_paid_orders,0);
});

test('runtime payment release and governance remain fail-closed',()=>{
  assert.equal(snapshot.live_fabric.checkout_purchase_intent_configured,false);
  assert.equal(snapshot.live_fabric.checkout_direct_offer_ops_configured,false);
  assert.equal(snapshot.live_fabric.deployment_receipt_bound,false);
  assert.ok(snapshot.entries.find(e=>e.public_id==='rivet-site-underwriting-v1')
    ?.required_preflight.includes('governance_hold'));
  assert.ok(snapshot.rules.some(r=>r.includes('ChatGPT plugin')));
  assert.ok(snapshot.rules.some(r=>r.includes('Base44')));
});
