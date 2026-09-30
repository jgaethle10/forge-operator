import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeMachineOfferSources,
  normalizeOwnedMachineOfferRegistry
} from '../systemia/chum/owned-machine-offers.mjs';

test('owned offers survive when absent from the legacy remote catalog', () => {
  const result = mergeMachineOfferSources(
    [{ public_id:'legacy-a', name:'Legacy A', machine_state:'live' }],
    {
      authority:'forge_owned_source',
      offers:[{ public_id:'worldstate-reality-delta-v1', name:'Worldstate', machine_state:'discovery_only' }]
    }
  );
  assert.equal(result.merged_offer_count, 2);
  const worldstate = result.offers.find((x) => x.public_id === 'worldstate-reality-delta-v1');
  assert.ok(worldstate);
  assert.equal(worldstate.source_authority, 'forge_owned_source');
});

test('Forge-owned entries override stale remote copies of the same public id', () => {
  const result = mergeMachineOfferSources(
    [{ public_id:'worldstate-reality-delta-v1', name:'Old Worldstate', machine_state:'missing' }],
    {
      authority:'forge_owned_source',
      offers:[{ public_id:'worldstate-reality-delta-v1', name:'Worldstate', machine_state:'discovery_only' }]
    }
  );
  assert.equal(result.merged_offer_count, 1);
  assert.equal(result.owned_override_count, 1);
  assert.equal(result.offers[0].offer.name, 'Worldstate');
  assert.equal(result.offers[0].offer.machine_state, 'discovery_only');
});

test('duplicate owned ids fail closed', () => {
  assert.throws(
    () => normalizeOwnedMachineOfferRegistry({
      offers:[{ public_id:'x' },{ public_id:'x' }]
    }),
    /duplicate_owned_offer_public_id/
  );
});
