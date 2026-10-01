import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizeMicroDeviceManifest } from '../systemia/saban/microseed-device-bridge.mjs';
import { invokeMicroSeedCapability } from '../systemia/saban/microseed-capability-executor.mjs';

const trust={eligible:true,state:'active'};

test('unknown consequential outcome is durably frozen and never blindly retried',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-uncertain-capability-'));
  let calls=0;
  try{
    const manifest=normalizeMicroDeviceManifest({
      device_id:'thermostat-01',
      device_class:'thermostat',
      bridge_mode:'lan_api',
      authorization_ref:'owner-thermostat',
      endpoint:'https://thermostat.local',
      capabilities:[{
        kind:'actuation',
        operations:['set_temperature'],
        protocol:'https',
        metadata:{
          consequential:true,
          http:{
            operations:{
              set_temperature:{method:'POST',path:'/set'},
            },
          },
        },
      }],
      resources:{cpu_units:0,memory_mb:0,storage_gb:0},
      attestation:{mode:'gateway_bound',gateway_identity:'home-hub'},
    });

    const adapter={
      async invokeCapability(){
        calls+=1;
        const error=new Error('socket_closed_after_send');
        error.outcome_unknown=true;
        throw error;
      },
    };
    const request={
      device_id:'thermostat-01',
      capability_index:0,
      operation:'set_temperature',
      idempotency_key:'set-temp-72',
      payload:{temperature_f:72},
      approval_ref:'owner-approved-72',
    };

    await assert.rejects(
      ()=>invokeMicroSeedCapability({
        manifest,
        trustDecision:trust,
        request,
        stateDir:root,
        bridgeAdapters:{lan_api:adapter},
        now:new Date('2026-10-01T05:00:00.000Z'),
      }),
      /outcome_unknown_manual_reconciliation_required/
    );
    assert.equal(calls,1);

    const files=fs.readdirSync(path.join(root,'capability-idempotency','thermostat-01'));
    assert.equal(files.length,1);
    const hold=JSON.parse(fs.readFileSync(
      path.join(root,'capability-idempotency','thermostat-01',files[0]),
      'utf8'
    ));
    assert.equal(hold.schema,'evercraft.microseed.capability-uncertain.v1');
    assert.equal(hold.outcome_unknown,true);
    assert.equal(hold.retry_suppressed,true);
    assert.equal(hold.manual_reconciliation_required,true);
    assert.equal(hold.approval_value_exposed,false);

    await assert.rejects(
      ()=>invokeMicroSeedCapability({
        manifest,
        trustDecision:trust,
        request,
        stateDir:root,
        bridgeAdapters:{lan_api:adapter},
        now:new Date('2026-10-01T05:01:00.000Z'),
      }),
      /prior_outcome_unknown_manual_reconciliation_required/
    );
    assert.equal(calls,1);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('uncertain tombstone still enforces idempotency conflict protection',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-uncertain-conflict-'));
  let calls=0;
  try{
    const manifest=normalizeMicroDeviceManifest({
      device_id:'relay-01',
      device_class:'relay',
      bridge_mode:'lan_api',
      authorization_ref:'owner-relay',
      endpoint:'https://relay.local',
      capabilities:[{
        kind:'actuation',
        operations:['switch'],
        protocol:'https',
        metadata:{consequential:true,http:{operations:{switch:{method:'POST',path:'/switch'}}}},
      }],
      resources:{cpu_units:0,memory_mb:0,storage_gb:0},
      attestation:{mode:'gateway_bound',gateway_identity:'hub'},
    });
    const adapter={async invokeCapability(){
      calls+=1;
      const e=new Error('ambiguous');
      e.outcome_unknown=true;
      throw e;
    }};
    const base={
      device_id:'relay-01',
      capability_index:0,
      operation:'switch',
      idempotency_key:'relay-switch-1',
      approval_ref:'approved',
    };
    await assert.rejects(()=>invokeMicroSeedCapability({
      manifest,trustDecision:trust,
      request:{...base,payload:{on:true}},
      stateDir:root,bridgeAdapters:{lan_api:adapter},
    }));
    await assert.rejects(
      ()=>invokeMicroSeedCapability({
        manifest,trustDecision:trust,
        request:{...base,payload:{on:false}},
        stateDir:root,bridgeAdapters:{lan_api:adapter},
      }),
      /idempotency_key_conflict/
    );
    assert.equal(calls,1);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
