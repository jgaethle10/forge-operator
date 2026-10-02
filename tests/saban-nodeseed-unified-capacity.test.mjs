import test from 'node:test';
import assert from 'node:assert/strict';

import {sanitizeNodeSeedInventory} from '../systemia/saban/nodeseed-inventory-ingest.mjs';
import {nodeSeedInventoryToComputeOffers} from '../systemia/saban/nodeseed-capacity-offer.mjs';
import {compileCapacityOrganismState} from '../systemia/saban/capacity-organism.mjs';
import {normalizeMicroDeviceManifest} from '../systemia/saban/microseed-device-bridge.mjs';

const now=new Date('2026-10-02T03:30:00.000Z');
const fp='sha256:'+'a'.repeat(64);

function yardInventory(overrides={}){
  return {
    schema:'evercraft.yard.remote-capacity-nodes.v1',
    count:1,
    nodes:[{
      node_id:'evercraft-heavy-01',
      device_fingerprint:fp,
      connected:true,
      last_seen_at:'2026-10-02T03:29:55.000Z',
      control_token:'must-not-survive',
      allocator_token:'must-not-survive',
      capacity:{
        protocol:'evercraft.capacity.v1',
        runtime:'Evercraft Compute',
        supported_workloads:[
          'systemia.journal-claim-check.v1',
          'systemia.telemetry-normalizer.v1',
        ],
        placement_labels:['heavy-compute','persistent-storage'],
        authorized:true,
        session_attestation_verified:true,
        attestation_supported:true,
        device_fingerprint:fp,
        failure_domain:'remote-site-b',
        zero_cost:true,
        public_ingress:false,
        capacity_hint:{
          cpu_units:8,
          memory_mb:16384,
          storage_gb:500,
          executables:{ffmpeg:true},
        },
      },
      ...overrides,
    }]
  };
}

test('Yard to Saban inventory ingest strips all authority material',()=>{
  const safe=sanitizeNodeSeedInventory(yardInventory());
  assert.equal(safe.schema,'evercraft.saban.nodeseed-safe-inventory.v1');
  assert.equal(safe.count,1);
  assert.equal(safe.authority_material_exposed,false);
  const raw=JSON.stringify(safe);
  assert.doesNotMatch(raw,/must-not-survive/);
  assert.doesNotMatch(raw,/"allocator_token"\s*:/);
  assert.doesNotMatch(raw,/"control_token"\s*:/);
  assert.doesNotMatch(raw,/"service_relay_token"\s*:/);
  assert.equal(safe.nodes[0].capacity.failure_domain,'remote-site-b');
  assert.equal(safe.nodes[0].capacity.zero_cost,true);
  assert.equal(safe.nodes[0].capacity.capacity_hint.storage_gb,500);
});

test('authorized connected attested zero-cost NodeSeed becomes one compute offer',()=>{
  const safe=sanitizeNodeSeedInventory(yardInventory());
  const result=nodeSeedInventoryToComputeOffers({inventory:safe,requireZeroCost:true});
  assert.equal(result.eligible_count,1);
  assert.equal(result.rejected_count,0);
  const offer=result.offers[0];
  assert.equal(offer.market,'evercraft-nodeseed');
  assert.equal(offer.access_class,'authorized_compute');
  assert.equal(offer.economics.zero_cost,true);
  assert.equal(offer.metadata.failure_domain,'remote-site-b');
  assert.equal(offer.resources.storage_gb,500);
  assert.ok(offer.metadata.supported_workloads.includes('systemia.journal-claim-check.v1'));
});

test('NodeSeed offer admission fails closed on connectivity authorization and attestation',()=>{
  for(const mutate of [
    n=>{n.connected=false},
    n=>{n.capacity.authorized=false},
    n=>{n.capacity.session_attestation_verified=false},
    n=>{n.capacity.zero_cost=false},
  ]){
    const input=yardInventory();
    mutate(input.nodes[0]);
    const safe=sanitizeNodeSeedInventory(input);
    const result=nodeSeedInventoryToComputeOffers({inventory:safe,requireZeroCost:true});
    assert.equal(result.eligible_count,0);
    assert.equal(result.rejected_count,1);
  }
});

