import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRadarResident } from './resident.mjs';

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() { return payload; }
  };
}

function fakeFetch(url) {
  if (String(url).includes('earthquake.usgs.gov')) {
    return Promise.resolve(jsonResponse({
      metadata: {
        generated: Date.parse('2026-09-30T19:58:00.000Z'),
        count: 2
      },
      features: [
        {
          id: 'quake-a',
          properties: {
            mag: 5.6,
            place: '74 km S of Yonakuni, Japan',
            time: Date.parse('2026-09-30T19:40:00.000Z'),
            status: 'reviewed',
            tsunami: 0,
            url: 'https://earthquake.usgs.gov/earthquakes/eventpage/quake-a'
          }
        },
        {
          id: 'quake-b',
          properties: {
            mag: 5.0,
            place: '83 km NE of Tadine, New Caledonia',
            time: Date.parse('2026-09-30T19:20:00.000Z'),
            status: 'reviewed',
            tsunami: 0,
            url: 'https://earthquake.usgs.gov/earthquakes/eventpage/quake-b'
          }
        }
      ]
    }));
  }

  if (String(url).includes('services.swpc.noaa.gov')) {
    return Promise.resolve(jsonResponse([
      {
        product_id: 'EF3A',
        issue_datetime: '2026-09-30 19:50:00.000',
        message: 'ALERT: Electron 2MeV Integral Flux exceeded 1,000pfu\nThreshold Reached: 2026 Sep 30 1945 UTC\nStation: GOES-19'
      },
      {
        product_id: 'A20F',
        issue_datetime: '2026-09-30 18:30:00.000',
        message: 'WATCH: Geomagnetic Storm Category G1 Predicted\nHighest Storm Level Predicted by Day: Oct 02: G1 (Minor)'
      }
    ]));
  }

  return Promise.resolve({ ok: false, status: 404, async json() { return {}; } });
}

test('resident cycle collects official sources, stages an edition, and leaves publication authority false', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'systemia-radar-'));
  try {
    const resident = createRadarResident({
      stateDir: root,
      fetchImpl: fakeFetch,
      materialityThreshold: 0.45,
      clock: () => new Date('2026-09-30T20:00:00.000Z'),
      journalUrl: 'https://journal.evercraft.global/',
      autoReleaseOwned: true
    });

    const receipt = await resident.runOnce();
    assert.equal(receipt.status, 'pass');
    assert.equal(receipt.collected_observations, 3);
    assert.equal(receipt.publication_authority, false);
    assert.equal(receipt.release_gate_status, 'ready');
    assert.equal(receipt.owned_release.status, 'released_owned_archive');
    assert.equal(receipt.owned_release.external_social_publish_performed, false);

    const health = resident.health();
    assert.equal(health.ok, true);
    assert.ok(health.observation_count >= 3);

    const latest = resident.latest();
    assert.equal(latest.publication_authority, false);
    assert.ok(latest.signal_count >= 1);

    for (const filename of [
      'state.json',
      'latest-edition.json',
      'public-latest.json',
      'journal-editorial-packet.json',
      'linkedin-draft.json',
      'facebook-draft.json',
      'release-candidate.json',
      'receipts.jsonl'
    ]) {
      assert.ok(fs.existsSync(path.join(root, filename)), `${filename} should be persisted`);
    }

    const packet = JSON.parse(fs.readFileSync(path.join(root, 'journal-editorial-packet.json'), 'utf8'));
    assert.equal(packet.publication_authority, false);
    assert.ok(packet.required_gates.includes('freshness_recheck'));

    const releaseState = resident.releaseState();
    assert.equal(releaseState.index.releases.length, 1);
    assert.equal(releaseState.latest_release.publication_authority, 'owned_radar_archive_only');
    assert.equal(releaseState.corrections.corrections.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
