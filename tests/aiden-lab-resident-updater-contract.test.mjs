import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

test('resident release and diagnostic shell scripts pass bash syntax check',()=>{
  for(const script of ['scripts/update-fabric-owned-edge.sh','scripts/diagnose-fabric-owned-edge-release.sh']){
    const run=spawnSync('bash',['-n',script],{encoding:'utf8'});
    assert.equal(run.status,0,script+': '+run.stderr);
  }
});

test('owned updater refuses accepting a revision that does not serve Lab bytes',()=>{
  const s=fs.readFileSync('scripts/update-fabric-owned-edge.sh','utf8');
  assert.match(s,/as_user node "\$REPO_ROOT\/scripts\/probe-aiden-lab-resident\.mjs" --gate/);
  assert.match(s,/return 20/);
  const gate=s.indexOf('probe-aiden-lab-resident.mjs');
  const finalReturn=s.indexOf('local attestation_code=10');
  assert.ok(gate>0&&finalReturn>gate,'Lab proof must be checked before release acceptance');
  assert.match(s,/rollback "runtime_verification_failed_\$code"/);
  assert.match(s,/current Fabric verification failed after one bounded restart/);
});

test('release doctor separates source-drift and ingress-drift without mutation',()=>{
  const s=fs.readFileSync('scripts/diagnose-fabric-owned-edge-release.sh','utf8');
  for(const asset of ['/aiden-lab/','/aiden-lab/app.mjs','/aiden-lab/catalog.mjs','/aiden-lab/styles.css','/aiden-lab/mark.svg']){
    assert.ok(s.includes("local_probe '"+asset+"'"),asset);
  }
  assert.match(s,/aidens_lab_source_route_present=/);
  assert.match(s,/aidens_lab_local_owned_route_marker=/);
  assert.match(s,/merged_source_present_but_resident_runtime_route_missing/);
  assert.match(s,/resident_routes_present_public_https_and_exact_hash_proof_still_required/);
  assert.match(s,/doctor_mutation_performed=false/);
});
