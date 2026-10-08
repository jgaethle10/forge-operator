import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script=fs.readFileSync('scripts/update-fabric-owned-edge.sh','utf8');

test('owned Fabric updater repairs bounded router-map config readability',()=>{
  assert.ok(script.includes('repair_router_map_env_permissions()'));
  assert.ok(script.includes('chmod 0755 "$(dirname "$ROUTER_MAP_ENV")"'));
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


test('owned Fabric updater creates Visual Desk ingest credential without writing the secret into source state',()=>{
  assert.match(script,/ensure_visual_ingest_token\(\)/);
  assert.match(script,/randomBytes\(32\)\.toString\('hex'\)/);
  assert.match(script,/install -o "\$RUN_USER" -g "\$RUN_USER" -m 0600 "\$tmp" "\$VISUAL_INGEST_TOKEN_FILE"/);
  assert.match(script,/VISUAL_INGEST_TOKEN_CREATED=true/);
  assert.doesNotMatch(script,/printf .*VISUAL_INGEST_TOKEN.*last-update\.json/);
});


test('owned Fabric updater verifies the EarthWorks Live Yard is resident, not just catalog-equivalent',()=>{
  assert.match(script,/earthworks_simulator_path!=='\/earthworks'/);
  assert.match(script,/earthworks_simulator_authority!=='interactive_software_simulation_only'/);
  assert.match(script,/http:\/\/127\.0\.0\.1:8787\/earthworks/);
  assert.match(script,/Live Yard 001/);
  assert.match(script,/STOP ALL/);
});

test('owned Fabric updater binds resident health to the exact checkout release',()=>{
  assert.match(script,/RUNTIME_RELEASE_REF_FILE="\$STATE_DIR\/runtime-release-ref"/);
  assert.match(script,/write_runtime_release_ref\(\)/);
  assert.match(script,/install -o root -g "\$RUN_USER" -m 0640 "\$tmp" "\$RUNTIME_RELEASE_REF_FILE"/);
  assert.match(script,/EXPECTED_RELEASE="\$expected_release"/);
  assert.match(script,/source_release_ref/);
  assert.match(script,/write_runtime_release_ref "\$before"/);
  assert.match(script,/write_runtime_release_ref "\$target"/);
  assert.match(script,/verify_current_runtime "\$expected_count" "\$before"/);
  assert.match(script,/verify_current_runtime "\$expected_count" "\$target"/);
  assert.match(script,/write_runtime_release_ref "\$before" \|\| true/);
});

test('current checkout repairs stale resident Fabric process with one bounded restart',()=>{
  assert.match(script,/resident Fabric runtime drifted/);
  assert.match(script,/restarting once/);
  assert.match(script,/systemctl restart "\$SERVICE"/);
  assert.match(script,/current Fabric verification failed after one bounded restart/);
});
