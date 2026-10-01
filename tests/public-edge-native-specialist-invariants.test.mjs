import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = [
  'systemia/compute/runtime-node.mjs',
  'systemia/yard/public-edge-controller.mjs',
  'systemia/organism/public-edge-activation-watch-runner.mjs',
  'systemia/mcp/specialist-handoff-runtime.mjs',
];

test('resident public-edge path has no implicit Base44 machine-commerce fallback', () => {
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(
      source.includes('evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway'),
      false,
      file + ' still contains the legacy Base44 machine-commerce fallback'
    );
  }
});

test('native specialist runtime keeps Base44 visible only as explicit external configuration evidence', () => {
  const source = fs.readFileSync('systemia/mcp/specialist-handoff-runtime.mjs', 'utf8');
  assert.match(source, /gatewayUrl = ''/);
  assert.match(source, /native_fabric_catalog/);
  assert.match(source, /base44_transport_enabled/);
  assert.match(source, /human_origin: null/);
  assert.match(source, /pricing_url: null/);
});
