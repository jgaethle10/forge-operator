import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMicroDeviceManifest,
} from '../systemia/saban/microseed-device-bridge.mjs';
import {
  runMicroSeedCalibration,
} from '../systemia/saban/microseed-calibration.mjs';

const manifest=normalizeMicroDeviceManifest({
  device_id:'phone-cal-01',
  device_class:'phone',
  bridge_mode:'native_agent',
  authorization_ref:'owner-phone',
  endpoint:'https://phone.local/evercraft',
  supported_workloads:['systemia.content-hash.v1'],
  resources:{cpu_units:1,memory_mb:2048,storage_gb:16},
  attestation:{mode:'device',device_identity:'phone-key'},
  observed_at:'2026-10-01T03:00:00.000Z',
});

const conformance={
  schema:'evercraft.microseed.conformance-receipt.v1',
  device_id:manifest.device_id,
  manifest_hash:manifest.manifest_hash,
  verified_workloads:['systemia.content-hash.v1'],
  unverified_workloads:[],
  execution_receipts:[],
  arbitrary_code_execution:false,
  safe_registered_canaries_only:true,
  verified_at:'2026-10-01T03:00:00.000Z',
  expires_at:'2026-10-02T03:00:00.000Z',
  receipt_hash:'sha256:'+'a'.repeat(64),
};

test('calibration runs only conformance-verified safe workloads and is sample-bounded',async()=>{
  let calls=0;
  const receipt=await runMicroSeedCalibration({
    manifest,
    conformance,
    trustDecision:{eligible:true,state:'active'},
    samplesPerWorkload:99,
    maxTotalSamples:4,
    now:new Date('2026-10-01T03:10:00.000Z'),
    execute:async({workload_class,idempotency_key})=>{
      calls+=1;
      assert.equal(workload_class,'systemia.content-hash.v1');
      assert.match(idempotency_key,/^calibration:/);
      return {
        schema:'evercraft.microseed.execution-receipt.v1',
        device_id:manifest.device_id,
        workload_class,
        arbitrary_code_execution:false,
        result:{ok:true,digest:'sha256:'+'b'.repeat(64),byte_count:256},
        receipt_hash:'sha256:'+String(calls).padStart(64,'0'),
      };
    },
  });
  assert.equal(calls,4);
  assert.equal(receipt.total_samples,4);
  assert.equal(receipt.workloads[0].successful_samples,4);
  assert.equal(receipt.safe_registered_canaries_only,true);
  assert.equal(receipt.arbitrary_code_execution,false);
});

test('calibration refuses active-but-unproven compute',async()=>{
  await assert.rejects(
    ()=>runMicroSeedCalibration({
      manifest,
      conformance:null,
      trustDecision:{eligible:true,state:'active'},
      execute:async()=>({}),
      now:new Date('2026-10-01T03:10:00.000Z'),
    }),
    /requires_verified_workload/
  );
});


test('forecast-targeted calibration exercises only requested verified workloads',async()=>{
  const multi=normalizeMicroDeviceManifest({
    device_id:'phone-cal-targeted',
    device_class:'phone',
    bridge_mode:'native_agent',
    authorization_ref:'owner-phone',
    endpoint:'https://phone.local/evercraft',
    supported_workloads:['systemia.content-hash.v1','systemia.telemetry-normalizer.v1'],
    resources:{cpu_units:1,memory_mb:2048,storage_gb:16},
    attestation:{mode:'device',device_identity:'phone-key'},
    observed_at:'2026-10-02T03:00:00.000Z',
  });
  const proof={
    schema:'evercraft.microseed.conformance-receipt.v1',
    device_id:multi.device_id,
    manifest_hash:multi.manifest_hash,
    verified_workloads:['systemia.content-hash.v1','systemia.telemetry-normalizer.v1'],
    unverified_workloads:[],
    execution_receipts:[],
    arbitrary_code_execution:false,
    safe_registered_canaries_only:true,
    verified_at:'2026-10-02T03:00:00.000Z',
    expires_at:'2026-10-03T03:00:00.000Z',
    receipt_hash:'sha256:'+'c'.repeat(64),
  };
  const seen=[];
  const receipt=await runMicroSeedCalibration({
    manifest:multi,
    conformance:proof,
    trustDecision:{eligible:true,state:'active'},
    workloadClasses:['systemia.content-hash.v1'],
    samplesPerWorkload:2,
    maxTotalSamples:4,
    now:new Date('2026-10-02T03:10:00.000Z'),
    execute:async({workload_class})=>{
      seen.push(workload_class);
      return {
        schema:'evercraft.microseed.execution-receipt.v1',
        device_id:multi.device_id,
        workload_class,
        arbitrary_code_execution:false,
      };
    },
  });
  assert.deepEqual(new Set(seen),new Set(['systemia.content-hash.v1']));
  assert.deepEqual(receipt.targeted_workloads,['systemia.content-hash.v1']);
  assert.equal(receipt.targeted,true);
  assert.equal(receipt.workloads.length,1);
});
