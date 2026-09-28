import assert from 'node:assert/strict';
import { resolveAmbientCapabilities } from './ambient-capability-resolver.mjs';

const fabric=[
  {
    id:'plane-adsb-001',
    source_type:'aircraft',
    access_class:'open_protocol',
    kind:'observation',
    operations:['observe','receive'],
    protocol:'ADS-B',
  },
  {
    id:'drone-remote-id-001',
    source_type:'drone',
    access_class:'open_protocol',
    kind:'observation',
    operations:['observe','receive'],
    protocol:'Remote ID',
  },
  {
    id:'speaker-ble-001',
    source_type:'speaker',
    access_class:'public_observation',
    kind:'observation',
    operations:['observe'],
    protocol:'BLE advertisement',
  },
  {
    id:'browser-worker-001',
    source_type:'browser',
    access_class:'voluntary_compute',
    kind:'compute',
    operations:['compute'],
    protocol:'Evercraft Worker v1',
    endpoint:'https://worker.example/v1',
    terms_ref:'terms:worker-session:abc',
  },
  {
    id:'private-fridge-001',
    source_type:'refrigerator',
    access_class:'public_observation',
    kind:'actuation',
    operations:['actuate'],
    protocol:'unknown',
  },
];

const observed=resolveAmbientCapabilities({
  capabilities:fabric,
  requestedOperation:'observe',
  requestedKinds:['observation'],
});
assert.deepEqual(observed.eligible.map(x=>x.id).sort(),[
  'drone-remote-id-001',
  'plane-adsb-001',
  'speaker-ble-001',
]);

const remoteId=resolveAmbientCapabilities({
  capabilities:fabric,
  requestedOperation:'receive',
  requestedKinds:['observation'],
  requiredProtocols:['Remote ID'],
});
assert.deepEqual(remoteId.eligible.map(x=>x.id),['drone-remote-id-001']);

const compute=resolveAmbientCapabilities({
  capabilities:fabric,
  requestedOperation:'compute',
  requestedKinds:['compute'],
});
assert.deepEqual(compute.eligible.map(x=>x.id),['browser-worker-001']);

const fridge=resolveAmbientCapabilities({
  capabilities:fabric,
  requestedOperation:'actuate',
  requestedKinds:['actuation'],
});
assert.equal(fridge.eligible.length,0);
assert.equal(fridge.rejected[0].id,'private-fridge-001');
assert.equal(fridge.rejected[0].reason,'public_observation_is_read_only');

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.ambient-capability-resolver-proof.v1',
  public_broadcasts_are_usable:true,
  voluntary_compute_is_usable:true,
  private_device_control_is_not_inferred_from_visibility:true,
},null,2));
