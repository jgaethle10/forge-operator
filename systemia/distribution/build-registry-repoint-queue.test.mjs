import test from 'node:test';
import assert from 'node:assert/strict';
import {buildQueue} from './build-registry-repoint-queue.mjs';
const observed=(entries)=>({schema:'evercraft.distribution.registry-inspection.v1',state:'OBSERVED_WITH_FINDINGS',observed_at:'2026-10-25T19:50:44Z',servers:entries});
test('stale specialist requires owned proof; never rewrites to universal MCP',()=>{
  const r=buildQueue(observed([{name:'io.github.jgaethle10/findmypart',version:'1.0.2',
    remotes:[{url:'https://findmypart.base44.app/functions/findMyPartMcp'}],findings:['LEGACY_BASE44_REMOTE']}]));
  assert.equal(r.totals.legacy_base44,1);
  assert.equal(r.entries[0].state,'REPOINT_REQUIRES_VERIFIED_OWNED_SPECIALIST');
  assert.equal(r.entries[0].external_registry_publish_authorized,false);
  assert.equal(r.entries[0].priority,'P0');
  assert.deepEqual(r.entries[0].published_remotes,['https://findmypart.base44.app/functions/findMyPartMcp']);
});
test('advertised owned endpoint still needs independent MCP cold-client proof',()=>{
  const r=buildQueue(observed([{name:'io.github.jgaethle10/evercraft-machine-commerce',version:'1.7.0',
    remotes:[{url:'https://fabric.systemiacommandcenters.com/mcp'}],findings:[]}]));
  assert.equal(r.entries[0].state,'OWNED_REMOTE_ADVERTISED_RUNTIME_CANARY_REQUIRED');
  assert.equal(r.entries[0].owned_specialist_runtime_verified,false);
});
test('rejects synthetic/unobserved inputs and foreign namespace',()=>{
  assert.throws(()=>buildQueue({schema:'evercraft.distribution.registry-inspection.v1',state:'UNOBSERVED',servers:[]}),/registry_observation_required/);
  assert.throws(()=>buildQueue(observed([{name:'io.github.other/foo',version:'1.0'}])),/invalid_registry_entry/);
});
