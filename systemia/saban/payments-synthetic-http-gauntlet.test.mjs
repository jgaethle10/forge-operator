import test from 'node:test';
import assert from 'node:assert/strict';
import {runSabanSyntheticHttpGauntlet} from './payments-synthetic-http-gauntlet.mjs';

test('independent Saban HTTP buyer clients exercise invoices and all seven rails without real money',async()=>{
  const report=await runSabanSyntheticHttpGauntlet({concurrency:4});
  assert.equal(report.status,'pass');
  assert.equal(report.transport,'real_http_loopback_only');
  assert.equal(report.host,'127.0.0.1');
  assert.equal(report.physical_nodes_proven,1);
  assert.ok(report.independent_http_client_processes_launched>=40);
  assert.equal(report.http_server_process_restarts,1);
  assert.equal(report.simulated_invoice_price_cents,1900);
  assert.deepEqual(report.rails.map(x=>x.rail),[
    'cash','check','bank_transfer','zelle_business',
    'paypal_business','venmo_business','cash_app_business'
  ]);
  assert.ok(report.rails.every(x=>x.synthetic_http_passed&&x.actual_settlement_verified===false));
  assert.deepEqual(report.concurrency,{contenders:2,committed:1,conflicted:1,final_version:2});
  assert.equal(report.replay_idempotence_verified,true);
  assert.equal(report.customer_claim_never_paid,true);
  assert.equal(report.unauthenticated_access_rejected,true);
  assert.equal(report.unauthorized_money_operations_rejected,true);
  assert.equal(report.merchant_payment_destinations_shared,false);
  assert.equal(report.real_payment_provider_requests,0);
  assert.equal(report.actual_money_processed,false);
  assert.equal(report.external_settlement_verified,false);
  assert.equal(report.public_checkout_verified,false);
  assert.equal(report.fulfillment_released,false);
  assert.equal(report.quality.status,'pass');
  assert.deepEqual(report.quality.missing_roles,[]);
  assert.equal(report.quality.dead_letter,0);
});
test('HTTP gauntlet rejects uncontrolled concurrency',async()=>{
  await assert.rejects(runSabanSyntheticHttpGauntlet({concurrency:0}),/bounded_http/);
  await assert.rejects(runSabanSyntheticHttpGauntlet({concurrency:100}),/bounded_http/);
});
