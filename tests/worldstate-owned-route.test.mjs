import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Worldstate owned pilot route is declared, bound, and shipped', () => {
  const routing = JSON.parse(fs.readFileSync('registry/first-party-routing.json','utf8'));
  const route = (routing.capabilities || []).find(
    (row) => row.capability_key === 'worldstate.reality-delta.pilot.v1'
  );
  assert.ok(route, 'Worldstate first-party route missing');
  assert.equal(route.first_party_strict, true);
  assert.equal(route.state, 'source_ready_runtime_binding_pending');
  assert.match(String(route.invocation || ''), /\/mcp\/worldstate/);

  const owned = JSON.parse(fs.readFileSync('registry/owned-machine-offers.json','utf8'));
  const offer = (owned.offers || []).find(
    (row) => row.public_id === 'worldstate-reality-delta-v1'
  );
  assert.ok(offer, 'Worldstate Forge-owned machine offer missing');
  assert.equal(owned.authority, 'forge_owned_source');

  const server = fs.readFileSync('server.ts','utf8');
  assert.match(server, /registerWorldstatePilotMcp/);
  assert.match(server, /systemia\/worldstate\/pilot-mcp\.mjs/);

  const docker = fs.readFileSync('Dockerfile','utf8');
  assert.match(docker, /systemia\/worldstate/);
});

test('public catalog preserves Worldstate as Forge-owned authority', () => {
  const catalog = JSON.parse(
    fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8')
  );
  const offer = (catalog.offers || []).find(
    (row) => row.public_id === 'worldstate-reality-delta-v1'
  );
  assert.ok(offer);
  assert.equal(offer.source_authority, 'forge_owned_source');
  assert.equal(offer.public_url_source, 'forge_owned_registry');
  assert.equal(catalog.offer_count, catalog.offers.length);
  assert.equal(catalog.discovery_count, catalog.offer_count - catalog.sell_now_count);
});
