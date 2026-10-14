import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ROOT = new URL('../public/living-events/', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('cases.json', ROOT), 'utf8'));
const html = readFileSync(new URL('index.html', ROOT), 'utf8');
const ALLOWED = new Set(['documented', 'reported', 'unresolved', 'provisional', 'unknown', 'estimated', 'modeled']);
test('v1 registry exposes three separate date-scoped events', () => {
  assert.deepEqual(Object.keys(cases), ['nepal','helens','yakima']);
  assert.notEqual(cases.nepal.id,cases.helens.id);
  assert.notEqual(cases.helens.id,cases.yakima.id);
});
test('all exhibit statements resolve to HTTPS source records', () => {
 for (const [key, entry] of Object.entries(cases)) {
   assert.ok(entry.id && entry.title && entry.date && entry.place && entry.overview, key);
   assert.ok(entry.sources.length>0 && entry.milestones.length>0 && entry.features.length>0, key);
   const sourceIds = new Set(entry.sources.map(source => source.id));
   assert.equal(sourceIds.size, entry.sources.length, key+' duplicate source IDs');
   for (const source of entry.sources) {
     assert.match(source.url, /^https:\/\/[^\s]+$/, key+' source URL');
     assert.ok(source.name && source.kind && source.note, key+' incomplete source metadata');
   }
   for (const claim of [...entry.milestones,...entry.features]) {
     assert.ok(claim.sources.length,key+' unsupported claim');
     assert.ok(claim.detail.length>15, key+' incomplete explanation');
     assert.ok(ALLOWED.has(claim.state),key+' invalid evidence state '+claim.state);
     for (const sourceId of claim.sources) assert.ok(sourceIds.has(sourceId),key+' orphaned citation '+sourceId);
   }
   for (const point of entry.features) {
     assert.ok(point.x>=0 && point.x<=100 && point.y>=0 && point.y<=100,key+' invalid conceptual marker');
   }
 }
});
test('exhibit does not claim surveyed coordinates or live emergency guidance', () => {
 assert.match(cases.nepal.caution,/not|no\b/i);
 assert.match(cases.yakima.caution,/not|no\b/i);
 assert.match(cases.helens.caution,/not|no\b/i);
 assert.match(html,/conceptual|schematic|thematic/i);
 assert.match(html,/No real-time emergency advice/i);
 assert.match(html,/noindex,nofollow/i);
});
test('public shell loads a single JSON registry and has an error state', () => {
 assert.match(html,/fetch\('\.\/cases\.json'/);
 assert.doesNotMatch(html,/<script id="events-json"/);
 assert.match(html,/Evidence dataset unavailable/);
 assert.match(html,/setCase\('nepal'\)/);
});
