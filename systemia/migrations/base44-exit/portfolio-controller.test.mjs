import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const inventory = JSON.parse(fs.readFileSync(path.join(here, 'estate-live-2026-09-30.json'), 'utf8'));

test('Base44 estate is fully represented and cannot target Base44', () => {
  assert.equal(inventory.observed_count, inventory.apps.length);
  assert.ok(inventory.apps.length >= 50);
  const refs = inventory.apps.map((app) => app.legacy_ref);
  assert.equal(new Set(refs).size, refs.length);
  for (const app of inventory.apps) {
    assert.ok(app.product);
    assert.ok(Number.isInteger(app.wave));
    assert.ok(app.state);
    assert.ok(app.target);
    assert.doesNotMatch(app.target, /base44/i);
  }
});

test('unnamed legacy apps are quarantined for triage', () => {
  const untitled = inventory.apps.filter((app) => app.product === 'Untitled');
  assert.ok(untitled.length > 0);
  for (const app of untitled) {
    assert.equal(app.wave, 8);
    assert.equal(app.state, 'triage_required');
  }
});

test('RIVET is recognized as active cutover and Rewards is revenue-critical queue', () => {
  const rivet = inventory.apps.find((app) => app.product === 'RIVET');
  const rewards = inventory.apps.find((app) => app.product === 'Evercraft Rewards');
  assert.equal(rivet?.state, 'yard_report_engine_landed_route_cutover_active');
  assert.equal(rewards?.wave, 3);
  assert.equal(rewards?.target, 'github_plus_yard');
});
