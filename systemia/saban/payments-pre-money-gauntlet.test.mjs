import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {runSabanPreMoneyGauntlet} from './payments-pre-money-gauntlet.mjs';

test('Saban launches independent child processes and tests every approved rail before money moves',async()=>{
  const r=await runSabanPreMoneyGauntlet({maxConcurrent:4});
  assert.equal(r.status,'pass');
  assert.equal(r.execution_fabric,'isolated_local_os_processes');
  assert.equal(r.physical_nodes_proven,1);
  assert.ok(r.independent_worker_processes_launched>=30);
  assert.equal(r.bounded_concurrency,4);
  assert.deepEqual(r.rail_cases.map(x=>x.rail),[
    'cash','check','bank_transfer','zelle_business',
    'paypal_business','venmo_business','cash_app_business'
  ]);
  assert.ok(r.rail_cases.every(x=>x.passed===true&&x.provider_settlement_tested===false));
  assert.deepEqual(r.same_order_concurrent_writers,{
    attempted:2,committed:1,rejected:1,final_order_version:2
  });
  assert.equal(r.buyer_claim_tested,true);
  assert.equal(r.unverified_claim_never_paid,true);
  assert.equal(r.duplicate_replay_blocked,true);
  assert.equal(r.unauthorized_paid_and_delivery_attempts_blocked,true);
  assert.equal(r.restart_readback_verified,true);
  assert.equal(r.no_provider_credentials,true);
  assert.equal(r.external_money_movement_attempted,false);
  assert.equal(r.real_bank_or_provider_settlement_verified,false);
  assert.equal(r.customer_funds_processed,false);
  assert.equal(r.public_buyer_checkout_verified,false);
  assert.equal(r.quality.status,'pass');
  assert.deepEqual(r.quality.missing_roles,[]);
  assert.equal(r.quality.completion_ratio,1);
  assert.equal(r.quality.dead_letter,0);
});
test('Saban cannot expand worker concurrency beyond bounded local contract',async()=>{
  await assert.rejects(runSabanPreMoneyGauntlet({maxConcurrent:0}),/cap_invalid/);
  await assert.rejects(runSabanPreMoneyGauntlet({maxConcurrent:9000}),/cap_invalid/);
});
test('worker cannot run against a live or arbitrary order path',()=>{
  const worker=path.resolve('systemia/saban/payments-pre-money-worker.mjs');
  const x=spawnSync(process.execPath,[worker,'create','/var/lib/evercraft/payments','buyer-00000000-0000-4000-8000-000000000000'],{
    env:{EVERCRAFT_PAYMENTS_TEST_ONLY:'1',PATH:process.env.PATH||'/usr/bin:/bin'},
    encoding:'utf8',
    timeout:3000,
  });
  assert.notEqual(x.status,0);
  assert.match(x.stderr,/synthetic_ledger_path_required/);
  const y=spawnSync(process.execPath,[worker,'create',os.tmpdir(),'buyer-00000000-0000-4000-8000-000000000000'],{
    env:{PATH:process.env.PATH||'/usr/bin:/bin'},
    encoding:'utf8',
    timeout:3000,
  });
  assert.notEqual(y.status,0);
  assert.match(y.stderr,/test_worker_not_authorized/);
});
