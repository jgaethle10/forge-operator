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
          geometry: { coordinates: [122.05, 23.7, 18.2] },
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
          geometry: { coordinates: [168.1, -21.0, 11.4] },
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

test('resident cycle collects official sources, stages an edition, transports admitted visuals, and leaves publication authority false', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'systemia-radar-'));
  const visualTokenFile=path.join(root,'visual-ingest-token');
  fs.writeFileSync(visualTokenFile,'r'.repeat(64)+'\n',{mode:0o600});
  const visualTransportCalls=[];
  const visualTransportFetch=async(url,options={})=>{
    const envelope=JSON.parse(String(options.body||'{}'));
    visualTransportCalls.push({url:String(url),options,envelope});
    return {
      ok:true,
      status:201,
      async json(){
        return {
          ok:true,
          schema:'evercraft.visual-desk.ingest-receipt.v1',
          receipt_id:'visual-ingest:'+String(envelope.story_sha256||'').slice(0,24),
          status:'materialized',
          slug:envelope.story?.slug||null,
          story_sha256:envelope.story_sha256,
          canonical_url:'https://fabric.systemiacommandcenters.com/visuals/'+envelope.story?.slug+'/',
          publicationAuthority:false,
          external_social_publish_performed:false,
        };
      }
    };
  };
  try {
    const resident = createRadarResident({
      stateDir: root,
      fetchImpl: fakeFetch,
      materialityThreshold: 0.45,
      visualTransportUrl:'https://fabric.systemiacommandcenters.com/api/visuals/ingest',
      visualTransportTokenFile:visualTokenFile,
      visualTransportFetch,
      clock: () => new Date('2026-09-30T20:00:00.000Z'),
      journalUrl: 'https://journal.evercraft.global/',
      autoReleaseOwned: true
    });

    const receipt = await resident.runOnce();
    assert.equal(receipt.status, 'pass');
    assert.equal(receipt.collected_observations, 3);
    assert.equal(receipt.publication_authority, false);
    assert.equal(receipt.release_gate_status, 'ready');
    assert.ok(receipt.visual_admission_evaluated >= 1);
    assert.ok(receipt.visual_candidate_count >= 1);
    assert.ok(receipt.visual_outbox_story_count >= 1);
    assert.equal(receipt.visual_outbox_index, 'visual-desk-outbox/index.json');
    assert.equal(receipt.visual_transport_status,'pass');
    assert.ok(receipt.visual_transport_delivered>=1);
    assert.equal(receipt.visual_transport_failed,0);
    assert.equal(visualTransportCalls.length,receipt.visual_transport_delivered);
    assert.ok(visualTransportCalls.every((call)=>call.options.headers.authorization==='Bearer '+'r'.repeat(64)));
    assert.ok(visualTransportCalls.every((call)=>call.envelope.schema==='evercraft.visual-desk.transport-envelope.v1'));
    assert.ok(visualTransportCalls.every((call)=>call.envelope.publicationAuthority===false));
    assert.ok(visualTransportCalls.every((call)=>call.envelope.story_sha256===call.options.headers['x-evercraft-idempotency-key']));
    assert.equal(receipt.owned_release.status, 'released_owned_archive');
    assert.equal(receipt.owned_release.external_social_publish_performed, false);

    const health = resident.health();
    assert.equal(health.ok, true);
    assert.ok(health.observation_count >= 3);
    assert.ok(health.latest_visual_candidate_count >= 1);
    assert.ok(health.visual_outbox_story_count >= 1);
    assert.equal(health.visual_outbox_ready, true);
    assert.equal(health.visual_transport_configured,true);
    assert.equal(health.visual_transport_status,'pass');
    assert.ok(health.visual_transport_delivered>=1);

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
      'visual-admission.json',
      'visual-desk-outbox/index.json',
      'visual-transport-receipt.json',
      'receipts.jsonl'
    ]) {
      assert.ok(fs.existsSync(path.join(root, filename)), `${filename} should be persisted`);
    }

    const packet = JSON.parse(fs.readFileSync(path.join(root, 'journal-editorial-packet.json'), 'utf8'));
    assert.equal(packet.publication_authority, false);
    assert.ok(packet.required_gates.includes('freshness_recheck'));

    const visualState = resident.visualState();
    assert.equal(visualState.publicationAuthority, false);
    assert.equal(visualState.outbox.publicationAuthority, false);
    assert.ok(visualState.admission.admitted.length >= 1);
    assert.ok(visualState.outbox.story_count >= 1);
    assert.equal(visualState.transport.status,'pass');
    assert.equal(visualState.transport.publicationAuthority,false);
    assert.equal(visualState.transport.external_social_publish_performed,false);

    const outboxIndex = JSON.parse(
      fs.readFileSync(path.join(root, 'visual-desk-outbox', 'index.json'), 'utf8')
    );
    assert.equal(outboxIndex.schema, 'evercraft.visual-desk.radar-outbox-index.v1');
    assert.equal(outboxIndex.publicationAuthority, false);
    assert.ok(outboxIndex.story_count >= 1);
    const row = outboxIndex.stories[0];
    assert.match(row.story_sha256, /^[a-f0-9]{64}$/);
    assert.ok(row.visual_priority_score >= 0.58);
    assert.ok(row.source_refs.length >= 1);

    const story = JSON.parse(
      fs.readFileSync(path.join(root, 'visual-desk-outbox', row.file), 'utf8')
    );
    assert.equal(story.schema, 'evercraft.visual-story.v1');
    assert.equal(story.evidenceState, 'observed');
    assert.equal(story.lines.length, 0);
    assert.ok(story.points.length >= 2);
    assert.ok(story.sourceRefs.some((ref) => /usgs/i.test(ref)));

    const releaseState = resident.releaseState();
    assert.equal(releaseState.index.releases.length, 1);
    assert.equal(releaseState.latest_release.publication_authority, 'owned_radar_archive_only');
    assert.equal(releaseState.corrections.corrections.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
