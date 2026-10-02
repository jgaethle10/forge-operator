import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFaieRuntime } from './runtime.mjs';

function evidenceObservation() {
  return {
    observation_id: 'obs:privacy-water-1',
    source_system: 'official-water-feed',
    source_family: 'Water Authority',
    observed_at: '2026-09-30T18:00:00.000Z',
    region_keys: ['yakima-wa'],
    domains: ['water', 'agriculture'],
    kind: 'irrigation_supply',
    evidence_state: 'verified',
    reliability: 0.92,
    anomaly_score: 0.71,
    summary: 'Irrigation supply is below the seasonal baseline in the scoped basin.',
    provenance_refs: ['https://example.gov/water'],
    facts: { severity: 0.74 }
  };
}

test('public-style FAIE preview does not persist the customer question', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faie-preview-'));
  try {
    const runtime = createFaieRuntime({ stateDir: dir });
    runtime.ingest(evidenceObservation(), { now: '2026-09-30T20:00:00.000Z' });

    const preview = runtime.preview({
      question: 'What evidence matters for irrigation resilience in Yakima?',
      region_keys: ['yakima-wa']
    }, { now: '2026-09-30T20:05:00.000Z' });

    assert.equal(preview.status, 'evidence_available');
    assert.equal(runtime.health().investigation_count, 0);

    runtime.investigate({
      question: 'Persist this authorized investigation.',
      region_keys: ['yakima-wa']
    }, { now: '2026-09-30T20:06:00.000Z' });

    assert.equal(runtime.health().investigation_count, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
