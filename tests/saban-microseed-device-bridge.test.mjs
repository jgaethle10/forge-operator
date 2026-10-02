import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMicroDeviceManifest,
  microDeviceToAmbientCapability,
  microDeviceToAmbientCapabilities,
  MicroSeedBridgeModes,
} from '../systemia/saban/microseed-device-bridge.mjs';
import { resolveAmbientComputeOffers } from '../systemia/saban/ambient-compute-fabric.mjs';

const fridge={
  device_id:'fridge-kitchen-01',
  device_class:'refrigerator',
  bridge_mode:'matter',
  authorization_ref:'owner-approved-home-appliances',
  endpoint:'matter://home-hub/fridge-kitchen-01',
  protocol:'matter',
  supported_workloads:[],
  operations:['read_temperature','read_door_state'],
  capabilities:[
    {
      kind:'observation',
      operations:['observe'],
      protocol:'matter',
      metadata:{
        sensors:['temperature','door_state'],
        locality_tags:['home','kitchen'],
      },
    },
  ],
  resources:{cpu_units:0.05,memory_mb:64,storage_gb:0.1},
  placement_labels:['home','appliance','micro-node'],
  max_concurrency:1,
  duty_cycle:'opportunistic',
  power_budget_watts:1,
  attestation:{mode:'gateway_bound',gateway_identity:'hub-fingerprint-1'},
};

test('MicroSeed turns an authorized constrained refrigerator into truthful non-compute capabilities',()=>{
  const manifest=normalizeMicroDeviceManifest(fridge);
  assert.equal(manifest.schema,'evercraft.microseed.device-manifest.v1');
  assert.equal(manifest.device_class,'refrigerator');
  assert.equal(manifest.compute_execution_mode,'none');
  assert.equal(manifest.constraints.arbitrary_code_execution,false);
  assert.match(manifest.authorization_ref_hash,/^sha256:/);

  const capabilities=microDeviceToAmbientCapabilities(manifest);
  assert.equal(capabilities.length,1);
  const observation=capabilities[0];
  assert.equal(observation.access_class,'authorized_compute');
  assert.equal(observation.kind,'observation');
  assert.equal(observation.metadata.bridge_mode,'matter');
  assert.equal(observation.metadata.execution_location,'device_capability_via_gateway');
  assert.equal(observation.metadata.arbitrary_code_execution,false);

  assert.throws(
    ()=>microDeviceToAmbientCapability(manifest),
    /native_compute_not_declared/
  );

  const resolved=resolveAmbientComputeOffers({
    capabilities,
    workloadClass:'systemia.sensor-relay.v1',
  });
  assert.equal(resolved.offers.length,0);
});

test('native-agent MicroSeed may truthfully advertise bounded compute',()=>{
  const manifest=normalizeMicroDeviceManifest({
    device_id:'old-phone-01',
    device_class:'phone',
    bridge_mode:'native_agent',
    authorization_ref:'owner-phone',
    endpoint:'https://phone.local/evercraft',
    supported_workloads:['systemia.content-hash.v1'],
    resources:{cpu_units:0.5,memory_mb:1024,storage_gb:8},
    max_concurrency:2,
    duty_cycle:'opportunistic',
    attestation:{mode:'device',device_identity:'phone-key'},
  });
  assert.equal(manifest.compute_execution_mode,'native_device');

  const capability=microDeviceToAmbientCapability(manifest);
  assert.equal(capability.kind,'compute');
  assert.equal(capability.metadata.execution_location,'device');
  assert.equal(capability.metadata.device_class,'phone');

  const resolved=resolveAmbientComputeOffers({
    capabilities:[capability],
    workloadClass:'systemia.content-hash.v1',
  });
  assert.equal(resolved.offers.length,1);
});

test('MicroSeed requires owner authorization',()=>{
  assert.throws(
    ()=>normalizeMicroDeviceManifest({...fridge,authorization_ref:null}),
    /micro_device_authorization_required/
  );
});

test('MicroSeed rejects unsupported bridge modes',()=>{
  assert.throws(
    ()=>normalizeMicroDeviceManifest({...fridge,bridge_mode:'magic-radio'}),
    /micro_device_bridge_mode_invalid/
  );
});

test('non-native devices cannot claim native compute without explicit verification',()=>{
  assert.throws(
    ()=>normalizeMicroDeviceManifest({
      ...fridge,
      compute_execution_mode:'native_device',
      supported_workloads:['systemia.content-hash.v1'],
    }),
    /native_compute_requires_verified_native_agent/
  );
});

test('MicroSeed supports multiple constrained-device bridge families',()=>{
  for(const mode of ['native_agent','lan_api','mqtt','ble_proxy','serial','usb','matter','thread','zigbee_gateway']){
    assert.ok(MicroSeedBridgeModes.includes(mode));
  }
});


test('normalizing an already-normalized MicroSeed preserves nested constraints and rehashes intentional edits',()=>{
  const first=normalizeMicroDeviceManifest({
    device_id:'stable-phone',
    device_class:'phone',
    bridge_mode:'native_agent',
    authorization_ref:'owner-phone',
    endpoint:'http://127.0.0.1:8792',
    supported_workloads:['systemia.content-hash.v1'],
    resources:{cpu_units:1,memory_mb:1024,storage_gb:4},
    placement_labels:['owned','home'],
    public_ingress:false,
    persistent_storage:true,
    max_concurrency:3,
    duty_cycle:'always_on',
    thermal_budget:'moderate',
    power_budget_watts:8,
    primary_function_priority:true,
    cpu_utilization_ceiling:0.72,
    memory_reserve_mb:192,
    temperature_ceiling_c:70,
    battery_floor_percent:25,
    require_external_power:true,
    network_utilization_ceiling:0.55,
    attestation:{mode:'device',device_identity:'key'},
  });

  const second=normalizeMicroDeviceManifest({
    ...first,
    endpoint:'http://127.0.0.1:9999',
  });

  assert.equal(second.authorization_ref_hash,first.authorization_ref_hash);
  assert.equal(second.constraints.duty_cycle,'always_on');
  assert.equal(second.constraints.max_concurrency,3);
  assert.equal(second.constraints.memory_reserve_mb,192);
  assert.equal(second.constraints.cpu_utilization_ceiling,0.72);
  assert.equal(second.constraints.temperature_ceiling_c,70);
  assert.equal(second.constraints.battery_floor_percent,25);
  assert.equal(second.constraints.require_external_power,true);
  assert.equal(second.constraints.network_utilization_ceiling,0.55);
  assert.deepEqual(second.placement.labels,['owned','home']);
  assert.equal(second.placement.persistent_storage,true);
  assert.notEqual(second.manifest_hash,first.manifest_hash);
});
