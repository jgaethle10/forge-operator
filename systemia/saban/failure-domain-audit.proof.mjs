import assert from 'node:assert/strict';
import { auditFailureDomains } from './failure-domain-audit.mjs';

const offer=(id,domains)=>({
  schema:'evercraft.saban.compute-offer.v1',
  offer_id:id,
  provider_id:id+'-provider',
  market:'proof',
  access_class:'authorized_compute',
  resources:{cpu_units:4,memory_mb:4096,storage_gb:20,gpu_count:0,gpu_models:[]},
  placement:{},
  trust:{uptime_7d:1,audited:true,valid_version:true,attested:true},
  economics:{zero_cost:true,quoted:true,hourly_usd:0,total_usd:0},
  metadata:{
    supported_workloads:['proof.workload.v1'],
    failure_domains:domains,
  },
});

const offers=[
  offer('a',{
    failure_domain:'machine-a',
    site_id:'site-1',
    network_id:'isp-a',
    power_domain:'panel-a',
    provider_account:'account-a',
  }),
  offer('b',{
    failure_domain:'machine-b',
    site_id:'site-2',
    network_id:'isp-b',
    power_domain:'panel-b',
    provider_account:'account-b',
  }),
  offer('c',{
    failure_domain:'machine-c',
    site_id:'site-1',
    network_id:'isp-a',
    power_domain:'panel-a',
    provider_account:'account-a',
  }),
  offer('unknown',{
    failure_domain:'machine-d',
  }),
];

const plan={
  schema:'evercraft.saban.heterogeneous-fabric-plan.v1',
  placements:[
    {task_id:'independent',unit_id:'independent:r0',offer_id:'a'},
    {task_id:'independent',unit_id:'independent:r1',offer_id:'b'},
    {task_id:'correlated',unit_id:'correlated:r0',offer_id:'a'},
    {task_id:'correlated',unit_id:'correlated:r1',offer_id:'c'},
    {task_id:'unknown',unit_id:'unknown:r0',offer_id:'a'},
    {task_id:'unknown',unit_id:'unknown:r1',offer_id:'unknown'},
    {task_id:'single',unit_id:'single:r0',offer_id:'a'},
  ],
};

const audit=auditFailureDomains({offers,fabricPlan:plan});

const independent=audit.tasks.find(x=>x.task_id==='independent');
assert.equal(independent.state,'independent');
assert.equal(independent.colliding_axes.length,0);
assert.equal(independent.missing_axes.length,0);

const correlated=audit.tasks.find(x=>x.task_id==='correlated');
assert.equal(correlated.state,'correlated_failure_risk');
assert.ok(correlated.colliding_axes.includes('site_id'));
assert.ok(correlated.colliding_axes.includes('network_id'));
assert.ok(correlated.colliding_axes.includes('power_domain'));
assert.ok(correlated.colliding_axes.includes('provider_account'));

const unknown=audit.tasks.find(x=>x.task_id==='unknown');
assert.equal(unknown.state,'evidence_incomplete');
assert.ok(unknown.missing_axes.includes('site_id'));
assert.ok(unknown.missing_axes.includes('network_id'));
assert.ok(unknown.missing_axes.includes('power_domain'));
assert.ok(unknown.missing_axes.includes('provider_account'));

const single=audit.tasks.find(x=>x.task_id==='single');
assert.equal(single.state,'single_placement');

assert.equal(audit.replicated_task_count,3);
assert.equal(audit.independent_replicated_task_count,1);
assert.equal(audit.correlated_failure_risk_task_count,1);
assert.equal(audit.evidence_incomplete_task_count,1);
assert.equal(audit.policy.replica_count_is_not_resilience,true);
assert.equal(audit.policy.missing_evidence_is_not_independence,true);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.failure-domain-audit-proof.v1',
  true_independence_detected:true,
  correlated_site_network_power_account_detected:true,
  missing_evidence_fails_open_to_unknown_not_safe:true,
  single_placement_not_mislabeled_redundant:true,
  no_authority_expansion:true,
},null,2));
