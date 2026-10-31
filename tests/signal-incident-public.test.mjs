import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('public/signal/index.html', root), 'utf8');
const incident = JSON.parse(fs.readFileSync(new URL('public/signal/incidents/savannah-river-20261028.json', root), 'utf8'));

test('Signal incident is a dated static editorial case and not a fictional live feed', () => {
  assert.equal(incident.schema, 'evercraft.signal.incident.v1');
  assert.equal(incident.monitoring_state, 'static_editorial_case_not_live');
  assert.equal(incident.editorial_snapshot_date, '2026-10-29');
  assert.equal(incident.official_emergency_status, 'terminated');
  assert.match(html, /No live feed connected/);
  assert.match(html, /not live radiation monitoring/i);
  assert.match(html, /not an emergency alert service/i);
});

test('every evidence assertion and timeline item cites known source IDs', () => {
  const sourceIds = new Set(incident.sources.map(source => source.id));
  assert.equal(sourceIds.size, incident.sources.length);
  for (const entry of [...incident.verified, ...incident.reported_not_confirmed, ...incident.timeline]) {
    assert.ok(Array.isArray(entry.source_ids) && entry.source_ids.length, 'each entry must cite a source');
    for (const id of entry.source_ids) assert.ok(sourceIds.has(id), 'unknown source: ' + id);
  }
  for (const source of incident.sources) {
    assert.ok(source.url.startsWith('https://'), 'HTTPS source required');
    assert.ok(['primary','reporting'].includes(source.kind), 'source type required');
  }
});

test('the first official 6:21 PM release is preserved in the evidence and timeline', () => {
  const first = incident.sources.find(source => source.id === 'srs-1');
  assert.ok(first, 'official release #1 must be cited');
  assert.match(first.url, /savannah-river-site-emergency-response-event\\//);
  assert.ok(incident.timeline.some(entry => entry.local_time === '2026-10-28T18:21:00-04:00' && entry.source_ids.includes('srs-1')));
  assert.match(html, /6:21 PM EDT/);
  assert.match(html, /id="source-srs1"/);
});

test('known ambiguity and safety invariants are preserved', () => {
  assert.ok(incident.reported_not_confirmed.some(x => /5:39/.test(x.claim) && /5:07/.test(x.claim)));
  assert.ok(incident.reported_not_confirmed.some(x => /unfiltered/.test(x.claim)));
  assert.ok(incident.unknowns.some(x => /detection limits/i.test(x)));
  assert.ok(incident.methodology.principles.some(x => /restriction zone is not a measured contamination zone/i.test(x)));
  assert.match(html, /An FAA restriction is not a measured radiation plume/);
  assert.ok(!/stripe\.com|checkout\.stripe|data-merchant|subscription is active/i.test(html));
});

test('public surface includes evidence, citations, accessibility and export', () => {
  assert.match(html, /<main id="main">/);
  assert.match(html, /<nav class="navlinks" aria-label="Main navigation">/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="known"/);
  assert.match(html, /id="timeline"/);
  assert.match(html, /id="sources"/);
  assert.match(html, /incidents\/savannah-river-20261028\.json/);
  assert.match(html, /noopener noreferrer/);
});
