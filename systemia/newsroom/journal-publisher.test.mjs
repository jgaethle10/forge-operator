import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { publishJournalStories, validateJournalStory } from './journal-publisher.mjs';

function story() {
  return {
    schema: 'evercraft.journal.story.v1',
    story_id: 'journal:test:owned',
    slug: 'owned-journal-test',
    title: 'Owned Journal Test',
    dek: 'A deterministic test of the owned Evercraft Journal publisher.',
    desk: 'systems',
    story_type: 'Analysis',
    status: 'approved',
    published_at: '2026-09-30T21:00:00.000Z',
    updated_at: '2026-09-30T21:00:00.000Z',
    freshness_expires_at: '2026-10-01T21:00:00.000Z',
    evidence_state: 'verified_public_sources',
    sensitivity: { state: 'public_unclassified', classified_detail_policy: 'do_not_infer_or_expand' },
    sources: [
      { source_id: 'source:a', label: 'Source A', publisher: 'A', url: 'https://example.com/a', evidence_state: 'verified' },
      { source_id: 'source:b', label: 'Source B', publisher: 'B', url: 'https://example.com/b', evidence_state: 'reported' }
    ],
    claims: [
      { claim: 'A bounded claim.', evidence_state: 'verified', source_refs: ['source:a'] }
    ],
    sections: [
      { heading: 'First', body: 'This is a deliberately substantive paragraph used to prove that the owned publisher rejects empty card-shaped filler and requires enough explanatory prose to function as an actual article. It carries enough detail for the deterministic test.' },
      { heading: 'Second', body: 'The second section exists to preserve a flowing editorial structure rather than a stack of disconnected one-line fragments. It gives the article enough narrative material for the publisher quality contract to evaluate.' },
      { heading: 'Third', body: 'The final test section confirms that a publishable Evercraft Journal story has multiple developed sections, source lineage, evidence boundaries, freshness controls, and production-grade status before it can become public.' }
    ],
    uncertainty_notes: ['This fixture is synthetic test content.'],
    production_grade: { status: 'accepted', hero_kind: 'data_visualization', text_primary: false },
    editorial_gate: { status: 'accepted', score: 10 },
    fallen_brief: {
      contract: 'evercraft.fallen.journal.production.v1',
      package_key: 'journal:test:owned',
      mission_key: 'journal-owned-publisher',
      work_key: 'journal-owned-test',
      story: { title: 'Owned Journal Test', education_goal: 'Prove the publisher.' },
      evidence: {
        source_refs: ['source:a','source:b'],
        evidence_refs: ['source:a'],
        evidence_state: 'verified',
        confidence: 'high',
        freshness_state: 'fresh'
      },
      rights: { visual_rights_state: 'not_required' },
      visual_story: {
        id: 'owned-test',
        headline: 'Owned Journal Test',
        durationSec: 15,
        aspectRatio: '16:9',
        metrics: [{ id: 'metric', label: 'Test', value: 1, unit: 'story', evidenceState: 'public_source', sourceRefs: ['source:a'] }]
      }
    },
    derivatives: [{ platform: 'linkedin', copy: 'Owned Journal test derivative.' }]
  };
}

test('publishes an approved source-grounded story with receipts and machine surfaces', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-owned-'));
  const report = publishJournalStories([story()], {
    outDir,
    now: new Date('2026-09-30T22:00:00.000Z'),
    publicOrigin: 'https://journal.test.evercraft.local'
  });
  assert.equal(report.story_count, 1);
  assert.ok(fs.existsSync(path.join(outDir, 'index.html')));
  assert.ok(fs.existsSync(path.join(outDir, 'owned-journal-test', 'index.html')));
  assert.ok(fs.existsSync(path.join(outDir, 'receipts', 'owned-journal-test.json')));
  assert.ok(fs.existsSync(path.join(outDir, 'production', 'owned-journal-test', 'fallen-brief.json')));
  assert.ok(fs.existsSync(path.join(outDir, 'production', 'owned-journal-test', 'clip-handoff.json')));
  const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  assert.match(html, /Evercraft Journal/);
  assert.doesNotMatch(html, /Black Friday|shopping assistant/i);
  const articleHtml = fs.readFileSync(path.join(outDir, 'owned-journal-test', 'index.html'), 'utf8');
  assert.match(articleHtml, /https:\/\/journal\.test\.evercraft\.local\/owned-journal-test\//);
  const receipt = JSON.parse(fs.readFileSync(path.join(outDir, 'receipts', 'owned-journal-test.json'), 'utf8'));
  assert.equal(receipt.canonical_url, 'https://journal.test.evercraft.local/owned-journal-test/');
  const index = JSON.parse(fs.readFileSync(path.join(outDir, 'index.json'), 'utf8'));
  assert.equal(index.stories[0].canonical_url, 'https://journal.test.evercraft.local/owned-journal-test/');
  assert.equal(report.public_origin, 'https://journal.test.evercraft.local');
});

test('fails closed when freshness expires', () => {
  const fixture = story();
  fixture.freshness_expires_at = '2026-09-30T20:00:00.000Z';
  assert.throws(() => validateJournalStory(fixture, {
    now: new Date('2026-09-30T22:00:00.000Z')
  }), /freshness window has expired/i);
});

test('fails closed on unresolved hero rights', () => {
  const fixture = story();
  fixture.hero_visual = {
    url: 'https://example.com/hero.jpg',
    source_ref: 'source:a',
    rights_state: 'unknown'
  };
  assert.throws(() => validateJournalStory(fixture, {
    now: new Date('2026-09-30T22:00:00.000Z')
  }), /rights must be verified/i);
});

test('requires the full editorial preflight score', () => {
  const fixture = story();
  fixture.editorial_gate.score = 9;
  assert.throws(() => validateJournalStory(fixture, {
    now: new Date('2026-09-30T22:00:00.000Z')
  }), /10\/10/i);
});
