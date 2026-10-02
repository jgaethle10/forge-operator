import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script=fs.readFileSync('scripts/update-fabric-owned-edge.sh','utf8');

test('owned Fabric updater repairs bounded router-map config readability',()=>{
  assert.ok(script.includes('repair_router_map_env_permissions()'));
  assert.ok(script.includes('chmod 0644 "$ROUTER_MAP_ENV"'));
  const resident=script.indexOf('ensure_router_map_resident_from_saved_config()');
  const repairAfterResident=script.indexOf('repair_router_map_env_permissions',resident);
  assert.ok(repairAfterResident>resident);
  const reassert=script.indexOf('reassert_owned_public_ingress()');
  const repairAfterReassert=script.indexOf('repair_router_map_env_permissions',reassert);
  assert.ok(repairAfterReassert>reassert);
});

test('router-map config is treated as coordinates, not a secret-bearing file',()=>{
  assert.match(script,/gateway\/LAN host\/repo\/node coordinates/);
  assert.equal(script.includes('chmod 0600 "$ROUTER_MAP_ENV"'),false);
});
