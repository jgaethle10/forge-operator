import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeCapabilityFabric,
  rivetAliEvCapabilityRoles,
} from '../systemia/saban/capability-fabric-composer.mjs';

function cap({
  id,kind,operation,protocol='evercraft.test.v1',access='authorized_compute',
  owner='owner',cost=0,attested=true,duty='always_on',
  storage=0,bandwidth=0,failure=id,locality=['home'],
  observed='2026-10-01T03:00:00.000Z',
}){
  return {
    schema:'evercraft.ambient-capability.v1',
    id,
    source_type:'test',
    access_class:access,
    kind,
    operations:[operation],
    endpoint:'evercraft://'+id,
    protocol,
    locality:'home',
    cost,
    terms_ref:access==='voluntary_compute'?'terms:test':null,
    owner_ref:access==='authorized_compute'?owner:null,
    observed_at:observed,
    metadata:{
      attested,
      duty_cycle:duty,
      resources:{storage_gb:storage,bandwidth_mbps:bandwidth},
      failure_domain:failure,
      locality_tags:locality,
      placement_labels:locality,
      micro_node:true,
    },
  };
}

test('Saban composes network, storage, and observation from different authorized surfaces',()=>{
  const caps=[
    cap({id:'router-a',kind:'network_ingress',operation:'receive',bandwidth:100,failure:'isp-a'}),
    cap({id:'router-b',kind:'network_ingress',operation:'receive',bandwidth:50,failure:'isp-b'}),
    cap({id:'uplink',kind:'network_egress',operation:'query_public',bandwidth:100}),
    cap({id:'nas',kind:'storage',operation:'store',storage:1000,failure:'storage-a'}),
    cap({id:'fridge-sensor',kind:'observation',operation:'observe',attested:false}),
  ];
  const plan=composeCapabilityFabric({
    roles:rivetAliEvCapabilityRoles(),
    capabilities:caps,
    now:new Date('2026-10-01T03:01:00.000Z'),
  });
  assert.equal(plan.state,'ready');
  assert.equal(plan.zero_spend,true);
  const ingress=plan.assignments.filter(x=>x.role_id==='public-network-ingress');
  assert.equal(ingress.length,2);
  assert.equal(new Set(ingress.map(x=>x.failure_domain)).size,2);
  assert.equal(plan.assignments.find(x=>x.role_id==='durable-source-storage').capability_id,'nas');
  assert.equal(plan.assignments.find(x=>x.role_id==='physical-world-observation').capability_id,'fridge-sensor');
});

test('private durable storage refuses public or voluntary capability',()=>{
  const caps=[
    cap({id:'public-store',kind:'storage',operation:'store',storage:500,access:'voluntary_compute',owner:null}),
  ];
  const role=rivetAliEvCapabilityRoles().find(x=>x.role_id==='durable-source-storage');
  const plan=composeCapabilityFabric({
    roles:[role],
    capabilities:caps,
    now:new Date('2026-10-01T03:01:00.000Z'),
  });
  assert.equal(plan.state,'held');
});

test('stale capability disappears even if it otherwise looks perfect',()=>{
  const c=cap({
    id:'old-ingress',kind:'network_ingress',operation:'receive',bandwidth:100,
    observed:'2026-10-01T01:00:00.000Z',
  });
  const role={
    role_id:'fresh-ingress',
    kind:'network_ingress',
    operation:'receive',
    allowed_access_classes:['authorized_compute'],
    max_observation_age_ms:60000,
    resources:{bandwidth_mbps:10},
  };
  const plan=composeCapabilityFabric({
    roles:[role],capabilities:[c],now:new Date('2026-10-01T03:01:00.000Z'),
  });
  assert.equal(plan.state,'held');
  assert.ok(plan.held[0].evaluated_rejections[0].reasons.includes('capability_stale'));
});
