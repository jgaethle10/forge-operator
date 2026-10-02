import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMicroDeviceManifest,
} from '../systemia/saban/microseed-device-bridge.mjs';
import { compileCapacityOrganismState } from '../systemia/saban/capacity-organism.mjs';
import { buildMicroSeedAdapterHealth } from '../systemia/saban/microseed-adapter-catalog.mjs';

const manifest=normalizeMicroDeviceManifest({
  device_id:'matter-fridge-01',
  device_class:'refrigerator',
  bridge_mode:'matter',
  compute_execution_mode:'none',
  authorization_ref:'owner-fridge',
  endpoint:'matter://home/fridge',
  supported_workloads:[],
  capabilities:[{
    kind:'observation',
    operations:['observe'],
    protocol:'matter',
    metadata:{
      locality_tags:['home'],
      matter:{
        node_id:'1234',
        endpoint:'1',
        operations:{
          observe:{
            type:'read',
            cluster:'TemperatureMeasurement',
            attribute:'MeasuredValue',
          },
        },
      },
    },
  }],
  resources:{cpu_units:0,memory_mb:0,storage_gb:0},
  attestation:{mode:'gateway_bound',gateway_identity:'home-hub'},
  observed_at:'2026-10-01T04:00:00.000Z',
});

const snapshot={
  schema:'evercraft.saban.ambient-device-registry-snapshot.v1',
  eligible_count:1,
  rows:[{
    device_id:'matter-fridge-01',
    state:'active',
    eligible:true,
    reason:'authorized_fresh',
    manifest,
    conformance:null,
  }],
};

test('resident organism rejects authorized Matter device when chip-tool is not executable',()=>{
  const health=buildMicroSeedAdapterHealth({
    executables:{'chip-tool':false},
    observed_at:'2026-10-01T04:00:00.000Z',
  });
  const state=compileCapacityOrganismState({
    registrySnapshot:snapshot,
    adapterHealth:health,
    now:new Date('2026-10-01T04:01:00.000Z'),
  });
  assert.equal(state.compiled_capability_count,0);
  assert.equal(state.adapter_health.present,true);
  assert.equal(state.adapter_health.rejected_device_count,1);
  assert.ok(state.rejected_devices[0].reason.includes('runtime_dependency_missing:chip-tool'));
});

test('resident organism compiles Matter capability when runtime adapter health is ready',()=>{
  const health=buildMicroSeedAdapterHealth({
    executables:{'chip-tool':true},
    observed_at:'2026-10-01T04:00:00.000Z',
  });
  const state=compileCapacityOrganismState({
    registrySnapshot:snapshot,
    adapterHealth:health,
    now:new Date('2026-10-01T04:01:00.000Z'),
  });
  assert.equal(state.compiled_capability_count,1);
  assert.equal(state.adapter_health.rejected_device_count,0);
  assert.ok(state.adapter_health.active_modes.includes('matter'));
  assert.equal(
    state.rejected_devices.some(x=>String(x.reason).startsWith('bridge_unavailable:')),
    false
  );
});

test('without resident health, static truth keeps Matter held but built-in adapters eligible',()=>{
  const state=compileCapacityOrganismState({
    registrySnapshot:snapshot,
    adapterHealth:null,
    now:new Date('2026-10-01T04:01:00.000Z'),
  });
  assert.equal(state.compiled_capability_count,0);
  assert.ok(state.rejected_devices[0].reason.includes('runtime_dependency_missing:chip-tool'));
});
