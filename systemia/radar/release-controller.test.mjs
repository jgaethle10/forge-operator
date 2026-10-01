import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildRadarRelease,
  evaluateRadarRelease,
  listRadarCorrections,
  listRadarReleases,
  persistRadarRelease,
  readRadarReleaseAsset,
  reconcileRadarCorrections
} from './release-controller.mjs';

function edition(overrides = {}) {
  return {
    schema: 'evercraft.systemia-radar.edition.v1',
    edition_id: 'radar-edition:proof-release',
    generated_at: '2026-10-01T01:00:00.000Z',
    domains: ['geophysics', 'space_weather'],
    signal_count: 2,
    signals: [
      {
        signal_id: 'radar:quake',
        subject_key: 'quake',
        observation_id: 'obs:quake:1',
        summary: 'USGS recorded a reviewed M5.8 earthquake in the current feed, changing the active seismic evidence board for this verification cut.',
        truth_state: 'OBSERVED',
        change_state: 'NEW',
        materiality_score: 0.83,
        observed_at: '2026-10-01T00:45:00.000Z',
        last_verified_at: '2026-10-01T01:00:00.000Z',
        domains: ['geophysics'],
        region_keys: ['pacific'],
        source_family: 'usgs',
        provenance_refs: ['https://earthquake.usgs.gov/example'],
        review: { freshness: { state: 'fresh' }, warnings: [] }
      },
      {
        signal_id: 'radar:space',
        subject_key: 'space',
        observation_id: 'obs:space:1',
        summary: 'NOAA Space Weather Prediction Center issued a current watch that remains a forecast rather than an observed terrestrial outcome.',
        truth_state: 'PENDING',
        change_state: 'NEW',
        materiality_score: 0.77,
        observed_at: '2026-10-01T00:50:00.000Z',
        last_verified_at: '2026-10-01T01:00:00.000Z',
        domains: ['space_weather'],
        region_keys: ['global'],
        source_family: 'noaa-swpc',
        provenance_refs: ['https://services.swpc.noaa.gov/example'],
        review: { freshness: { state: 'fresh' }, warnings: [] }
      }
    ],
    change_wall: [],
    propagation_candidates: [],
    ...overrides
  };
}

function packet(overrides = {}) {
  return {
    schema: 'evercraft.journal.radar-editorial-packet.v1',
    packet_id: 'journal:radar-edition:proof-release',
    source_edition_id: 'radar-edition:proof-release',
    dek: 'A source-grounded Systemia Radar verification cut preserving what changed and what remains unresolved.',
    sources: [
      { source_id: 'source:1', label: 'USGS', publisher: 'USGS', url: 'https://earthquake.usgs.gov/example', evidence_state: 'verified' },
      { source_id: 'source:2', label: 'NOAA SWPC', publisher: 'NOAA', url: 'https://services.swpc.noaa.gov/example', evidence_state: 'reported' }
    ],
    claims: [
      { claim: 'USGS recorded a current seismic event.', evidence_state: 'verified', source_refs: ['source:1'] },
      { claim: 'NOAA SWPC issued a current watch.', evidence_state: 'reported', source_refs: ['source:2'] }
    ],
    uncertainty_notes: [
      'The edition is a timestamped evidence state.',
      'The NOAA watch is not an observed terrestrial outcome.'
    ],
    ...overrides
  };
}

test('release gate clears a fresh, source-bound, nonpolitical edition', () => {
  const gate = evaluateRadarRelease({ edition: edition(), editorialPacket: packet() });
  assert.equal(gate.status, 'ready');
  assert.equal(gate.unattended_publication_allowed, true);
  assert.equal(gate.blockers.length, 0);
});

test('political signals are held out of unattended release', () => {
  const political = edition();
  political.signals[0].domains = ['public_policy'];
  political.domains = ['public_policy', 'space_weather'];
  const gate = evaluateRadarRelease({ edition: political, editorialPacket: packet() });
  assert.equal(gate.status, 'hold');
  assert.ok(gate.blockers.includes('political_auto_release_boundary'));
});

test('release controller writes article, visualization, receipt, and Clip outbox without external publishing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-release-'));
  try {
    const decision = buildRadarRelease({
      edition: edition(),
      editorialPacket: packet(),
      socialDrafts: [{
        status: 'editorial_ready',
        platform: 'linkedin',
        copy: 'Systemia Radar release copy.',
        character_count: 29,
        source_edition_id: 'radar-edition:proof-release'
      }]
    });
    assert.equal(decision.status, 'ready');

    const receipt = persistRadarRelease({
      stateDir: root,
      release: decision.release,
      at: '2026-10-01T01:01:00.000Z'
    });
    assert.equal(receipt.status, 'released_owned_archive');
    assert.equal(receipt.external_social_publish_performed, false);

    const index = listRadarReleases(root);
    assert.equal(index.releases.length, 1);
    const slug = index.releases[0].slug;
    const html = readRadarReleaseAsset(root, slug, 'index.html');
    const svg = readRadarReleaseAsset(root, slug, 'hero.svg');
    assert.match(html, /Reality has a clock/);
    assert.match(html, /Sources and evidence/);
    assert.match(svg, /Reality Before Narrative/);
    assert.ok(fs.existsSync(path.join(root, 'clip-outbox', `${slug}.json`)));

    const duplicate = persistRadarRelease({
      stateDir: root,
      release: decision.release,
      at: '2026-10-01T01:02:00.000Z'
    });
    assert.equal(duplicate.status, 'deduped');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('correction ledger detects when a released signal changes after publication', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-correction-'));
  try {
    const decision = buildRadarRelease({ edition: edition(), editorialPacket: packet() });
    persistRadarRelease({
      stateDir: root,
      release: decision.release,
      at: '2026-10-01T01:01:00.000Z'
    });

    const radarState = {
      streams: {
        quake: {
          current: {
            ...edition().signals[0],
            observation_id: 'obs:quake:2',
            summary: 'USGS revised the event after additional review.',
            truth_state: 'CORROBORATED'
          }
        },
        space: { current: edition().signals[1] }
      }
    };
    const currentEdition = {
      change_wall: [{
        signal_id: 'radar:quake',
        change_state: 'CORROBORATED'
      }]
    };

    const run = reconcileRadarCorrections({
      stateDir: root,
      radarState,
      currentEdition,
      at: '2026-10-01T02:00:00.000Z'
    });
    assert.equal(run.status, 'corrections_detected');
    assert.equal(run.corrections.length, 1);
    assert.equal(run.corrections[0].change_state, 'CORROBORATED');

    const list = listRadarCorrections(root);
    assert.equal(list.corrections.length, 1);
    assert.equal(list.corrections[0].public_note_required, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
