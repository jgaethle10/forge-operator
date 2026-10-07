import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runCapacityOrganismOnce } from './capacity-organism.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-capacity-resident-proof-'));

try{
  const first=await runCapacityOrganismOnce({
    root,
    runCensus:false,
    now:new Date('2026-10-07T16:00:00.000Z'),
  });

  assert.equal(first.schema,'evercraft.saban.capacity-organism-state.v1');
  assert.ok(first.capacity_headroom);
  assert.equal(typeof first.capacity_headroom.reservation_count,'number');
  assert.ok(first.capacity_lifecycle);
  assert.equal(first.capacity_lifecycle.automatic_shutdown_authorized,false);
  assert.equal(fs.existsSync(path.join(root,'demand-history.json')),true);
  assert.equal(fs.existsSync(path.join(root,'capacity-lifecycle-ledger.json')),true);

  const second=await runCapacityOrganismOnce({
    root,
    runCensus:false,
    now:new Date('2026-10-07T16:05:00.000Z'),
  });

  assert.equal(second.schema,'evercraft.saban.capacity-organism-state.v1');
  assert.ok(second.capacity_headroom);
  assert.equal(typeof second.capacity_headroom.reservation_count,'number');
  assert.ok(second.capacity_lifecycle);
  assert.equal(typeof second.capacity_lifecycle.held_reclamation_count,'number');
  assert.equal(typeof second.capacity_lifecycle.reconciliation_required_count,'number');

  const lifecycleLedger=JSON.parse(
    fs.readFileSync(path.join(root,'capacity-lifecycle-ledger.json'),'utf8')
  );
  assert.equal(lifecycleLedger.schema,'evercraft.saban.capacity-lifecycle-ledger.v1');

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.capacity-organism-resident-proof.v1',
    first_cycle_headroom_receipt_present:Boolean(first.capacity_headroom.receipt_hash),
    second_cycle_readback_succeeded:true,
    lifecycle_ledger_persisted:true,
    undefined_read_helper_regression:false,
    headroom_scope_regression:false,
    automatic_shutdown_authorized:false,
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
