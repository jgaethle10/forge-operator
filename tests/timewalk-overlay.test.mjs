import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateHistoricalEvidence, makeHistoricalOverlay, sourceCanBeEmbedded,
  TIMEWALK_OVERLAY_SCHEMA
} from '../public/worlds/timewalk/historical-evidence.mjs';

const evidence = JSON.parse(readFileSync(
  new URL('../public/worlds/timewalk/yakima-1960/evidence.v1.json', import.meta.url),
  'utf8'
));
const copy = () => structuredClone(evidence);

test('validates research ledger with all 11 source records and no georeference', () => {
  assert.equal(validateHistoricalEvidence(evidence), evidence);
  assert.equal(evidence.sources.length, 11);
  assert.equal(evidence.location.georeferenced, false);
});
test('provides data-only overlay, never a competing renderer or surveyed 1960 scene', () => {
  const out = makeHistoricalOverlay(evidence, 1960);
  assert.equal(out.schema, TIMEWALK_OVERLAY_SCHEMA);
  assert.equal(out.canonicalRuntime, 'evercraft-worlds');
  assert.equal(out.accurateSceneClaimAllowed, false);
  assert.equal(out.geometry, null);
  assert.equal(out.renderer, null);
  assert.equal(out.movement, null);
  assert.equal(out.georeferenced, false);
  assert.deepEqual(out.sourcesEmbedded, []);
  assert.ok(out.places.length >= 3);
});
test('will not invent another year or silently upgrade historical confidence', () => {
  assert.throws(() => makeHistoricalOverlay(evidence, 1961), /only has a sourced/);
  const tampered = copy();
  tampered.places[0].claims.find(c=>c.period==='1960').evidence = 'documented';
  assert.throws(() => validateHistoricalEvidence(tampered), /target year/);
});
test('cannot assert exact position for conflicting Capitol Theatre address', () => {
  const out = makeHistoricalOverlay(evidence);
  const theatre = out.places.find(x => x.id === 'capitol');
  assert.equal(theatre.address, null);
  assert.equal(theatre.addressStatus, 'unresolved');
  const tampered = copy();
  tampered.places.find(x=>x.id==='capitol').canonicalAddress='19 S. Third';
  assert.throws(()=>validateHistoricalEvidence(tampered), /unresolved discrepancy/);
});
test('1931 documented construction is not misleadingly shown as 1960-dated observation', () => {
  const out = makeHistoricalOverlay(evidence);
  const original = out.places.find(x=>x.id==='ae-larson').claims.find(x=>x.id==='ae-1931');
  assert.equal(original.period, '1931');
  assert.equal(original.directTargetYearProof, false);
  const inferred = out.places.find(x=>x.id==='ae-larson').claims.find(x=>x.id==='ae-1960-existence');
  assert.equal(inferred.evidence, 'intervalInferred');
  assert.equal(inferred.directTargetYearProof, false);
});
test('photo catalog and directory catalogs do not grant media-publishing rights', () => {
  const byId = Object.fromEntries(evidence.sources.map(x=>[x.id,x]));
  assert.equal(sourceCanBeEmbedded(byId['wshs-yakima-avenue-ca1950']), false);
  assert.equal(sourceCanBeEmbedded(byId['wa-state-library-directory-catalog']), false);
  assert.equal(sourceCanBeEmbedded(byId['yakima-memory']), false);
  assert.equal(sourceCanBeEmbedded(byId['loc-sanborn']), true);
  assert.equal(sourceCanBeEmbedded(null), false);
});
test('rejects missing claim sources, duplicate references and claimed georeference', () => {
  let bad=copy();bad.places[0].claims[0].sourceIds=['does-not-exist'];
  assert.throws(()=>validateHistoricalEvidence(bad), /missing source/);
  bad=copy();bad.sources.push(structuredClone(bad.sources[0]));
  assert.throws(()=>validateHistoricalEvidence(bad), /Duplicate/);
  bad=copy();bad.location.georeferenced=true;
  assert.throws(()=>validateHistoricalEvidence(bad), /precise georeference/);
});
test('research candidates say exactly what has and has not been accessed', () => {
  const out=makeHistoricalOverlay(evidence);
  const entries=Object.fromEntries(out.researchCandidates.map(x=>[x.id,x]));
  assert.match(entries['city-directory-1959'].acquisition,/contents not read/);
  assert.match(entries['city-directory-1961'].acquisition,/contents not read/);
  assert.match(entries['period-photo-1950'].period,/1950/);
  assert.ok(out.warnings.some(x=>/1959 and 1961/.test(x)));
});
