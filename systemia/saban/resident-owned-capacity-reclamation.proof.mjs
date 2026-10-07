import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildLocalHostCandidate,
  createLocalHostSpawnAdapter,
  listLocalHostCapacityOffers,
  closeLocalHostCapacity,
} from './local-host-capacity.mjs';
import {
  persistOwnedSpawnCapacity,
  runResidentReclamationOnce,
} from './resource-expansion-organism.mjs';
import { runCapacityOrganismOnce } from './capacity-organism.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-owned-reclaim-proof-'));
const acquisition={
  allow_local_host_bootstrap:true,
  local_node_root:path.join(root,'owned-node'),
  local_node_id:'proof-owned-node',
};

let endpoint=null;
try{
  const candidate=buildLocalHostCandidate({acquisition});
  assert.ok(candidate);
  assert.equal(candidate.authority,'owned');
  assert.equal(candidate.spawn_capable,true);

  const adapter=createLocalHostSpawnAdapter({acquisition});
  const activated=await adapter.activate({candidate});
  endpoint=activated.capacity_endpoint;
  assert.equal(activated.execution_ready,true);
  assert.ok(endpoint);
  assert.ok(activated.safe_offer);

  const liveOffers=await listLocalHostCapacityOffers();
  assert.equal(liveOffers.length,1);
  const offer=liveOffers[0];
  assert.match(offer.offer_id,/^owned-spawn:proof-owned-node:/);
  assert.equal(offer.metadata.lifecycle_only,true);
  assert.equal(offer.metadata.resource_expansion_spawned,true);
  assert.equal(offer.metadata.lifecycle_authority,'evercraft-owned');
  assert.equal(offer.metadata.retirement_mode,'stop');
  assert.equal(offer.metadata.allocator_authority_serialized,false);
  assert.equal(JSON.stringify(offer).includes('allocator_token'),false);

  const persisted=await persistOwnedSpawnCapacity({root});
  assert.equal(persisted.offer_count,1);
  assert.equal(persisted.allocator_authority_serialized,false);

  const first=await runCapacityOrganismOnce({
    root,
    runCensus:false,
    now:new Date('2026-10-07T16:00:00.000Z'),
  });
  assert.equal(first.owned_spawn_lifecycle_offer_count,1);
  assert.equal(first.owned_spawn_capacity.scheduling_enabled,false);
  assert.equal(first.owned_spawn_capacity.lifecycle_tracking_enabled,true);
  assert.equal(first.compute_offer_count,0);
  assert.equal(first.capacity_lifecycle.reclaim_eligible_count,0);

  const second=await runCapacityOrganismOnce({
    root,
    runCensus:false,
    now:new Date('2026-10-07T16:05:00.000Z'),
  });
  assert.equal(second.capacity_lifecycle.reclaim_eligible_count,0);

  const third=await runCapacityOrganismOnce({
    root,
    runCensus:false,
    now:new Date('2026-10-07T16:11:00.000Z'),
  });
  assert.equal(third.capacity_lifecycle.reclaim_eligible_count,1);
  assert.equal(third.capacity_lifecycle.reclamation_execution_ready_count,1);
  assert.equal(third.capacity_lifecycle.stop_spawned_owned_capacity_count,1);

  const held=await runResidentReclamationOnce({
    root,
    now:new Date('2026-10-07T16:11:30.000Z'),
  });
  assert.equal(held.completed_count,0);
  assert.equal(held.held_count,1);
  assert.equal(held.results[0].reason,'reclamation_authority_missing');
  assert.equal((await listLocalHostCapacityOffers()).length,1);

  const authority={
    schema:'evercraft.saban.capacity-reclamation-authority.v1',
    authority_id:'proof-owned-reclaim',
    approved:true,
    allowed_actions:['stop_spawned_owned_capacity'],
    allowed_offer_ids:[offer.offer_id],
    expires_at:'2026-10-08T16:00:00.000Z',
  };
  fs.writeFileSync(
    path.join(root,'capacity-reclamation-authority.json'),
    JSON.stringify(authority,null,2)+'\n',
    {mode:0o600}
  );

  const reclaimed=await runResidentReclamationOnce({
    root,
    now:new Date('2026-10-07T16:12:00.000Z'),
  });
  assert.equal(reclaimed.completed_count,1);
  assert.equal(reclaimed.held_count,0);
  assert.equal(reclaimed.reconciliation_required,false);
  assert.equal(reclaimed.secrets_serialized,false);
  assert.equal(reclaimed.results[0].state,'completed');
  assert.ok(reclaimed.results[0].receipt);
  assert.equal((await listLocalHostCapacityOffers()).length,0);

  const after=await persistOwnedSpawnCapacity({root});
  assert.equal(after.offer_count,0);

  let endpointClosed=false;
  try{
    await fetch(new URL('/v1/capacity',endpoint),{
      signal:AbortSignal.timeout(500),
    });
  }catch{
    endpointClosed=true;
  }
  assert.equal(endpointClosed,true);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.resident-owned-capacity-reclamation-proof.v1',
    owned_spawn_persisted_without_allocator_secret:true,
    owned_spawn_lifecycle_only:true,
    owned_spawn_not_falsely_schedulable:true,
    three_cycle_idle_aging_proved:true,
    missing_authority_blocks_stop:true,
    exact_authority_stops_real_loopback_nodeseed:true,
    stopped_spawn_removed_from_inventory:true,
    endpoint_closed_after_reclamation:true,
  },null,2));
}finally{
  await closeLocalHostCapacity({acquisition}).catch(()=>false);
  fs.rmSync(root,{recursive:true,force:true});
}
