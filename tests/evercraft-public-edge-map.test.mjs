import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../scripts/evercraft-public-edge-map.mjs',import.meta.url),'utf8');

test('public edge mapper is credential-free and scoped to Fabric ports',()=>{
  assert.match(src,/18080/);
  assert.match(src,/8443/);
  assert.match(src,/external: 80/);
  assert.match(src,/external: 443/);
  assert.doesNotMatch(src,/password|token|secret/i);
});

test('public edge mapper supports owned NAT traversal protocols',()=>{
  assert.match(src,/UPnP-IGD/);
  assert.match(src,/NAT-PMP/);
  assert.match(src,/PCP/);
  assert.match(src,/AddPortMapping/);
  assert.match(src,/5351/);
});
