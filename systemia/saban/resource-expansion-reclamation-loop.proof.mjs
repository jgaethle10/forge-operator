import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runResidentExpansionOnce } from './resource-expansion-organism.mjs';

function writeJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}

function seed(root){
  const managed={
    schema:'evercraft.saban.managed-capacity.v1',
    resource_id:'owned-spawn:owned-local',
    offer_id:'nodeseed:owned-local',
    provider_id:'owned-local',
    candidate_id:'owned-local',
    kind:'owned_spawn',
    state:'idle',
    zero_cost:true,
    lifecycle_reclaimable:true,
    release_adapter:'local_owned_host',
    authority_basis:'explicit_evercraft_owned_host_configuration',
    workload_classes:['systemia.render.v1'],
    started_at:'2026-10-07T15:00:00.000Z',
    last_required_at:'2026-10-07T15:10:00.000Z',
    idle_since:'2026-10-07T15:20:00.000Z',
    source_receipt:'sha256:spawn-proof',
  };
  writeJson(path.join(root,'resource-field-expansion-state.json'),{
    schema:'evercraft.saban.resource-expansion-cycle.v1',
    managed_capacity:[managed],
  });
  writeJson(path.join(root,'resource-field-expansion-intents.json'),{
    schema:'evercraft.saban.resource-field-expansion-queue.v1',
    intents:[],
  });
  writeJson(path.join(root,'capacity-lifecycle-ledger.json'),{
    schema:'evercraft.saban.capacity-lifecycle-ledger.v1',
    receipt_hash:'sha256:lifecycle-proof',
    entries:[
      {
        offer_id:'paid:gpu',
        provider_id:'paid-provider',
        reclaim_eligible:true,
        recommended_action:'release_paid_lease',
      },
      {
        offer_id:'nodeseed:owned-local',
        provider_id:'owned-local',
        reclaim_eligible:true,
        recommended_action:'stop_spawned_owned_capacity',
      },
    ],
  });
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-reclamation-loop-'));
const blockedRoot=fs.mkdtempSync(path.join(os.tmpdir(),'saban-reclamation-blocked-'));
try{
  seed(root);
  let closes=0;
  const cycle=await runResidentExpansionOnce({
    root,
    env:{EVERCRAFT_OWNED_HOST:'true'},
    closeOwnedSpawn:async row=>{
      closes+=1;
      assert.equal(row.offer_id,'nodeseed:owned-local');
      return true;
    },
  });
  assert.equal(closes,1);
  assert.equal(cycle.reclamation.authority_issued,true);
  assert.deepEqual(
    cycle.reclamation.authority_scope.actions,
    ['stop_spawned_owned_capacity']
  );
  assert.deepEqual(
    cycle.reclamation.authority_scope.offer_ids,
    ['nodeseed:owned-local']
  );
  assert.equal(cycle.reclamation.completed_count,1);
  assert.equal(cycle.reclamation.held_count,1);
  assert.equal(cycle.reclamation.paid_release_binding_present,false);
  assert.equal(cycle.managed_capacity_count,0);
  const receipt=JSON.parse(
    fs.readFileSync(path.join(root,'capacity-reclamation-state.json'),'utf8')
  );
  assert.ok(receipt.completed_offer_ids.includes('nodeseed:owned-local'));
  assert.equal(receipt.completed_offer_ids.includes('paid:gpu'),false);

  seed(blockedRoot);
  let blockedCloses=0;
  const blocked=await runResidentExpansionOnce({
    root:blockedRoot,
    env:{EVERCRAFT_OWNED_HOST:'false'},
    closeOwnedSpawn:async()=>{
      blockedCloses+=1;
      return true;
    },
  });
  assert.equal(blockedCloses,0);
  assert.equal(blocked.reclamation.authority_issued,false);
  assert.equal(blocked.reclamation.completed_count,0);
  assert.equal(blocked.managed_capacity_count,1);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.resource-expansion-reclamation-loop-proof.v1',
    explicit_owned_host_authority_required:true,
    owned_spawn_closed_and_removed_only_after_confirmed_completion:true,
    paid_release_not_bound:true,
    no_authority_means_no_shutdown:true,
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
  fs.rmSync(blockedRoot,{recursive:true,force:true});
}
