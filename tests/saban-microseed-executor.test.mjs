import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizeMicroDeviceManifest } from '../systemia/saban/microseed-device-bridge.mjs';
import {
  normalizeMicroSeedExecutionRequest,
  executeMicroSeedWorkload,
} from '../systemia/saban/microseed-executor.mjs';

const trust={eligible:true,state:'active'};

function safeTelemetry(overrides={}){
  return {
    primary_function_busy:false,
    cpu_utilization:0.1,
    memory_free_mb:2048,
    temperature_c:35,
    battery_percent:90,
    external_power:true,
    network_utilization:0.1,
    observed_at:'2026-10-01T03:00:00.000Z',
    max_age_ms:120000,
    ...overrides,
  };
}

const phone=normalizeMicroDeviceManifest({
  device_id:'phone-native-01',
  device_class:'phone',
  bridge_mode:'native_agent',
  authorization_ref:'owner-phone',
  endpoint:'https://phone.local/evercraft',
  supported_workloads:['systemia.content-hash.v1','systemia.telemetry-normalizer.v1'],
  resources:{cpu_units:1,memory_mb:2048,storage_gb:16},
  max_concurrency:2,
  duty_cycle:'opportunistic',
  cpu_utilization_ceiling:0.8,
  memory_reserve_mb:256,
  battery_floor_percent:40,
  require_external_power:false,
  attestation:{mode:'device',device_identity:'phone-key'},
});

test('native MicroSeed executes registered work on the device and replays idempotently',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-executor-'));
  try{
    const request=normalizeMicroSeedExecutionRequest({
      device_id:'phone-native-01',
      workload_class:'systemia.content-hash.v1',
      idempotency_key:'job-1',
      payload:{value:{b:2,a:1}},
      requested_memory_mb:64,
      requested_cpu_fraction:0.1,
      requested_at:'2026-10-01T03:00:10.000Z',
    });
    const first=await executeMicroSeedWorkload({
      manifest:phone,
      trustDecision:trust,
      telemetry:safeTelemetry(),
      request,
      stateDir:root,
      now:new Date('2026-10-01T03:00:20.000Z'),
    });
    assert.equal(first.execution_location,'device');
    assert.equal(first.deduplicated,false);
    assert.match(first.result.digest,/^sha256:/);
    assert.equal(first.arbitrary_code_execution,false);

    const second=await executeMicroSeedWorkload({
      manifest:phone,
      trustDecision:trust,
      telemetry:safeTelemetry(),
      request,
      stateDir:root,
      now:new Date('2026-10-01T03:00:30.000Z'),
    });
    assert.equal(second.deduplicated,true);
    assert.equal(second.receipt_hash,first.receipt_hash);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('idempotency key cannot be reused for different work',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-idempotency-'));
  try{
    const base={
      device_id:'phone-native-01',
      workload_class:'systemia.content-hash.v1',
      idempotency_key:'same-key',
      requested_memory_mb:64,
      requested_cpu_fraction:0.1,
      requested_at:'2026-10-01T03:00:10.000Z',
    };
    await executeMicroSeedWorkload({
      manifest:phone,trustDecision:trust,telemetry:safeTelemetry(),
      request:{...base,payload:{value:'one'}},stateDir:root,
      now:new Date('2026-10-01T03:00:20.000Z'),
    });
    await assert.rejects(
      ()=>executeMicroSeedWorkload({
        manifest:phone,trustDecision:trust,telemetry:safeTelemetry(),
        request:{...base,payload:{value:'two'}},stateDir:root,
        now:new Date('2026-10-01T03:00:30.000Z'),
      }),
      /idempotency_key_conflict/
    );
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('primary function safety hold blocks execution before workload runs',async()=>{
  await assert.rejects(
    ()=>executeMicroSeedWorkload({
      manifest:phone,
      trustDecision:trust,
      telemetry:safeTelemetry({primary_function_busy:true}),
      request:{
        device_id:'phone-native-01',
        workload_class:'systemia.content-hash.v1',
        idempotency_key:'job-busy',
        payload:{value:'x'},
        requested_memory_mb:64,
        requested_cpu_fraction:0.1,
      },
      now:new Date('2026-10-01T03:00:20.000Z'),
    }),
    /microseed_safety_hold:primary_function_busy/
  );
});

test('sensor-only appliance cannot execute compute workloads',async()=>{
  const fridge=normalizeMicroDeviceManifest({
    device_id:'fridge-observe-01',
    device_class:'refrigerator',
    bridge_mode:'matter',
    authorization_ref:'owner-fridge',
    endpoint:'matter://hub/fridge',
    supported_workloads:[],
    capabilities:[{
      kind:'observation',
      operations:['observe'],
      protocol:'matter',
      metadata:{sensors:['temperature']},
    }],
    resources:{cpu_units:0.05,memory_mb:64,storage_gb:0.1},
    attestation:{mode:'gateway_bound',gateway_identity:'hub'},
  });
  await assert.rejects(
    ()=>executeMicroSeedWorkload({
      manifest:fridge,
      trustDecision:trust,
      telemetry:safeTelemetry(),
      request:{
        device_id:'fridge-observe-01',
        workload_class:'systemia.content-hash.v1',
        idempotency_key:'fake-compute',
        payload:{value:'x'},
      },
      now:new Date('2026-10-01T03:00:20.000Z'),
    }),
    /workload_not_authorized|compute_execution_not_declared/
  );
});

test('gateway-proxied compute requires an explicit bridge adapter and records execution location',async()=>{
  const device=normalizeMicroDeviceManifest({
    device_id:'embedded-api-01',
    device_class:'embedded-controller',
    bridge_mode:'lan_api',
    compute_execution_mode:'gateway_proxy',
    authorization_ref:'owner-controller',
    endpoint:'https://controller.local/compute',
    supported_workloads:['systemia.content-hash.v1'],
    resources:{cpu_units:0.5,memory_mb:512,storage_gb:2},
    cpu_utilization_ceiling:0.8,
    memory_reserve_mb:64,
    attestation:{mode:'gateway_bound',gateway_identity:'hub'},
  });
  const receipt=await executeMicroSeedWorkload({
    manifest:device,
    trustDecision:trust,
    telemetry:safeTelemetry(),
    request:{
      device_id:'embedded-api-01',
      workload_class:'systemia.content-hash.v1',
      idempotency_key:'proxy-job',
      payload:{value:'abc'},
      requested_memory_mb:32,
      requested_cpu_fraction:0.1,
    },
    bridgeAdapters:{
      lan_api:{
        async execute({workload_class,payload}){
          return {ok:true,remote:true,workload_class,payload_hash:'sha256:test'};
        },
      },
    },
    now:new Date('2026-10-01T03:00:20.000Z'),
  });
  assert.equal(receipt.execution_location,'gateway_proxy_to_device');
  assert.equal(receipt.result.remote,true);
});
