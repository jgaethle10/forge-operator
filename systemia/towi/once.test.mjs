import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectRadarEdition, runTowiFromOwnerRadar } from './once.mjs';

const NOW = '2026-11-20T11:00:00.000Z';
const DATE = () => new Date(NOW);
function workspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'towi-once-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const radar = path.join(dir, 'radar');
  const towi = path.join(dir, 'towi');
  fs.mkdirSync(radar, { mode: 0o700 });
  return { dir, radar, towi, file: path.join(radar, 'latest-edition.json') };
}
function edition(now = NOW) {
  return {
    schema: 'evercraft.systemia-radar.edition.v1',
    edition_id: 'radar:source-backed-one',
    generated_at: now,
    signals: [{
      signal_id: 'radar:water',
      subject_key: 'yakima-water',
      observation_id: 'official-gauge-1',
      observed_at: now,
      last_verified_at: now,
      summary: 'Public water conditions changed.',
      truth_state: 'OBSERVED',
      change_state: 'NEW',
      materiality_score: 0.83,
      reliability: 0.95,
      domains: ['water'],
      region_keys: ['yakima-wa'],
      source_family: 'usgs-water',
      provenance_refs: ['https://waterdata.usgs.gov/'],
      review: { status: 'pass', independent_source_families: 1, freshness: { state: 'fresh' } }
    }],
    rolled_off_signals: []
  };
}
function write(file, body) {
  fs.writeFileSync(file, body, { mode: 0o600 });
}

test('one owner-local cycle consumes the exact existing private Radar edition and persists TOWI', async t => {
  const w = workspace(t);
  write(w.file, JSON.stringify(edition()));
  const sourceBefore = fs.readFileSync(w.file);
  const first = await runTowiFromOwnerRadar({
    radarStateDir: w.radar, towiStateDir: w.towi, clock: DATE
  });
  assert.equal(first.status, 'pass');
  assert.equal(first.dossier_count, 1);
  assert.equal(first.ingest_status, 'pass');
  assert.equal(first.publication_authority, false);
  assert.equal(first.institutional_contact_authority, false);
  assert.deepEqual(fs.readFileSync(w.file), sourceBefore, 'source file must be unchanged');
  const state = JSON.parse(fs.readFileSync(path.join(w.towi, 'state.json'), 'utf8'));
  assert.equal(Object.keys(state.dossiers).length, 1);
  assert.equal(fs.statSync(path.join(w.towi, 'state.json')).mode & 0o777, 0o600);

  const replay = await runTowiFromOwnerRadar({
    radarStateDir: w.radar, towiStateDir: w.towi, clock: DATE
  });
  assert.equal(replay.ingest_status, 'deduped');
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(w.towi, 'state.json'), 'utf8')).dossiers).length, 1);
});

test('missing, stale, malformed or world-readable Radar source holds without creating a dossier', async t => {
  const w = workspace(t);
  let receipt = await runTowiFromOwnerRadar({
    radarStateDir: w.radar, towiStateDir: w.towi, clock: DATE
  });
  assert.equal(receipt.reason, 'radar_edition_missing');
  assert.equal(fs.existsSync(w.towi), false);

  write(w.file, 'bad-json');
  assert.equal(inspectRadarEdition(w.file, { now: NOW }).reason, 'radar_edition_invalid_json');
  write(w.file, JSON.stringify(edition('2026-11-16T11:00:00.000Z')));
  assert.equal(inspectRadarEdition(w.file, { now: NOW }).reason, 'radar_edition_stale_or_future');
  write(w.file, JSON.stringify(edition()));
  fs.chmodSync(w.file, 0o644);
  assert.equal(inspectRadarEdition(w.file, { now: NOW }).reason, 'radar_edition_unsafe_or_oversized');
  receipt = await runTowiFromOwnerRadar({
    radarStateDir: w.radar, towiStateDir: w.towi, clock: DATE
  });
  assert.equal(receipt.status, 'hold');
  assert.equal(fs.existsSync(w.towi), false);
});

test('symlinked Radar state is not admitted as a trusted local source', t => {
  const w = workspace(t);
  const other = path.join(w.dir, 'other.json');
  write(other, JSON.stringify(edition()));
  fs.symlinkSync(other, w.file);
  assert.equal(inspectRadarEdition(w.file, { now: NOW }).reason, 'radar_edition_unsafe_or_oversized');
});
