import assert from 'node:assert/strict';
import { auditFailureDomains } from './failure-domain-audit.mjs';
import { planFailureDomainRebalance } from './failure-domain-rebalance.mjs';

const offer=(id,domains)=>({
  schema:'evercraft.saban.compute-offer.v1',
  offer_id:id,
  provider_id:id+'-provider',
  market:'proof',
  access_class:'authorized_compute',
  resources:{cpu_units:8,memory_mb:8192,storage_gb:50,gpu_count:0,gpu_models:[]},
  placement:{},
  trust:{uptime_7d:1,audited:true,valid_version:true,attested:true},
  economics:{zero_cost:true,quoted:true,hourly_usd:0,total_usd:0},
  metadata:{failure_domains:domains,supported_workloads:['proof.v1']},
});

const offers=[
  offer('a',{failure_domain:'a',site_id:'s1',network_id:'n1',power_domain:'p1',provider_account:'acct1'}),
  offer('c',{failure_domain:'c',site_id:'s1',network_id:'n1',power_domain:'p1',provider_account:'acct1'}),
  offer('b',{failure_domain:'b',site_id:'s2',network_id:'n2',power_domain:'p2',provider_account:'acct2'}),
  offer('unknown',{failure_domain:'u'}),
];

const fabricPlan={
  schema:'evercraft.saban.heterogeneous-fabric-plan.v1',
  placements:[
    {
      task_id:'moveable',
      unit_id:'moveable:r0',
      offer_id:'a',
      provider_id:'a-provider',
      preemptible:true,
      checkpointable:true,
    },
    {
      task_id:'moveable',
      unit_id:'moveable:r1',
      offer_id:'c',
      provider_id:'c-provider',
      preemptible:true,
      checkpointable:true,
    },
    {
      task_id:'drain',
      unit_id:'drain:r0',
      offer_id:'a',
      provider_id:'a-provider',
      preemptible:false,
      checkpointable:false,
    },
    {
      task_id:'drain',
      unit_id:'drain:r1',
      offer_id:'c',
      provider_id:'c-provider',
      preemptible:false,
      checkpointable:false,
    },
    {
      task_id:'unknown',
      unit_id:'unknown:r0',
      offer_id:'a',
      provider_id:'a-provider',
      preemptible:true,
      checkpointable:true,
    },
    {
      task_id:'unknown',
      unit_id:'unknown:r1',
      offer_id:'unknown',
      provider_id:'unknown-provider',
      preemptible:true,
      checkpointable:true,
    },
    {
      task_id:'no-candidate',
      unit_id:'no-candidate:r0',
      offer_id:'a',
      provider_id:'a-provider',
      preemptible:true,
      checkpointable:true,
    },
    {
      task_id:'no-candidate',
      unit_id:'no-candidate:r1',
      offer_id:'c',
      provider_id:'c-provider',
      preemptible:true,
      checkpointable:true,
    },
  ],
  eligible_offers_by_task:{
    moveable:['a','c','b'],
    drain:['a','c','b'],
    unknown:['a','unknown','b'],
    'no-candidate':['a','c'],
  },
};

const audit=auditFailureDomains({offers,fabricPlan});
const plan=planFailureDomainRebalance({
  audit,
  fabricPlan,
  offers,
  checkpoints:{'moveable:r1':{checkpoint_id:'cp-1'}},
});

const move=plan.actions.find(x=>x.task_id==='moveable');
assert.equal(move.action,'move_replica_to_independent_domain');
assert.equal(move.to_offer_id,'b');
assert.equal(move.checkpoint_required,true);
assert.equal(move.checkpoint_present,true);
assert.equal(move.automatic_execution_authorized,false);

const drain=plan.actions.find(x=>x.task_id==='drain');
assert.equal(drain.action,'drain_then_rebalance');
assert.equal(drain.to_offer_id,'b');

const unknown=plan.actions.find(x=>x.task_id==='unknown');
assert.equal(unknown.action,'collect_failure_domain_evidence');
assert.ok(unknown.missing_axes.includes('site_id'));

const expand=plan.actions.find(x=>x.task_id==='no-candidate');
assert.equal(expand.action,'expand_resource_field_for_distinct_failure_domain');
assert.equal(expand.paid_capacity_auto_authorized,false);
assert.equal(expand.authority_expansion,false);

assert.equal(plan.move_count,1);
assert.equal(plan.drain_count,1);
assert.equal(plan.evidence_collection_count,1);
assert.equal(plan.resource_expansion_count,1);
assert.equal(plan.policy.audit_never_moves_work_by_itself,true);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.failure-domain-rebalance-proof.v1',
  checkpointable_replica_move_planned:true,
  nonpreemptible_work_requires_drain:true,
  missing_evidence_blocks_move:true,
  no_candidate_becomes_resource_field_expansion:true,
  authority_not_expanded:true,
},null,2));
