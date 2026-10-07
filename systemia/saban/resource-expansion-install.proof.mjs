import assert from 'node:assert/strict';
import fs from 'node:fs';

const file='scripts/install-saban-capacity-organism.sh';
const source=fs.readFileSync(file,'utf8');

for(const required of [
  '--owned-host',
  '--auto-retire-owned-host',
  '--public-market-discovery',
  'evercraft-saban-resource-expansion.service',
  'SABAN_ALLOW_COMMERCIAL_CAPACITY=0',
  'Environment=EVERCRAFT_OWNED_HOST=$OWNED_HOST',
  'Environment=SABAN_LOCAL_HOST_AUTO_RETIRE=$AUTO_RETIRE_OWNED_HOST',
  'Environment=SABAN_LOCAL_HOST_IDLE_RETIRE_CYCLES=15',
  'Environment=SABAN_PUBLIC_MARKET_DISCOVERY=$PUBLIC_MARKET_DISCOVERY',
  'Environment=EVERCRAFT_LOCAL_NODE_ROOT=$STATE_DIR/resource-field-local-node',
  'systemia/saban/resource-expansion-organism.mjs',
]){
  assert.ok(source.includes(required),`missing installer contract: ${required}`);
}

assert.match(source,/OWNED_HOST="false"/);
assert.match(source,/AUTO_RETIRE_OWNED_HOST="false"/);
assert.match(source,/PUBLIC_MARKET_DISCOVERY="false"/);
assert.match(source,/--owned-host\) OWNED_HOST="true"/);
assert.match(source,/--auto-retire-owned-host\) AUTO_RETIRE_OWNED_HOST="true"/);
assert.match(source,/--public-market-discovery\) PUBLIC_MARKET_DISCOVERY="true"/);
assert.ok(!source.includes('SABAN_ALLOW_COMMERCIAL_CAPACITY=1'));

assert.match(source,/physical host shutdown is never authorized/);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.resource-expansion-install-proof.v1',
  owned_host_requires_explicit_install_flag:true,
  public_market_discovery_requires_explicit_install_flag:true,
  commercial_capacity_disabled:true,
  resident_resource_expansion_installed:true,
  local_auto_retire_requires_explicit_install_flag:true,
  physical_host_shutdown_never_authorized:true,
  local_spawn_state_scoped_to_saban_state:true,
},null,2));
