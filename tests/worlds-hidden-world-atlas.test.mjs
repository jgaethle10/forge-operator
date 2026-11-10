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
  assert.match(atlas, /href="yakima-evidence\.html"/, 'atlas must expose evidence lab');
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


test('Yakima evidence lab is source-backed and functional without JavaScript', () => {
  const lab = read('public/worlds/hidden-world/yakima-evidence.html');
  assert.match(lab, /Yakima Evidence Lab/);
  assert.match(lab, /1898–1899/);
  assert.match(lab, /1905–1915/);
  assert.match(lab, /1923–1924/);
  assert.match(lab, /National Register/);
  assert.match(lab, /Connected tunnels established by the records reviewed/);
  assert.match(lab, /0<\/strong><span>Connected tunnels/);
  assert.match(lab, /name="era"/);
  assert.match(lab, /id="era-1924"/);
  assert.match(lab, /href="yakima-standalone\.html"/);
  assert.match(lab, /yakima-evidence-ledger\.v1\.json/);
  const ledger = JSON.parse(read('public/worlds/hidden-world/yakima-evidence-ledger.v1.json'));
  assert.equal(ledger.schema,'evercraft.hidden-world.evidence-ledger.v1');
  assert.equal(ledger.records.length,7);
  assert.ok(ledger.records.every(r=>r.source_url.startsWith('https://')));
  assert.ok(ledger.records.every(r=>r.geometry_verified===false&&r.connected_tunnel_verified===false));
  assert.ok(ledger.records.every(r=>r.recorded_coordinates===null));

  assert.doesNotMatch(lab, /<script\b/i, 'historical evidence must remain visible in script-blocking previews');
});


test('Lund Building exhibit uses a source-backed period study, not invented tunnel geometry', () => {
  const page=read('public/worlds/hidden-world/lund-building.html');
  const lab=read('public/worlds/hidden-world/yakima-evidence.html');
  const atlas=read('public/worlds/hidden-world/index.html');
  const ledger=JSON.parse(read('public/worlds/hidden-world/yakima-evidence-ledger.v1.json'));
  assert.match(lab,/href="lund-building\.html"/);
  assert.match(atlas,/href="lund-building\.html"/);
  for(const year of ['1899','1910','1925','1983'])assert.match(page,new RegExp('id="y'+year+'"'));
  assert.match(page,/National Register nomination PDF/);
  assert.match(page,/two surrounding buildings by doorways/i);
  assert.match(page,/does not identify the connecting doorways as underground/i);
  assert.match(page,/proportions not surveyed/i);
  assert.doesNotMatch(page,/<script\b/i,'exhibit needs a scriptless visual fallback');
  const lund=ledger.records.find(r=>r.id==='yk-lund-building');
  assert.ok(lund?.documented_architecture);
  assert.equal(lund.recorded_coordinates,null);
  assert.equal(lund.geometry_verified,false);
  assert.equal(lund.connected_tunnel_verified,false);
  assert.equal(lund.documented_architecture.facts.length,7);
  assert.ok(lund.documented_architecture.inference_limits.some(x=>x.includes('not identified as below ground')));
  assert.match(lund.documented_architecture.source_url,/npgallery\.nps\.gov/);
});