test('capacity organism plans MicroSeeds and NodeSeeds in one portfolio fabric',()=>{
  const micro=normalizeMicroDeviceManifest({
    device_id:'micro-phone-01',
    device_class:'phone',
    bridge_mode:'native_agent',
    compute_execution_mode:'native_device',
    authorization_ref:'owner-phone',
    endpoint:'https://phone.invalid/evercraft',
    supported_workloads:['systemia.telemetry-normalizer.v1'],
    resources:{cpu_units:1,memory_mb:2048,storage_gb:16},
    max_concurrency:2,
    duty_cycle:'opportunistic',
    attestation:{mode:'device',device_identity:'phone-key'},
    observed_at:'2026-10-02T03:29:00.000Z',
  });
  const conformance={
    schema:'evercraft.microseed.conformance-receipt.v1',
    device_id:micro.device_id,
    manifest_hash:micro.manifest_hash,
    verified_workloads:['systemia.telemetry-normalizer.v1'],
    unverified_workloads:[],
    execution_receipts:[],
    arbitrary_code_execution:false,
    safe_registered_canaries_only:true,
    verified_at:'2026-10-02T03:29:10.000Z',
    expires_at:'2026-10-03T03:29:10.000Z',
    receipt_hash:'sha256:'+'b'.repeat(64),
  };
  const registrySnapshot={
    schema:'evercraft.saban.ambient-device-registry-snapshot.v1',
    eligible_count:1,
    rows:[{
      device_id:micro.device_id,
      state:'active',
      eligible:true,
      reason:'authorized_fresh',
      manifest:micro,
      conformance,
    }],
  };
  const demandRadar={
    schema:'evercraft.saban.ambient-demand-radar.v1',
    generated_at:now.toISOString(),
    workloads:[
      {
        workload_class:'systemia.telemetry-normalizer.v1',
        jobs:1,queued:1,held:0,retry_wait:0,private_jobs:0,
        total_cpu_units:0.1,max_cpu_units:0.1,
        total_memory_mb:96,max_memory_mb:96,
        total_storage_gb:0,max_storage_gb:0,
        preemptible_jobs:1,checkpointable_jobs:1,
        oldest_requested_at:'2026-10-02T03:29:30.000Z',oldest_age_ms:30000,
        private_fraction:0,checkpointable_fraction:1,urgency_score:1,
      },
      {
        workload_class:'systemia.journal-claim-check.v1',
        jobs:2,queued:2,held:0,retry_wait:0,private_jobs:1,
        total_cpu_units:1,max_cpu_units:0.5,
        total_memory_mb:1024,max_memory_mb:512,
        total_storage_gb:2,max_storage_gb:1,
        preemptible_jobs:2,checkpointable_jobs:2,
        oldest_requested_at:'2026-10-02T03:29:00.000Z',oldest_age_ms:60000,
        private_fraction:0.5,checkpointable_fraction:1,urgency_score:10,
      },
    ],
  };
  const safe=sanitizeNodeSeedInventory(yardInventory());
  const state=compileCapacityOrganismState({
    registrySnapshot,
    demandRadar,
    nodeSeedInventory:safe,
    now,
  });
  assert.equal(state.microseed_compute_offer_count,1);
  assert.equal(state.nodeseed_compute_offer_count,1);
  assert.equal(state.compute_offer_count,2);
  const telemetry=state.workload_plan.placements.find(x=>x.task_id==='queued-systemia.telemetry-normalizer.v1');
  const journal=state.workload_plan.placements.filter(x=>x.task_id==='queued-systemia.journal-claim-check.v1');
  assert.ok(
    telemetry,
    JSON.stringify({
      eligible:state.workload_plan.eligible_offers_by_task?.['queued-systemia.telemetry-normalizer.v1']||[],
      held:state.workload_plan.held?.filter(x=>x.task_id==='queued-systemia.telemetry-normalizer.v1')||[],
      placements:state.workload_plan.placements?.filter(x=>x.task_id.includes('telemetry-normalizer'))||[],
      offers:{micro:state.microseed_compute_offer_count,node:state.nodeseed_compute_offer_count}
    },null,2)
  );
  assert.ok(journal.length>=1);
  assert.ok(journal.every(x=>x.provider_id==='evercraft-heavy-01'));
  assert.ok(
    state.workload_plan.eligible_offers_by_task['queued-systemia.telemetry-normalizer.v1']
      .includes('ambient:microseed:micro-phone-01:compute')
  );
  assert.ok(['micro-phone-01','evercraft-heavy-01'].includes(telemetry.device_id||telemetry.provider_id));
  assert.equal(state.nodeseed_compute.authority_material_exposed,false);
});
