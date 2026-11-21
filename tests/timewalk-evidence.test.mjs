import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ledger = JSON.parse(readFileSync(
  new URL('../public/worlds/timewalk/yakima-1960/evidence.v1.json', import.meta.url),
  'utf8'
));
const claims = ledger.places.flatMap(place => place.claims.map(claim => ({ ...claim, placeId: place.id })));
const sourceIds = new Set(ledger.sources.map(source => source.id));

test('Timewalk evidence is a separate source layer, not a renderer authority', () => {
  assert.equal(ledger.schema, 'evercraft.worlds.timewalk.evidence.v1');
  assert.equal(ledger.sceneYear, 1960);
  assert.equal(ledger.location.georeferenced, false);
  assert.equal(ledger.location.crs, null);
  assert.match(ledger.owners.worldRuntime, /Evercraft Worlds/);
});

test('all facts are uniquely identified and sources resolve', () => {
  assert.equal(new Set(claims.map(claim => claim.id)).size, claims.length);
  assert.equal(sourceIds.size, ledger.sources.length);
  for (const claim of claims) {
    assert.ok(Object.hasOwn(ledger.evidenceStates, claim.evidence), claim.id);
    for (const sourceId of claim.sourceIds) assert.ok(sourceIds.has(sourceId), `${claim.id}: ${sourceId}`);
    if (claim.evidence === 'documented') assert.ok(claim.sourceIds.length > 0, claim.id);
  }
});

test('1960 claims are not silently upgraded to direct documented evidence', () => {
  for (const claim of claims.filter(claim => claim.period === '1960')) {
    assert.notEqual(claim.evidence, 'documented', claim.id);
  }
  assert.ok(claims.some(claim => claim.period === '1960' && claim.evidence === 'intervalInferred'));
  assert.ok(claims.some(claim => claim.evidence === 'illustrative'));
});

test('publication and conflicting-address risk remain explicit', () => {
  const byId = Object.fromEntries(ledger.sources.map(s => [s.id,s]));
  assert.equal(byId['loc-sanborn'].rights.status, 'public_domain_per_holding_institution');
  assert.equal(byId['yakima-memory'].rights.status, 'publication_permission_required');
  const theatre = ledger.places.find(p => p.id === 'capitol');
  assert.equal(theatre.canonicalAddress, null);
  assert.equal(theatre.addressDiscrepancy.status, 'unresolved');
  assert.ok(new Set(theatre.addressDiscrepancy.sources.map(s => s.address)).size > 1);
});

test('history cannot claim surveyed geography from the illustrative walkthrough', () => {
  assert.ok(ledger.promotionGates.some(g => g.id === 'geometry'));
  assert.ok(ledger.promotionGates.some(g => g.id === 'ownership'));
  assert.ok(ledger.promotionGates.some(g => g.id === 'rights'));
});
