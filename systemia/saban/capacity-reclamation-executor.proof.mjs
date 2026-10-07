import assert from 'node:assert/strict';
import { executeCapacityReclamation } from './capacity-reclamation-executor.mjs';

const entry=(offerId,action,providerId=offerId+'-provider')=>({
  offer_id:offerId,
  provider_id:providerId,
  market:'proof',
  access_class:'authorized_compute',
  zero_cost:action!=='release_paid_lease',
  state:'idle',
  idle_cycles:4,
  reclaim_eligible:true,
  recommended_action:action,
});

const ledger={
  schema:'evercraft.saban.capacity-lifecycle-ledger.v1',
  entries:[
    entry('paid','release_paid_lease'),
    entry('voluntary','relinquish_voluntary_capacity'),
    entry('spawned','stop_spawned_owned_capacity'),
    entry('owned','cool_down_owned_capacity'),
  ],
  receipt_hash:'sha256:lifecycle-proof',
};

let paidCalls=0;
let voluntaryCalls=0;
let stopCalls=0;

const bindings={
  paid:{
    adapter:{
      async release(){
        paidCalls+=1;
        return {receipt:'sha256:paid-release'};
      },
    },
    lease:{id:'paid-lease'},
  },
  voluntary:{
    adapter:{
      async release(){
        voluntaryCalls+=1;
        return {receipt_hash:'sha256:voluntary-release'};
      },
    },
    lease:{agreement_id:'voluntary-agreement'},
  },
  spawned:{
    spawned_owned:true,
    async stop(){
      stopCalls+=1;
      return {receipt:'sha256:spawn-stop'};
    },
  },
};

const noAuthority=await executeCapacityReclamation({
  lifecycleLedger:ledger,
  bindings,
  now:'2026-10-07T16:00:00.000Z',
});
assert.equal(noAuthority.completed_count,0);
assert.equal(paidCalls,0);
assert.equal(voluntaryCalls,0);
assert.equal(stopCalls,0);
assert.equal(
  noAuthority.results.find(x=>x.offer_id==='owned').state,
  'advisory_only'
);

const authority={
  schema:'evercraft.saban.capacity-reclamation-authority.v1',
  authority_id:'proof-reclaim',
  approved:true,
  allowed_actions:[
    'release_paid_lease',
    'relinquish_voluntary_capacity',
    'stop_spawned_owned_capacity',
  ],
  allowed_offer_ids:['paid','voluntary','spawned'],
  expires_at:'2026-10-08T16:00:00.000Z',
};

const run=await executeCapacityReclamation({
  lifecycleLedger:ledger,
  authority,
  bindings,
  now:'2026-10-07T16:00:00.000Z',
});
assert.equal(run.completed_count,3);
assert.equal(run.advisory_count,1);
assert.equal(run.reconciliation_required,false);
assert.equal(paidCalls,1);
assert.equal(voluntaryCalls,1);
assert.equal(stopCalls,1);
assert.equal(run.ordinary_owned_shutdown_authorized,false);

const duplicate=await executeCapacityReclamation({
  lifecycleLedger:ledger,
  authority,
  bindings,
  completedOfferIds:run.completed_offer_ids,
  now:'2026-10-07T16:01:00.000Z',
});
assert.equal(duplicate.completed_count,0);
assert.equal(duplicate.already_completed_count,3);
assert.equal(paidCalls,1);
assert.equal(voluntaryCalls,1);
assert.equal(stopCalls,1);

const badSpawn=await executeCapacityReclamation({
  lifecycleLedger:{
    ...ledger,
    entries:[entry('not-proven-spawn','stop_spawned_owned_capacity')],
  },
  authority:{
    ...authority,
    allowed_offer_ids:['not-proven-spawn'],
  },
  bindings:{
    'not-proven-spawn':{
      spawned_owned:false,
      async stop(){throw new Error('must_not_run');},
    },
  },
  now:'2026-10-07T16:02:00.000Z',
});
assert.equal(badSpawn.completed_count,0);
assert.equal(badSpawn.results[0].reason,'spawned_owned_provenance_required');

let uncertainCalls=0;
const uncertain=await executeCapacityReclamation({
  lifecycleLedger:{
    ...ledger,
    entries:[
      entry('uncertain-paid','release_paid_lease'),
      entry('after-uncertain','release_paid_lease'),
    ],
  },
  authority:{
    ...authority,
    allowed_offer_ids:['uncertain-paid','after-uncertain'],
  },
  bindings:{
    'uncertain-paid':{
      adapter:{
        async release(){
          uncertainCalls+=1;
          throw new Error('transport_dropped_after_release_request');
        },
      },
      lease:{id:'uncertain'},
    },
    'after-uncertain':{
      adapter:{
        async release(){
          uncertainCalls+=1;
          return {receipt:'sha256:should-not-run'};
        },
      },
      lease:{id:'after'},
    },
  },
  now:'2026-10-07T16:03:00.000Z',
});
assert.equal(uncertain.reconciliation_required,true);
assert.equal(uncertain.uncertain_count,1);
assert.equal(uncertainCalls,1);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.capacity-reclamation-executor-proof.v1',
  authority_required_for_side_effects:true,
  ordinary_owned_capacity_never_powered_off:true,
  paid_release_supported:true,
  voluntary_release_supported:true,
  spawned_owned_stop_requires_provenance:true,
  completed_release_is_idempotent:true,
  uncertain_release_stops_batch:true,
  secrets_not_serialized:true,
},null,2));
