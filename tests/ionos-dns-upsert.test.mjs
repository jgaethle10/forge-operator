import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const nodeScript=fs.readFileSync(new URL('../scripts/ionos-dns-upsert.mjs',import.meta.url),'utf8');
const shell=fs.readFileSync(new URL('../scripts/ionos-dns-upsert.sh',import.meta.url),'utf8');

test('IONOS DNS helper never embeds credentials',()=>{
  assert.match(nodeScript,/process\.env\.IONOS_API_KEY/);
  assert.doesNotMatch(nodeScript,/prefix\.secret['"]/);
  assert.match(shell,/read -r -s -p/);
});

test('IONOS DNS helper uses targeted zone and record endpoints',()=>{
  assert.match(nodeScript,/https:\/\/api\.hosting\.ionos\.com\/dns\/v1/);
  assert.match(nodeScript,/method:'POST'/);
  assert.match(nodeScript,/method:'PUT'/);
});

test('IONOS DNS helper refuses ambiguous duplicate records',()=>{
  assert.match(nodeScript,/Multiple matching records exist; refusing to guess/);
});


test('IONOS DNS helper permits bounded TXT control challenges',()=>{
  assert.match(nodeScript,/\['A','TXT'\]\.includes\(type\)/);
  assert.match(nodeScript,/TXT record content must be 1-1024 characters/);
  assert.match(nodeScript,/TXT record content must not contain control characters/);
  assert.doesNotMatch(nodeScript,/permits A records only/);
});
