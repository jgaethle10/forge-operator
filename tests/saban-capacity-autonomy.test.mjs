import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {buildCapacityAutonomyPlan} from '../systemia/saban/capacity-autonomy-conductor.mjs';
import {portfolioWorkloadAnatomy} from '../systemia/saban/workload-anatomy.mjs';
import {AmbientDeviceRegistry} from '../systemia/saban/ambient-device-registry.mjs';
import {normalizeMicroDeviceManifest} from '../systemia/saban/microseed-device-bridge.mjs';
import {executeMicroSeedWorkload} from '../systemia/saban/microseed-executor.mjs';
import {createPerformanceLedger, recordPerformanceSample} from '../systemia/saban/performance-learning.mjs';
import {activateAuthorizedCapacity} from '../systemia/saban/authorized-capacity-activation.mjs';

const now=new Date('2026-10-02T03:00:00.000Z');

function manifest(id='candidate-01'){
  return normalizeMicroDeviceManifest({
    device_id:id,
    device_class:'mini-pc',
    bridge_mode:'native_agent',
    compute_execution_mode:'native_device',
    authorization_ref:'owner-'+id,
    endpoint:'https://'+id+'.invalid/evercraft',
    supported_workloads:['systemia.content-hash.v1','systemia.telemetry-normalizer.v1'],
    resources:{cpu_units:2,memory_mb:4096,storage_gb:32},
    max_concurrency:2,
    duty_cycle:'always_on',
    cpu_utilization_ceiling:0.8,
    memory_reserve_mb:256,
    attestation:{mode:'device',device_identity:'key-'+id},
  });
}

test('Saban autonomy plan stops only at authority and resumes automatically after it',()=>{
  const m=manifest();
  const snapshot={
    schema:'evercraft.saban.ambient-device-registry-snapshot.v1',
    eligible_count:1,
    rows:[
      {device_id:'observed-01',state:'observed',eligible:false,reason:'not_authorized',manifest:null,conformance:null},
      {device_id:'candidate-01',state:'candidate',eligible:false,reason:'not_authorized',manifest:m,conformance:null},
      {device_id:'authorized-01',state:'authorized',eligible:false,reason:'first_heartbeat_required',manifest:manifest('authorized-01'),conformance:null},
      {device_id:'active-01',state:'active',eligible:true,reason:'authorized_fresh',manifest:manifest('active-01'),conformance:null},
      {device_id:'degraded-01',state:'degraded',eligible:false,reason:'heartbeat_stale',manifest:manifest('degraded-01'),conformance:null},
      {device_id:'revoked-01',state:'revoked',eligible:false,reason:'revoked',manifest:manifest('revoked-01'),conformance:null},
    ],
  };
  const opportunityMap={
    schema:'evercraft.saban.capacity-gap-opportunity-map.v1',
    matches:[{
      gap:{gap_id:'workload:x',workload_class:'systemia.content-hash.v1'},
      candidates:[{observation_ref:'sha256:'+'a'.repeat(64),device_family:'general_compute_candidate',score:1500}],
    }],
  };
  const plan=buildCapacityAutonomyPlan({registrySnapshot:snapshot,opportunityMap,performanceLedger:createPerformanceLedger(),now});
  assert.ok(plan.authority_requests.some(x=>x.device_id==='candidate-01'));
  assert.ok(plan.safe_autonomous_actions.some(x=>x.device_id==='authorized-01'&&x.action==='request_first_attested_heartbeat'));
  assert.ok(plan.safe_autonomous_actions.some(x=>x.device_id==='active-01'&&x.action==='run_registered_workload_conformance_canaries'));
  assert.ok(plan.safe_autonomous_actions.some(x=>x.device_id==='degraded-01'&&x.action==='suspend_new_assignments'));
  assert.ok(plan.holds.some(x=>x.device_id==='revoked-01'&&x.autonomous_reactivation_forbidden===true));
  assert.equal(plan.observed_authority_leads.length,1);
  assert.equal(plan.policies.observation_never_grants_authority,true);
  assert.equal(plan.policies.authority_resume_is_automatic_after_valid_grant,true);
});

