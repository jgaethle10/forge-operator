import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeMicroDeviceManifest } from '../systemia/saban/microseed-device-bridge.mjs';
import { executeMicroSeedWorkload } from '../systemia/saban/microseed-executor.mjs';
import { invokeMicroSeedCapability } from '../systemia/saban/microseed-capability-executor.mjs';
import {
  isMicroSeedExecutionQuarantined,
  MICROSEED_EXECUTION_QUARANTINE_REASON,
} from '../systemia/saban/microseed-device-quarantine.mjs';

test('Node001 quarantine applies to direct compute and capability calls with zero adapter effects',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-quarantine-core-'));
  try{
    const id='evercraft-node001-penguin';
    const manifest=normalizeMicroDeviceManifest({
      device_id:id,
      device_class:'linux-host',
      bridge_mode:'native_agent',
      authorization_ref:'synthetic-owner-approval',
      supported_workloads:['systemia.content-hash.v1'],
      resources:{cpu_units:1,memory_mb:1024,storage_gb:1},
      capabilities:[{kind:'sensor',operations:['observe']}],
    });
    let effects=0;
    const adapters={
      native_agent:{
        execute:async()=>{effects++;return {ok:true};},
        invokeCapability:async()=>{effects++;return {ok:true};},
      },
    };
    const context={
      manifest,
      trustDecision:{eligible:true,state:'active'},
      stateDir:root,
      bridgeAdapters:adapters,
    };
    assert.equal(isMicroSeedExecutionQuarantined(id),true);
    await assert.rejects(
      executeMicroSeedWorkload({
        ...context,
        telemetry:{primary_function_busy:false,cpu_utilization:0.1,memory_free_mb:900,observed_at:new Date().toISOString()},
        request:{
          device_id:id,
          workload_class:'systemia.content-hash.v1',
          idempotency_key:'direct-call-hold',
          payload:{value:'never execute'},
        },
        executionContext:'gateway',
      }),
      error=>error.message===MICROSEED_EXECUTION_QUARANTINE_REASON
    );
    await assert.rejects(
      invokeMicroSeedCapability({
        ...context,
        request:{
          device_id:id,
          capability_index:0,
          operation:'observe',
          idempotency_key:'direct-capability-hold',
          payload:{},
        },
      }),
      error=>error.message===MICROSEED_EXECUTION_QUARANTINE_REASON
    );
    assert.equal(effects,0);
    assert.deepEqual(fs.readdirSync(root),[]);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('Node001 safety hold does not quarantine unrelated owned test device',()=>{
  assert.equal(isMicroSeedExecutionQuarantined('synthetic-other-device'),false);
  assert.equal(isMicroSeedExecutionQuarantined('evercraft-node001-penguin'),true);
});
