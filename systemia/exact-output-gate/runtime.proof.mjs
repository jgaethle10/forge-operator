#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableEntityStore } from '../app-fabric/entity-store.mjs';
import { EvercraftExactOutputGate } from './runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-exact-output-proof-'));
let clock=new Date('2026-10-01T17:00:00.000Z');
const appKey='systemia-command-center';

try{
  const store=new DurableEntityStore({stateDir:path.join(root,'entities')});
  const gate=new EvercraftExactOutputGate({
    entityStore:store,
    appKey,
    clock:()=>clock
  });

  assert.equal(gate.health().source_platform_dependency,false);
  assert.equal(gate.health().human_visible_mismatch_reopens_release,true);

  store.create(appKey,'SystemiaReleasePolicy',{
    id:'policy-live-software',
    policy_key:'release.live-software.strict.v1',
    name:'Live software strict proof',
    version:'proof-v1',
    require_hash:true,
    require_revision:true,
    require_exact_output_locator:true,
    require_source_truth:true,
    require_visual:false,
    require_execution:true,
    require_stale_check:true,
    require_human_confirmation:false,
    max_verification_age_minutes:10,
    dependency_policy:'block_on_any_upstream_hold',
    release_on_pass:'send_ready',
    status:'active',
    updated_at:clock.toISOString()
  });

  const baseReceipt=(id,key,product,hash,revision)=>({
    id,
    receipt_key:key,
    release_type:'software',
    product,
    surface:'public-web',
    policy_key:'release.live-software.strict.v1',
    risk_tier:'standard',
    intended_hash:hash,
    intended_revision:revision,
    exact_output_locator:'https://owned.example.invalid/'+key,
    source_truth_state:'passed',
    visual_state:'not_required',
    execution_state:'passed',
    stale_output_check:'passed',
    human_confirmation_state:'not_required',
    release_state:'verify',
    created_at:clock.toISOString()
  });

  store.create(appKey,'SystemiaReleaseReceipt',
    baseReceipt('receipt-upstream','upstream-v1','Upstream Product','sha256:aaa','rev-a')
  );
  store.create(appKey,'SystemiaReleaseReceipt',
    baseReceipt('receipt-downstream','downstream-v1','Downstream Product','sha256:bbb','rev-b')
  );

  let upstream=gate.execute({
    action:'attest',
    receipt_key:'upstream-v1',
    observed_hash:'sha256:aaa',
    observed_revision:'rev-a'
  },'proof-admin');
  assert.equal(upstream.verdict.pass,true);
  assert.equal(upstream.receipt.release_state,'send_ready');
  assert.ok(upstream.receipt.verified_at);

  let downstream=gate.execute({
    action:'attest',
    receipt_key:'downstream-v1',
    observed_hash:'sha256:bbb',
    observed_revision:'rev-b'
  },'proof-admin');
  assert.equal(downstream.receipt.release_state,'send_ready');

  const linked=gate.execute({
    action:'link-dependency',
    receipt_key:'downstream-v1',
    upstream_receipt_key:'upstream-v1',
    dependency_key:'upstream-v1->downstream-v1'
  },'proof-admin');
  assert.equal(linked.verdict.pass,true);
  assert.equal(linked.receipt.release_state,'send_ready');

  clock=new Date('2026-10-01T17:05:00.000Z');
  const reopened=gate.execute({
    action:'human-mismatch',
    receipt_key:'upstream-v1',
    reason:'Human-visible route still showed the prior revision.',
    evidence:{source:'synthetic-proof'}
  },'human-proof');
  assert.equal(reopened.release_state,'blocked');
  assert.deepEqual(reopened.downstream_reopened,['downstream-v1']);
  assert.equal(gate.findReceipt('downstream-v1').release_state,'blocked');

  clock=new Date('2026-10-01T17:06:00.000Z');
  upstream=gate.execute({
    action:'attest',
    receipt_key:'upstream-v1',
    observed_hash:'sha256:aaa',
    observed_revision:'rev-a',
    human_confirmation_state:'passed',
    stale_output_check:'passed',
    visual_state:'not_required'
  },'proof-admin');
  assert.equal(upstream.receipt.release_state,'send_ready');

  downstream=gate.execute({
    action:'evaluate',
    receipt_key:'downstream-v1'
  },'proof-admin');
  assert.equal(downstream.receipt.release_state,'send_ready');
  assert.equal(downstream.verdict.dependency_state,'passed');

  clock=new Date('2026-10-01T17:07:00.000Z');
  const mismatch=gate.execute({
    action:'attest',
    receipt_key:'upstream-v1',
    observed_hash:'sha256:wrong',
    observed_revision:'rev-a',
    human_confirmation_state:'passed',
    stale_output_check:'passed'
  },'proof-admin');
  assert.equal(mismatch.receipt.release_state,'blocked');
  assert.ok(mismatch.verdict.failures.includes('hash_mismatch'));
  assert.deepEqual(mismatch.downstream_reopened,['downstream-v1']);
  assert.equal(gate.findReceipt('downstream-v1').release_state,'blocked');

  clock=new Date('2026-10-01T17:08:00.000Z');
  upstream=gate.execute({
    action:'attest',
    receipt_key:'upstream-v1',
    observed_hash:'sha256:aaa',
    observed_revision:'rev-a',
    human_confirmation_state:'passed',
    stale_output_check:'passed'
  },'proof-admin');
  assert.equal(upstream.receipt.release_state,'send_ready');
  downstream=gate.execute({action:'evaluate',receipt_key:'downstream-v1'},'proof-admin');
  assert.equal(downstream.receipt.release_state,'send_ready');

  clock=new Date('2026-10-01T17:19:01.000Z');
  const expired=gate.execute({
    action:'evaluate',
    receipt_key:'upstream-v1'
  },'proof-admin');
  assert.equal(expired.receipt.release_state,'verify');
  assert.ok(expired.verdict.pending.includes('verification_expired'));
  assert.equal(expired.receipt.verified_at,null);

  clock=new Date('2026-10-01T17:20:00.000Z');
  const refreshed=gate.execute({
    action:'attest',
    receipt_key:'upstream-v1',
    observed_hash:'sha256:aaa',
    observed_revision:'rev-a',
    human_confirmation_state:'passed',
    stale_output_check:'passed'
  },'proof-admin');
  assert.equal(refreshed.receipt.release_state,'send_ready');

  const superseded=gate.execute({
    action:'supersede',
    receipt_key:'upstream-v1',
    successor_receipt_key:'upstream-v2'
  },'proof-admin');
  assert.equal(superseded.receipt.release_state,'superseded');
  assert.deepEqual(superseded.downstream_reopened,['downstream-v1']);
  assert.equal(gate.findReceipt('downstream-v1').release_state,'blocked');

  const events=store.list(appKey,'SystemiaReleaseGateEvent',{sort:'created_at',limit:200});
  assert.ok(events.some((row)=>row.action==='human_override_reopen'));
  assert.ok(events.some((row)=>row.action==='dependency_reopen'));
  assert.ok(events.some((row)=>row.action==='expired'));
  assert.ok(events.some((row)=>row.action==='superseded'));
  assert.ok(events.some((row)=>row.action==='cleared'));

  const dependency=store.filter(appKey,'SystemiaReleaseDependency',{
    dependency_key:'upstream-v1->downstream-v1',
    state:'active'
  },{limit:5})[0];
  assert.equal(dependency.expected_upstream_hash,'sha256:aaa');
  assert.equal(dependency.expected_upstream_revision,'rev-a');

  console.log(JSON.stringify({
    schema:'evercraft.exact-output-gate.runtime-proof.v1',
    status:'pass',
    clean_release_verified:true,
    dependency_hash_and_revision_pinned:true,
    human_visible_mismatch_reopens_downstream:true,
    recovery_requires_reverification:true,
    hash_mismatch_blocks_and_cascades:true,
    verification_ttl_expires:true,
    supersession_reopens_downstream:true,
    release_events_receipted:true,
    source_platform_dependency:false
  }));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
