import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('Hidden World Atlas is linked from the existing Worlds homepage', () => {
  const home = read('public/worlds/index.html');
  assert.match(home, /href="\.\/hidden-world\/"/);
  assert.match(home, /href="\.\/heritage\/"/, 'existing heritage link must remain');
});

test('atlas routes into a self-contained Yakima reconstruction', () => {
  const atlas = read('public/worlds/hidden-world/index.html');
  const yakima = read('public/worlds/hidden-world/yakima-standalone.html');
  assert.match(atlas, /href="yakima-standalone\.html"/);
  assert.doesNotMatch(atlas, /href="yakima\.html"/);
  assert.match(yakima, /scene-ready/);
  assert.match(yakima, /fallback-image/);
  assert.match(yakima, /NOT mapped to actual Yakima properties/);
  assert.match(yakima, /source-list/);
  assert.doesNotMatch(yakima, /<script[^>]+src=["']https?:\/\//);
});

test('atlas maintains 12 sourced location records and clear access caveats', () => {
  const csv = read('public/worlds/hidden-world/hidden_world_atlas_v1.csv');
  const lines = csv.trim().split(/\r?\n/);
  assert.equal(lines.length, 13, 'one header and 12 historical records expected');
  for (const key of ['id','confidence','access','precision','unknown','sources']) {
    assert.ok(lines[0].split(',').includes(key), key + ' metadata column required');
  }
  assert.ok(lines.some(line => line.startsWith('yakima,')));
  assert.ok(lines.some(line => line.startsWith('odessa,')));
  for (const line of lines.slice(1)) assert.match(line, /https:\/\//, 'each record needs a source URL');
  assert.match(csv, /regional pin/i);
  assert.match(csv, /Private \/ closed/);
});

test('documentation distinguishes staged source from confirmed public deployment', () => {
  const doc = read('docs/worlds/HIDDEN-WORLD-ATLAS.md');
  assert.match(doc, /not evidence of deployment/i);
});