test('portfolio anatomy absorbs live Evercraft demand beyond RIVET and AliEV',()=>{
  const anatomy=portfolioWorkloadAnatomy({
    demandRadar:{
      schema:'evercraft.saban.ambient-demand-radar.v1',
      generated_at:now.toISOString(),
      workloads:[
        {
          workload_class:'systemia.telemetry-normalizer.v1',
          jobs:4,preemptible_jobs:4,checkpointable_jobs:4,private_jobs:0,
          max_cpu_units:0.1,max_memory_mb:96,max_storage_gb:0,
        },
        {
          workload_class:'systemia.journal-claim-check.v1',
          jobs:2,preemptible_jobs:2,checkpointable_jobs:2,private_jobs:1,
          max_cpu_units:0.5,max_memory_mb:512,max_storage_gb:1,
        },
        {
          workload_class:'systemia.chunk-transform.v1',
          jobs:3,preemptible_jobs:3,checkpointable_jobs:3,private_jobs:0,
          max_cpu_units:0.2,max_memory_mb:256,max_storage_gb:0,
        },
      ],
    },
  });
  const tele=anatomy.tasks.find(x=>x.workload_class==='systemia.telemetry-normalizer.v1');
  const journal=anatomy.tasks.find(x=>x.workload_class==='systemia.journal-claim-check.v1');
  assert.ok(tele);
  assert.equal(tele.execution_shape,'shardable');
  assert.equal(tele.shard_count,4);
  assert.ok(journal);
  assert.equal(journal.trust.private_data,true);
  assert.equal(anatomy.tasks.filter(x=>x.workload_class==='systemia.chunk-transform.v1').length,1);
  assert.ok(anatomy.live_demand_tasks_added>=2);
  assert.equal(anatomy.invariants.live_queue_can_extend_anatomy,true);
});

test('authorized activation automatically conforms calibrates and learns',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-activation-'));
  try{
    const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
    const m=manifest('node-auto-01');
    registry.observe({device_id:m.device_id,observed_at:'2026-10-02T02:55:00.000Z'});
    registry.candidate({device_id:m.device_id,manifest:m});
    registry.authorize({
      device_id:m.device_id,
      approval_ref:'explicit-test-owner-approval',
      expires_at:'2026-10-03T03:00:00.000Z',
      heartbeat_target_seconds:300,
      attestation_mode:'device',
      attestation_identity:'key-node-auto-01',
      authorized_at:'2026-10-02T02:56:00.000Z',
    });
    registry.heartbeat({
      device_id:m.device_id,
      capability_manifest_hash:m.manifest_hash,
      attestation_identity:'key-node-auto-01',
      observed_at:'2026-10-02T02:59:30.000Z',
    });

    const trust={eligible:true,state:'active'};
    const telemetry={
      primary_function_busy:false,
      cpu_utilization:0.1,
      memory_free_mb:3500,
      temperature_c:35,
      battery_percent:100,
      external_power:true,
      network_utilization:0.1,
      observed_at:'2026-10-02T02:59:50.000Z',
      max_age_ms:120000,
    };
    const execute=async({workload_class,idempotency_key,payload})=>executeMicroSeedWorkload({
      manifest:m,
      trustDecision:trust,
      telemetry,
      request:{
        device_id:m.device_id,
        workload_class,
        idempotency_key,
        payload,
        requested_memory_mb:64,
        requested_cpu_fraction:0.1,
      },
      stateDir:path.join(root,'execution'),
      executionContext:'device',
      now,
    });

    const ledger=createPerformanceLedger({created_at:'2026-10-02T02:50:00.000Z'});
    const receipt=await activateAuthorizedCapacity({
      registry,
      device_id:m.device_id,
      execute,
      performanceLedger:ledger,
      now,
      calibrationSamplesPerWorkload:2,
      maxCalibrationSamples:4,
    });
    assert.equal(receipt.conformance_refreshed,true);
    assert.ok(receipt.verified_workloads.includes('systemia.content-hash.v1'));
    assert.ok(receipt.performance_updates.length>=1);
    assert.equal(receipt.ready_for_offer_compilation,true);
    assert.ok(registry.conformance(m.device_id));
    assert.ok(Object.keys(ledger.profiles).length>=1);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});


