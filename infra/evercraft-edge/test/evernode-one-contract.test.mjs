import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mission=JSON.parse(fs.readFileSync(new URL('../saban/second-node-mission.json',import.meta.url),'utf8'));
const handoff=fs.readFileSync(new URL('../saban/EVERNODE-ONE-REVALIDATION.md',import.meta.url),'utf8');
const direct=fs.readFileSync(new URL('../dns/direct-tcp-authority.mjs',import.meta.url),'utf8');
const proofScript=fs.readFileSync(new URL('../../../scripts/prove-edge-direct-tcp-authority.sh',import.meta.url),'utf8');

test('Evernode One is the canonical second-node hardware identity',()=>{
 const first=mission.candidates.find(x=>x.rank===1);
 assert.equal(first.candidate_id,'evernode-one-external-linux');
 assert.equal(first.canonical_hardware_name,'Evernode One');
 assert.match(handoff,/Evernode One/);
 assert.match(handoff,/EVERCRAFT_NODE_ID="evercraft-evernode-one"/);
 assert.doesNotMatch(handoff,/Lux's Megatron as a \*\*candidate\*\*/);
});

test('direct TCP authority proof redacts candidate IP from persisted excerpt',()=>{
 assert.match(direct,/redactedText/);
 assert.match(direct,/<candidate-ip>/);
 assert.doesNotMatch(proofScript,/"public_ipv4":/);
});

test('direct TCP proof uses raw authoritative tcp53 with norec semantics',()=>{
 assert.match(direct,/resolver:'custom'/);
 assert.match(direct,/transport:'tcp53'/);
 assert.match(direct,/norec:'1'/);
 assert.match(proofScript,/direct-tcp-authority\.mjs/);
});
