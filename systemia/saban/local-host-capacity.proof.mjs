import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildLocalHostCandidate,
  closeLocalHostCapacity,
  createLocalHostSpawnAdapter,
  localHostBootstrapEnabled,
} from './local-host-capacity.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-local-host-proof-'));
try{
  assert.equal(localHostBootstrapEnabled({env:{}}),false);
  assert.equal(localHostBootstrapEnabled({env:{EVERCRAFT_OWNED_HOST:'true'}}),true);

  const none=buildLocalHostCandidate({env:{},cwd:root});
  assert.equal(none,null);

  const env={
    EVERCRAFT_OWNED_HOST:'true',
    EVERCRAFT_LOCAL_NODE_ROOT:path.join(root,'node'),
    EVERCRAFT_LOCAL_NODE_ID:'owned-proof-host',
  };
  const candidate=buildLocalHostCandidate({env,cwd:root});
  assert.equal(candidate.authority,'owned');
  assert.equal(candidate.source_kind,'owned_bootstrap_target');
  assert.equal(candidate.spawn_capable,true);
  assert.ok(candidate.resources.cpu_units>=1);
  assert.ok(candidate.resources.memory_mb>=64);

  const adapter=createLocalHostSpawnAdapter({env,cwd:root});
  const activated=await adapter.activate({candidate});
  assert.equal(activated.execution_ready,true);
  assert.match(activated.capacity_endpoint,/^http:\/\/127\.0\.0\.1:/);
  assert.equal(
    typeof activated.runtime_authority.allocator_token,
    'string'
  );
  assert.equal(
    JSON.stringify(activated).includes(activated.runtime_authority.allocator_token),
    false
  );

  const capacity=await fetch(activated.capacity_endpoint+'/v1/capacity').then(r=>r.json());
  assert.equal(capacity.protocol,'evercraft.capacity.v1');
  assert.equal(capacity.node_id,'owned-proof-host');
  assert.ok(capacity.capacity_hint.cpu_units>=1);
  assert.ok(capacity.capacity_hint.memory_mb>=64);
  assert.ok('storage_gb' in capacity.capacity_hint);
  assert.ok('gpu_units' in capacity.capacity_hint);
  assert.ok('vram_mb' in capacity.capacity_hint);

  assert.equal(await closeLocalHostCapacity({env,cwd:root}),true);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.local-host-capacity-proof.v1',
    ownership_gate_required:true,
    owned_host_becomes_spawn_target:true,
    nodeseed_bootstrapped_on_demand:true,
    hardware_inventory_advertised:true,
    allocator_secret_not_serialized:true,
  },null,2));
}finally{
  try{
    await closeLocalHostCapacity({
      env:{
        EVERCRAFT_OWNED_HOST:'true',
        EVERCRAFT_LOCAL_NODE_ROOT:path.join(root,'node'),
      },
      cwd:root,
    });
  }catch{}
  fs.rmSync(root,{recursive:true,force:true});
}