test('fresh performance suppresses calibration until forecast prewarm names a workload',()=>{
  const m=manifest('fresh-active-01');
  const conformance={
    schema:'evercraft.microseed.conformance-receipt.v1',
    device_id:m.device_id,
    manifest_hash:m.manifest_hash,
    verified_workloads:['systemia.content-hash.v1','systemia.telemetry-normalizer.v1'],
    unverified_workloads:[],
    execution_receipts:[],
    arbitrary_code_execution:false,
    safe_registered_canaries_only:true,
    verified_at:'2026-10-02T02:50:00.000Z',
    expires_at:'2026-10-03T02:50:00.000Z',
    receipt_hash:'sha256:'+'f'.repeat(64),
  };
  const snapshot={
    schema:'evercraft.saban.ambient-device-registry-snapshot.v1',
    eligible_count:1,
    rows:[{
      device_id:m.device_id,
      state:'active',
      eligible:true,
      reason:'authorized_fresh',
      manifest:m,
      conformance,
    }],
  };
  const ledger=createPerformanceLedger({created_at:'2026-10-02T02:50:00.000Z'});
  for(const workload of conformance.verified_workloads){
    recordPerformanceSample(ledger,{
      device_id:m.device_id,
      workload_class:workload,
      ok:true,
      duration_ms:10,
      observed_at:'2026-10-02T02:59:30.000Z',
    });
  }

  const quiet=buildCapacityAutonomyPlan({
    registrySnapshot:snapshot,
    performanceLedger:ledger,
    now,
  });
  assert.equal(
    quiet.safe_autonomous_actions.some(x=>
      x.device_id===m.device_id &&
      x.action==='run_safe_calibration_and_refresh_performance_profile'
    ),
    false
  );
  assert.equal(
    quiet.safe_autonomous_actions.some(x=>
      x.device_id===m.device_id &&
      x.action==='compile_offer_and_rebalance_matching_checkpointable_work'
    ),
    true
  );

  const hot=buildCapacityAutonomyPlan({
    registrySnapshot:snapshot,
    performanceLedger:ledger,
    prewarmPlan:{
      schema:'evercraft.saban.prewarm-plan.v1',
      actions:[{
        device_id:m.device_id,
        trust_state:'active',
        matched_workloads:['systemia.content-hash.v1'],
        action:'refresh_conformance_calibration_for_predicted_demand',
        authority_basis:'existing_current_authorization_only',
        authority_expansion:false,
        commercial_spend_usd:0,
      }],
      action_count:1,
      unauthorized_candidates_activated:0,
      commercial_spend_usd:0,
      generated_at:now.toISOString(),
    },
    now,
  });
  const calibration=hot.safe_autonomous_actions.find(x=>
    x.device_id===m.device_id &&
    x.action==='run_safe_calibration_and_refresh_performance_profile'
  );
  assert.ok(calibration);
  assert.deepEqual(calibration.target_workloads,['systemia.content-hash.v1']);
  assert.deepEqual(calibration.forecast_prewarm_workloads,['systemia.content-hash.v1']);
  assert.deepEqual(calibration.stale_performance_workloads,[]);
  assert.equal(hot.policies.forecast_prewarm_never_expands_authority,true);
});


test('single live jobs preserve preemptible checkpointable continuity without becoming shardable',()=>{
  const anatomy=portfolioWorkloadAnatomy({
    includeRivetAliEv:false,
    demandRadar:{
      schema:'evercraft.saban.ambient-demand-radar.v1',
      generated_at:'2026-10-02T06:25:00.000Z',
      workloads:[{
        workload_class:'systemia.telemetry-normalizer.v1',
        jobs:1,
        preemptible_jobs:1,
        checkpointable_jobs:1,
        private_jobs:0,
        max_cpu_units:0.1,
        max_memory_mb:96,
        max_storage_gb:0,
        max_gpu_count:0,
        gpu_models:[],
      }],
    },
  });
  const task=anatomy.tasks[0];
  assert.equal(task.execution_shape,'atomic');
  assert.equal(task.shard_count,1);
  assert.equal(task.continuity.preemptible,true);
  assert.equal(task.continuity.checkpointable,true);
  assert.equal(task.trust.minimum_uptime_7d,0);
});
