import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const file='scripts/diagnose-fabric-owned-edge-release.sh';
test('Aiden release doctor remains read-only and shell-parsable',()=>{
  const run=spawnSync('bash',['-n',file],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const src=fs.readFileSync(file,'utf8');
  for(const term of [
    'aidens_lab_physics_source_present=',
    'aidens_lab_world_source_present=',
    'aidens_lab_local_physics_http=',
    'aidens_lab_local_world_http=',
    'aidens_lab_local_physics_marker=',
    'aidens_lab_local_world_marker=',
    'existing_atlas_live_but_new_interactive_world_routes_missing',
    'resident_world_routes_present_public_https_and_exact_hash_proof_still_required',
    'doctor_mutation_performed=false'
  ])assert.ok(src.includes(term),term);
  assert.match(src,/x-evercraft-learning-world: physics-model-v1/);
  assert.match(src,/x-evercraft-learning-world: earth-globe-v1/);
  assert.match(src,/--max-time 5/);
  assert.match(src,/local_probe '\/aiden-lab\/physics\/index\.html'/);
  assert.match(src,/local_probe '\/aiden-lab\/world\/index\.html'/);
  // No imperative rollout or source/secret mutations in a diagnostic.
  assert.doesNotMatch(src,/\bsystemctl\s+(restart|start|stop|enable|disable)|\bgit\s+reset\b|curl\s+[^;\n]*(-X\s+POST|--request\s+POST)/);
});
test('Aiden diagnosis distinguishes old atlas from new world delivery',()=>{
  const src=fs.readFileSync(file,'utf8');
  const failed=src.indexOf('existing_atlas_live_but_new_interactive_world_routes_missing');
  const passed=src.indexOf('resident_world_routes_present_public_https_and_exact_hash_proof_still_required');
  assert.ok(failed>0&&passed>failed);
  assert.match(src,/aidens_physics_http" != '200'/);
  assert.match(src,/aidens_world_marker" != 'true'/);
});
