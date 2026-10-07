import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCapacityOrganismOnce } from './capacity-organism.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-capacity-organism-resident-'));
try{
  const receipt=await runCapacityOrganismOnce({
    root,
    runCensus:false,
    now:new Date('2026-10-07T16:00:00.000Z'),
  });
  assert.equal(receipt.schema,'evercraft.saban.capacity-organism-state.v1');
  assert.ok(receipt.capacity_headroom);
  assert.equal(typeof receipt.capacity_headroom.reservation_count,'number');
  assert.ok(receipt.capacity_lifecycle);
  assert.equal(
    fs.existsSync(path.join(root,'capacity-lifecycle-ledger.json')),
    true
  );
  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.capacity-organism-resident-proof.v1',
    headroom_receipt_present:true,
    lifecycle_ledger_persisted:true,
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
