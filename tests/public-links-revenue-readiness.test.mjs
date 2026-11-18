import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const report=JSON.parse(execFileSync(process.execPath,['scripts/audit-public-links.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
test('revenue reporting distinguishes source matches from current checkout proof',()=>{
  assert.equal(report.mode,'source_only');
  assert.equal(report.no_payment_attempted,true);
  assert.equal(report.no_legacy_provider_contact,true);
  const r=report.revenue_readiness;
  assert.equal(r.native_checkout.checkout_ready,false);
  assert.equal(r.native_checkout.may_charge_customers,false);
  assert.equal(r.native_checkout.authenticated_provider_paid_receipt_observed,false);
  assert.equal(r.processor_snapshot.live_verified_now,false);
  assert.equal(r.processor_snapshot.payment_received_verified,false);
  assert.equal(r.processor_snapshot.automatic_reconciliation_proven,false);
  assert.equal(r.products.length,7);
  assert.equal(r.source_consistency_findings.length,0,JSON.stringify(r.source_consistency_findings));
  for(const p of r.products){
    assert.equal(p.source_page_present,true,p.sku_key);
    assert.equal(p.exact_sku_source_consistent,true,p.sku_key);
    assert.equal(p.public_url_verified,false);
    assert.equal(p.processor_form_verified_now,false);
    assert.equal(p.payment_received_verified,false);
    assert.equal(p.fulfillment_verified,false);
  }
});
test('archived legacy payment routes remain quarantined',()=>{
 assert.equal(report.archived_legacy_offers.length,13);
 assert.ok(report.archived_legacy_offers.every(x=>x.contact_prohibited===true));
 assert.equal(report.scope.payment_links_in_snapshot,7);
});
