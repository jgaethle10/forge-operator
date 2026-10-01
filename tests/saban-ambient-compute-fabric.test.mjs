import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ambientCapabilityToComputeOffer,
  resolveAmbientComputeOffers,
  AmbientMicroWorkloads,
} from '../systemia/saban/ambient-compute-fabric.mjs';

const fridge={
  schema:'evercraft.ambient-capability.v1',
  id:'home-fridge-01',
  source_type:'smart-appliance',
  access_class:'authorized_compute',
  kind:'compute',
  operations:['execute_registered_workload'],
  endpoint:'https://device-gateway.invalid/fridge-01',
  protocol:'evercraft.capacity.v1',
  owner_ref:'owner-consent-receipt-123',
  observed_at:'2026-10-01T00:00:00.000Z',
  metadata:{
    device_class:'refrigerator',
    device_model:'example-smart-fridge',
    resources:{cpu_units:0.2,memory_mb:256,storage_gb:0.5,gpu_count:0},
    supported_workloads:[
      'systemia.sensor-relay.v1',
      'systemia.content-hash.v1',
      'systemia.queue-relay.v1',
    ],
    placement_labels:['home','appliance','micro-node'],
    micro_node:true,
    zero_cost:true,
    attested:true,
    valid_version:true,
    uptime_7d:0.99,
    public_ingress:false,
    persistent_storage:false,
    power_budget_watts:3,
    thermal_budget:'tiny',
  },
};

test('an authorized refrigerator can become bounded zero-cost Saban compute',()=>{
  const offer=ambientCapabilityToComputeOffer(fridge);
  assert.equal(offer.market,'ambient-fabric');
  assert.equal(offer.access_class,'authorized_compute');
  assert.equal(offer.metadata.device_class,'refrigerator');
  assert.equal(offer.metadata.micro_node,true);
  assert.equal(offer.economics.zero_cost,true);
  assert.equal(offer.economics.hourly_usd,0);
  assert.equal(offer.metadata.arbitrary_code_execution,false);
  assert.equal(offer.trust.attested,true);
});

test('Saban only routes workload classes explicitly advertised by the device',()=>{
  const ok=resolveAmbientComputeOffers({
    capabilities:[fridge],
    workloadClass:'systemia.content-hash.v1',
  });
  assert.equal(ok.offers.length,1);

  const no=resolveAmbientComputeOffers({
    capabilities:[fridge],
    workloadClass:'systemia.rivet-report-runtime.v1',
  });
  assert.equal(no.offers.length,0);
  assert.equal(no.rejected[0].reason,'workload_unsupported');
});

test('visible appliance without authorization is never compute',()=>{
  assert.throws(
    ()=>ambientCapabilityToComputeOffer({...fridge,owner_ref:null}),
    /authorization_reference_required/
  );
});

test('public observations and open protocols cannot silently become compute workers',()=>{
  assert.throws(
    ()=>ambientCapabilityToComputeOffer({...fridge,access_class:'public_observation'}),
    /authorized_or_voluntary_access/
  );
});

test('micro workload vocabulary covers useful tiny-node work',()=>{
  for(const id of [
    'systemia.health-probe.v1',
    'systemia.sensor-relay.v1',
    'systemia.queue-relay.v1',
    'systemia.telemetry-normalizer.v1',
    'systemia.content-hash.v1',
    'systemia.cache-fragment.v1',
    'systemia.chunk-transform.v1',
  ]) assert.ok(AmbientMicroWorkloads.includes(id));
});
