import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AmbientDeviceRegistry } from '../systemia/saban/ambient-device-registry.mjs';
import { normalizeMicroDeviceManifest } from '../systemia/saban/microseed-device-bridge.mjs';
import { compileCapacityOrganismState } from '../systemia/saban/capacity-organism.mjs';

test('resident registry persists authorization, heartbeat eligibility, and revocation',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-ambient-registry-'));
  try{
    const registry=new AmbientDeviceRegistry({root});
    const manifest=normalizeMicroDeviceManifest({
      device_id:'fridge-01',
      device_class:'refrigerator',
      bridge_mode:'matter',
      authorization_ref:'owner-fridge',
      endpoint:'matter://hub/fridge-01',
      supported_workloads:[],
      capabilities:[{
        kind:'observation',
        operations:['observe'],
        protocol:'matter',
        metadata:{sensors:['temperature','door_state']},
      }],
      resources:{cpu_units:0.2,memory_mb:256,storage_gb:0.5},
      max_concurrency:1,
      duty_cycle:'opportunistic',
      attestation:{mode:'gateway_bound',gateway_identity:'hub-a'},
      observed_at:'2026-10-01T03:00:00.000Z',
    });

    registry.observe({device_id:'fridge-01',observed_at:'2026-10-01T03:00:00.000Z'});
    registry.candidate({device_id:'fridge-01',manifest});
    registry.authorize({
      device_id:'fridge-01',
      approval_ref:'explicit-owner-approval',
      expires_at:'2026-10-02T03:00:00.000Z',
      heartbeat_target_seconds:60,
      attestation_mode:'gateway_bound',
      attestation_identity:'hub-a',
      authorized_at:'2026-10-01T03:01:00.000Z',
    });
    registry.heartbeat({
      device_id:'fridge-01',
      capability_manifest_hash:manifest.manifest_hash,
      attestation_identity:'hub-a',
      observed_at:'2026-10-01T03:01:20.000Z',
    });

    let snap=registry.list({now:new Date('2026-10-01T03:02:00.000Z')});
    assert.equal(snap.eligible_count,1);
    assert.equal(snap.rows[0].state,'active');
    assert.equal(snap.rows[0].manifest.device_class,'refrigerator');

    snap=registry.list({now:new Date('2026-10-01T03:05:00.000Z')});
    assert.equal(snap.eligible_count,0);
    assert.equal(snap.rows[0].reason,'heartbeat_stale');

    registry.revoke({
      device_id:'fridge-01',
      approval_ref:'explicit-owner-revoke',
      revoked_at:'2026-10-01T03:06:00.000Z',
    });
    snap=registry.list({now:new Date('2026-10-01T03:06:10.000Z')});
    assert.equal(snap.eligible_count,0);
    assert.equal(snap.rows[0].state,'revoked');
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('capacity organism compiles only fresh trusted devices into zero-spend offers',()=>{
  const freshManifest=normalizeMicroDeviceManifest({
    device_id:'phone-01',
    device_class:'phone',
    bridge_mode:'native_agent',
    authorization_ref:'owner-phone',
    endpoint:'evercraft://phone-01',
    supported_workloads:['systemia.content-hash.v1','systemia.telemetry-normalizer.v1'],
    resources:{cpu_units:1,memory_mb:2048,storage_gb:16},
    max_concurrency:2,
    duty_cycle:'opportunistic',
    attestation:{mode:'device',device_identity:'phone-key'},
    observed_at:'2026-10-01T03:00:00.000Z',
  });
  const snapshot={
    schema:'evercraft.saban.ambient-device-registry-snapshot.v1',
    eligible_count:1,
    rows:[
      {device_id:'phone-01',state:'active',eligible:true,reason:'authorized_fresh',manifest:freshManifest},
      {device_id:'mystery-01',state:'observed',eligible:false,reason:'not_authorized',manifest:null},
    ],
  };
  const state=compileCapacityOrganismState({
    registrySnapshot:snapshot,
    now:new Date('2026-10-01T03:01:00.000Z'),
  });
  assert.equal(state.active_device_count,1);
  assert.equal(state.compute_offer_count,1);
  assert.equal(state.commercial_capacity_considered,false);
  assert.equal(state.commercial_capacity_authorized,false);
  assert.equal(state.observation_never_grants_authority,true);
  assert.ok(state.rejected_devices.some(x=>x.device_id==='mystery-01'));
});

test('capacity organism reports missing production capacity instead of inventing it',()=>{
  const state=compileCapacityOrganismState({
    registrySnapshot:{
      schema:'evercraft.saban.ambient-device-registry-snapshot.v1',
      eligible_count:0,
      rows:[],
    },
    now:new Date('2026-10-01T03:01:00.000Z'),
  });
  assert.equal(state.production_ready,false);
  assert.equal(state.compute_offer_count,0);
  assert.ok(state.missing_capacity.length>0);
});
