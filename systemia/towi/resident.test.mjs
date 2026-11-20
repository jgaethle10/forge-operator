import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTowiResident } from './resident.mjs';

const at = '2026-11-20T10:00:00.000Z';
const signal = () => ({
  signal_id: 'radar:yakima:river-001',
  subject_key: 'yakima::water::river-level',
  observation_id: 'obs:yakima:river-001',
  observed_at: at,
  last_verified_at: at,
  summary: 'An official river observation changed.',
  truth_state: 'OBSERVED',
  change_state: 'NEW',
  materiality_score: 0.83,
  reliability: 0.91,
  domains: ['water'],
  region_keys: ['yakima-wa'],
  source_family: 'usgs-water',
  provenance_refs: ['https://waterdata.usgs.gov/'],
  review: {
    status: 'pass',
    independent_source_families: 1,
    freshness: { state: 'fresh' },
    warnings: []
  },
  observation: { facts: {} }
});
function workspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-towi-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const create = (stateDir) => createTowiResident({
  stateDir,
  clock: () => new Date(at)
});

test('old TOWI resident completes an actual local cycle and writes private research receipts', async (t) => {
  const dir = workspace(t);
  const resident = create(dir);
  const edition = {
    schema: 'evercraft.systemia-radar.edition.v1',
    edition_id: 'radar:edition:yakima-001',
    signals: [signal()],
    rolled_off_signals: []
  };
  const first = await resident.runOnce({ radarEdition: edition });
  assert.equal(first.status, 'pass');
  assert.equal(first.ingest_status, 'pass');
  assert.equal(first.dossier_count, 1);
  assert.equal(first.publication_authority, false);
  assert.equal(resident.queue().length, 1);
  assert.equal(resident.queue()[0].readiness.status, 'research_required');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).processed_editions.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'public-latest.json'), 'utf8')).publication_authority, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'editorial-queue.json'), 'utf8')).publication_authority, false);
  const second = await resident.runOnce({ radarEdition: edition });
  assert.equal(second.ingest_status, 'deduped');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).processed_editions.length, 1);
  assert.equal(fs.statSync(path.join(dir, 'state.json')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  const persisted = create(dir);
  assert.equal(persisted.queue().length, 1, 'restarting must preserve the first dossier');
});

test('independent source evidence may advance a dossier, but still grants no publication authority', async (t) => {
  const resident = create(workspace(t));
  await resident.runOnce({ radarEdition: {
    edition_id: 'radar:edition:yakima-002', signals: [signal()], rolled_off_signals: []
  } });
  const id = resident.queue()[0].dossier_id;
  const added = resident.addEvidence(id, {
    source_family: 'regional-water-authority',
    independence_group: 'regional-water-authority',
    observed_at: at,
    evidence_state: 'reported',
    relationship: 'supports',
    summary: 'A second independent office reported related conditions.',
    provenance_refs: ['https://www.noaa.gov/']
  });
  assert.equal(added.status, 'pass');
  assert.equal(added.publication_authority, false);
  assert.equal(resident.dossier(id).readiness.independent_source_families, 2);
  assert.equal(resident.productionQueue().publication_authority, false);
});

test('corrupt existing state cannot silently erase investigations on restart', (t) => {
  const dir = workspace(t);
  fs.writeFileSync(path.join(dir, 'state.json'), 'INVALID EVIDENCE LEDGER');
  assert.throws(() => create(dir), /TOWI_STATE_CORRUPT_RECOVERY_REQUIRED/);
  assert.equal(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'), 'INVALID EVIDENCE LEDGER');
});

test('symlinked evidence state cannot be treated as a trusted private ledger', (t) => {
  const dir = workspace(t);
  const other = path.join(dir, 'other.json');
  fs.writeFileSync(other, '{}');
  fs.symlinkSync(other, path.join(dir, 'state.json'));
  assert.throws(() => create(dir), /TOWI_STATE_UNSAFE_EXISTING_FILE/);
});
