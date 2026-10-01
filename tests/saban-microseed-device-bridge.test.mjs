import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMicroDeviceManifest,
  microDeviceToAmbientCapability,
  MicroSeedBridgeModes,
} from '../systemia/saban/microseed-device-bridge.mjs';
import { resolveAmbientComputeOffers } from '../systemia/saban/ambient-compute-fabric.mjs';

const fridge={
  device_id:'fridge-kitchen-01',
  device_class:'refrigerator',
  bridge_mode:'matter',
  authorization_ref:'owner-approved-home-appliances',
  endpoint:'matter://home-hub/fridge-kitchen-01',
  protocol:'evercraft.microseed.v1',
  supported_workloads:['systemia.sensor-relay.v1','systemia.telemetry-normalizer.v1'],
  operations:['read_temperature','read_door_state'],
  resources:{cpu_units:0.05,memory_mb:64,storage_gb:0.1},
  placement_labels:['home','appliance','micro-node'],
  max_concurrency:1,
  duty_cycle:'opportunistic',
  power_budget_watts:1,
  attestation:{mode:'gateway_bound',gateway_identity:'hub-fingerprint-1'},
};

test('MicroSeed turns an authorized constrained refrigerator into a bounded ambient capability',()=>{
  const manifest=normalizeMicroDeviceManifest(fridge);
  assert.equal(manifest.schema,'evercraft.microseed.device-manifest.v1');
  assert.equal(manifest.device_class,'refrigerator');
  assert.equal(manifest.constraints.arbitrary_code_execution,false);
  assert.match(manifest.authorization_ref_hash,/^sha256:/);

  const capability=microDeviceToAmbientCapability(manifest);
  assert.equal(capability.access_class,'authorized_compute');
  assert.equal(capability.kind,'compute');
  assert.equal(capability.metadata.bridge_mode,'matter');
  assert.equal(capability.metadata.micro_node,true);
  assert.equal(capability.metadata.arbitrary_code_execution,false);

  const resolved=resolveAmbientComputeOffers({
    capabilities:[capability],
    workloadClass:'systemia.sensor-relay.v1',
  });
  assert.equal(resolved.offers.length,1);
  assert.equal(resolved.offers[0].metadata.device_class,'refrigerator');
  assert.equal(resolved.offers[0].economics.zero_cost,true);
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

test('MicroSeed supports multiple constrained-device bridge families',()=>{
  for(const mode of ['native_agent','lan_api','mqtt','ble_proxy','serial','usb','matter','thread','zigbee_gateway']){
    assert.ok(MicroSeedBridgeModes.includes(mode));
  }
});
