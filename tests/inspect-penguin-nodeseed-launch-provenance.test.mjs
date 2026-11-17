import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseProcessInvocation,
  classifySourceAge,
} from '../scripts/inspect-penguin-nodeseed-launch-provenance.mjs';

test('private process invocation yields only whitelisted source paths, never arguments',()=>{
  const cmd=Buffer.from([
    '/usr/bin/node',
    '/opt/evercraft/forge-operator/systemia/compute/node-seed.mjs',
    '--allocator-token',
    'secret-private-do-not-print',
    '--root',
    '/var/lib/evercraft/nodeseed',
    '',
  ].join('\0'));
  const r=parseProcessInvocation(
    cmd,'/opt/evercraft/forge-operator','/opt/evercraft/forge-operator'
  );
  assert.equal(r.known_nodeseed_entrypoint_invoked,true);
  assert.deepEqual(r.source_tree_script_paths,
    ['systemia/compute/node-seed.mjs']);
  assert.equal(JSON.stringify(r).includes('secret-private'),false);
  assert.equal(JSON.stringify(r).includes('/var/lib/evercraft'),false);
  assert.equal(r.process_arguments_printed,false);
});

test('unknown launch wrapper is not falsely claimed to be pinned NodeSeed entrypoint',()=>{
  const r=parseProcessInvocation(
    '/usr/bin/node\0/opt/evercraft/forge-operator/scripts/launch-wrapper.mjs\0--some-value\0',
    '/opt/evercraft/forge-operator',
    '/opt/evercraft/forge-operator'
  );
  assert.equal(r.known_nodeseed_entrypoint_invoked,false);
  assert.deepEqual(r.source_tree_script_paths,
    ['scripts/launch-wrapper.mjs']);
});

test('source mutation timestamps after process launch fail closed',()=>{
  const origin=10_000_000;
  assert.equal(classifySourceAge({
    mtimeMs:origin-3000,ctimeMs:origin-2000,startedAtMs:origin,
  }).unchanged_since_start,true);
  assert.equal(classifySourceAge({
    mtimeMs:origin+100,ctimeMs:origin-2000,startedAtMs:origin,
  }).unchanged_since_start,false);
  assert.equal(classifySourceAge({
    mtimeMs:origin-3000,ctimeMs:origin+100,startedAtMs:origin,
  }).unchanged_since_start,false);
  assert.equal(classifySourceAge({
    mtimeMs:origin-3000,ctimeMs:origin-2000,startedAtMs:null,
  }).unchanged_since_start,null);
});
