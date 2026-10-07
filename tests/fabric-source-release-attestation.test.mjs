import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const catalog=[{
  public_id:'source-release-test-v1',
  name:'Source Release Test',
  description:'Test-only capability.',
  keywords:['release'],
  state:'available',
  connections:[],
}];

test('Fabric health exposes the immutable source release captured at process startup',async()=>{
  const release='a'.repeat(40);
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',
    port:0,
    catalog,
    sourceReleaseRef:release,
    faieSurfaceEnabled:false,
  });
  try{
    const response=await fetch(runtime.url+'/health');
    assert.equal(response.status,200);
    const health=await response.json();
    assert.equal(health.ok,true);
    assert.equal(health.source_release_ref,release);
    assert.equal(health.source_release_observed_at_startup,true);
  }finally{
    await runtime.close();
  }
});

test('resident updater verifies booted runtime release against current and target SHAs',()=>{
  const updater=fs.readFileSync('scripts/update-fabric-owned-edge.sh','utf8');
  assert.match(updater,/local expected_release="\$2"/);
  assert.match(updater,/source_release_observed_at_startup/);
  assert.match(updater,/runtime source release mismatch/);
  assert.match(updater,/return 14/);
  assert.match(updater,/verify_current_runtime "\$expected_count" "\$before"/);
  assert.match(updater,/verify_current_runtime "\$expected_count" "\$target"/);
  assert.match(updater,/tests\/fabric-source-release-attestation\.test\.mjs/);
});
