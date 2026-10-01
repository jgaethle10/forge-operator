import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMicroDeviceManifest,
  microDeviceToAmbientCapability,
} from '../systemia/saban/microseed-device-bridge.mjs';
import {
  runMicroSeedConformance,
  evaluateMicroSeedConformance,
  MicroSeedConformanceCanaries,
} from '../systemia/saban/microseed-conformance.mjs';
import { resolveAmbientComputeOffers } from '../systemia/saban/ambient-compute-fabric.mjs';

const manifest=normalizeMicroDeviceManifest({
  device_id:'phone-conformance-01',
  device_class:'phone',
  bridge_mode:'native_agent',
  authorization_ref:'owner-phone',
  endpoint:'https://phone.local/evercraft',
  supported_workloads:['systemia.content-hash.v1','systemia.telemetry-normalizer.v1'],
  resources:{cpu_units:1,memory_mb:2048,storage_gb:16},
  max_concurrency:2,
  duty_cycle:'opportunistic',
  attestation:{mode:'device',device_identity:'phone-key'},
  observed_at:'2026-10-01T03:00:00.000Z',
});

function receipt({workload,result,device='phone-conformance-01'}){
  return {
    schema:'evercraft.microseed.execution-receipt.v1',
    device_id:device,
    workload_class:workload,
    idempotency_key:'canary',
    request_hash:'sha256:'+'1'.repeat(64),
    manifest_hash:manifest.manifest_hash,
    safety_receipt_ref:'sha256:'+'2'.repeat(64),
    result,
    execution_location:'device',
    deduplicated:false,
    arbitrary_code_execution:false,
    primary_function_priority:true,
    external_cash_spend_usd:0,
    incremental_energy_cost_state:'not_measured',
    completed_at:'2026-10-01T03:01:00.000Z',
    receipt_hash:'sha256:'+'3'.repeat(64),
  };
}

test('MicroSeed conformance verifies only safe registered canaries with exact receipt identity',async()=>{
  const c=await runMicroSeedConformance({
    manifest,
    trustDecision:{eligible:true,state:'active'},
    now:new Date('2026-10-01T03:00:00.000Z'),
    execute:async({workload_class})=>{
      if(workload_class==='systemia.content-hash.v1'){
        return receipt({workload:workload_class,result:{ok:true,digest:'sha256:'+'a'.repeat(64),byte_count:20}});
      }
      if(workload_class==='systemia.telemetry-normalizer.v1'){
        return receipt({workload:workload_class,result:{ok:true,normalized:{alpha:1},normalized_hash:'sha256:'+'b'.repeat(64)}});
      }
      throw new Error('unexpected');
    },
  });
  assert.deepEqual(c.verified_workloads,[
    'systemia.content-hash.v1',
    'systemia.telemetry-normalizer.v1',
  ]);
  assert.equal(c.unverified_workloads.length,0);
  assert.equal(c.safe_registered_canaries_only,true);
  assert.equal(c.arbitrary_code_execution,false);
  assert.ok(MicroSeedConformanceCanaries.includes('systemia.content-hash.v1'));

  const decision=evaluateMicroSeedConformance({
    conformance:c,
    manifest,
    workload_class:'systemia.content-hash.v1',
    now:new Date('2026-10-01T03:30:00.000Z'),
  });
  assert.equal(decision.verified,true);
});

test('wrong-device or malformed execution receipt cannot pass canary',async()=>{
  const c=await runMicroSeedConformance({
    manifest,
    trustDecision:{eligible:true,state:'active'},
    now:new Date('2026-10-01T03:00:00.000Z'),
    execute:async({workload_class})=>receipt({
      workload:workload_class,
      device:'some-other-device',
      result:{ok:true,digest:'sha256:'+'a'.repeat(64),normalized_hash:'sha256:'+'b'.repeat(64)},
    }),
  });
  assert.equal(c.verified_workloads.length,0);
  assert.equal(c.unverified_workloads.length,2);
  assert.ok(c.execution_receipts.every(x=>x.envelope_valid===false));
});

test('production ambient compute can require fresh workload conformance',()=>{
  const noProof=microDeviceToAmbientCapability(manifest);
  const held=resolveAmbientComputeOffers({
    capabilities:[noProof],
    workloadClass:'systemia.content-hash.v1',
    requireVerifiedWorkload:true,
    now:new Date('2026-10-01T03:00:00.000Z'),
  });
  assert.equal(held.offers.length,0);
  assert.equal(held.rejected[0].reason,'workload_not_conformance_verified');

  const proof={
    schema:'evercraft.microseed.conformance-receipt.v1',
    device_id:manifest.device_id,
    manifest_hash:manifest.manifest_hash,
    verified_workloads:['systemia.content-hash.v1'],
    unverified_workloads:[],
    execution_receipts:[],
    arbitrary_code_execution:false,
    safe_registered_canaries_only:true,
    verified_at:'2026-10-01T02:00:00.000Z',
    expires_at:'2026-10-02T02:00:00.000Z',
    receipt_hash:'sha256:'+'f'.repeat(64),
  };
  const capability=microDeviceToAmbientCapability(manifest,{conformance:proof});
  const ready=resolveAmbientComputeOffers({
    capabilities:[capability],
    workloadClass:'systemia.content-hash.v1',
    requireVerifiedWorkload:true,
    now:new Date('2026-10-01T03:00:00.000Z'),
  });
  assert.equal(ready.offers.length,1);

  const expired=resolveAmbientComputeOffers({
    capabilities:[capability],
    workloadClass:'systemia.content-hash.v1',
    requireVerifiedWorkload:true,
    now:new Date('2026-10-03T03:00:00.000Z'),
  });
  assert.equal(expired.offers.length,0);
  assert.equal(expired.rejected[0].reason,'workload_conformance_expired');
});
