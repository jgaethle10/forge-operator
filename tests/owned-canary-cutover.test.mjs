import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = [
  'systemia/chum/commerce-canary.mjs',
  'systemia/chum/ibmi-rescue-canary.mjs',
  'systemia/network/public-mcp-canary.mjs',
  'systemia/customer-gauntlet/runner.mjs',
  '.github/workflows/chum-watershed.yml',
  '.github/workflows/customer-gauntlet.yml',
  '.github/workflows/network-mcp-canary.yml',
];

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('owned canary tranche has no hard-coded Base44 public URL', () => {
  const offenders = [];
  for (const file of files) {
    for (const line of source(file).split('\n')) {
      if (line.includes('://') && line.includes('base44.app')) offenders.push({ file, line: line.trim() });
    }
  }
  assert.deepEqual(offenders, []);
});

test('commerce, IBM i, and Network canaries expose explicit held states', () => {
  assert.match(source('systemia/chum/commerce-canary.mjs'), /held_no_owned_gateway/);
  assert.match(source('systemia/chum/ibmi-rescue-canary.mjs'), /held_no_owned_gateway/);
  assert.match(source('systemia/network/public-mcp-canary.mjs'), /held_no_owned_public_mcp/);
});

test('Customer Gauntlet never routes held offers through Lennox', () => {
  const gauntlet = source('systemia/customer-gauntlet/runner.mjs');
  assert.match(gauntlet, /held_no_owned_gateway/);
  assert.match(gauntlet, /doorwayHeld\s*\?/);
  assert.match(gauntlet, /heldInteractive\(persona\)/);
  assert.match(gauntlet, /owned_gateway_unconfigured/);
});

test('workflows bind canaries to owned route variables', () => {
  assert.match(source('.github/workflows/chum-watershed.yml'), /EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL/);
  assert.match(source('.github/workflows/customer-gauntlet.yml'), /EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL/);
  assert.match(source('.github/workflows/network-mcp-canary.yml'), /EVERCRAFT_MACHINE_COMMERCE_MCP_URL/);
});
