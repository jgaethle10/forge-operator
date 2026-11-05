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
  assert.match(html, /aria-label="Journal sections"/);
  assert.match(html, /id="lead-title"/);
  assert.match(html, /id="desk-systems"/);
  assert.match(html, /href="\.\/owned-journal-test\/"/);
  assert.match(html, /@media\(max-width:550px\)/);
  assert.doesNotMatch(html, /No current live edition/);
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


test('archives expired durable reporting without presenting it as a live edition', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-archive-'));
  const report = publishJournalStories([story()], {
    outDir,
    now: new Date('2026-10-06T16:56:00.000Z'),
    publicOrigin: 'https://journal.test.evercraft.local'
  });
  assert.equal(report.story_count, 0);
  assert.equal(report.archived_story_count, 1);
  assert.equal(report.live_edition, false);
  assert.equal(report.latest_published_at, null);

  const indexHtml = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  assert.match(indexHtml, /No current live edition/i);
  assert.doesNotMatch(indexHtml, /Live edition (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
  assert.match(indexHtml, /Archive/i);
  assert.match(indexHtml, /Archived reporting, not a live update/);
  assert.match(indexHtml, /class="archive-intro"/);
  assert.match(indexHtml, /id="desk-systems"/);
  assert.doesNotMatch(indexHtml, /href="\.\/feed\.xml">RSS<\/a>/);

  const articleHtml = fs.readFileSync(path.join(outDir, 'owned-journal-test', 'index.html'), 'utf8');
  assert.match(articleHtml, /Archived analysis/i);
  assert.match(articleHtml, /not part of the current live edition/i);

  const index = JSON.parse(fs.readFileSync(path.join(outDir, 'index.json'), 'utf8'));
  assert.equal(index.live_edition, false);
  assert.equal(index.stories.length, 0);
  assert.equal(index.archive.length, 1);
  assert.equal(index.archive[0].state, 'archived');

  const receipt = JSON.parse(fs.readFileSync(path.join(outDir, 'receipts', 'owned-journal-test.json'), 'utf8'));
  assert.equal(receipt.publication_state, 'archived');
  assert.equal(receipt.live_edition_eligible, false);
  assert.equal(receipt.archive_reason, 'freshness_window_expired');

  const feed = fs.readFileSync(path.join(outDir, 'feed.xml'), 'utf8');
  assert.doesNotMatch(feed, /Owned Journal Test/);
  const llms = fs.readFileSync(path.join(outDir, 'llms.txt'), 'utf8');
  assert.match(llms, /No story is currently inside its live freshness window/i);
  assert.match(llms, /State: archived; live freshness expired/i);
});


test('carries canonical article identity into the Clip handoff instead of requiring a guessed URL', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-clip-identity-'));
  publishJournalStories([story()], {
    outDir,
    now: new Date('2026-09-30T22:00:00.000Z'),
    publicOrigin: 'https://journal.test.evercraft.local'
  });

  const articleHtml = fs.readFileSync(path.join(outDir, 'owned-journal-test', 'index.html'), 'utf8');
  assert.match(articleHtml, /name="evercraft:story_id" content="journal:test:owned"/);

  const handoff = JSON.parse(fs.readFileSync(path.join(outDir, 'production', 'owned-journal-test', 'clip-handoff.json'), 'utf8'));
  assert.equal(handoff.canonical_url, 'https://journal.test.evercraft.local/owned-journal-test/');
  assert.equal(handoff.publication_receipt_ref, 'receipts/owned-journal-test.json');
  assert.equal(handoff.link_verification.expectedCanonicalUrl, handoff.canonical_url);
  assert.equal(handoff.link_verification.expectedOgUrl, handoff.canonical_url);
  assert.equal(handoff.link_verification.expectedStoryId, 'journal:test:owned');
  assert.equal(handoff.link_verification.requireCanonicalSelfMatch, true);
  assert.equal(handoff.link_verification.requireOpenGraphSelfMatch, true);

  const receipt = JSON.parse(fs.readFileSync(path.join(outDir, 'receipts', 'owned-journal-test.json'), 'utf8'));
  assert.equal(receipt.title, 'Owned Journal Test');
  assert.equal(receipt.clip_handoff_ref, 'production/owned-journal-test/clip-handoff.json');
});


test('renders a responsive ranking surface without a horizontally dependent table', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-ranking-'));
  const fixture = story();
  fixture.ranking_table = {
    schema: 'evercraft.journal.ranking-table.v1',
    title: 'Evercraft Top 3',
    note: 'Results-first ranking surface.',
    rows: [
      { rank: 1, team_name: 'Alpha State', record: { wins: 5, losses: 0 }, movement: 2, power_score: 94.25, confidence: 0.91 },
      { rank: 2, team_name: 'Beta Tech', record: { wins: 4, losses: 1 }, movement: 0, power_score: 91.10, confidence: 0.88 },
      { rank: 3, team_name: 'Gamma', record: { wins: 4, losses: 1 }, movement: null, power_score: 88.75, confidence: 0.86 }
    ]
  };
  publishJournalStories([fixture], {
    outDir,
    now: new Date('2026-09-30T22:00:00.000Z'),
    publicOrigin: 'https://journal.test.evercraft.local'
  });
  const html = fs.readFileSync(path.join(outDir, 'owned-journal-test', 'index.html'), 'utf8');
  assert.match(html, /ranking-surface/);
  assert.match(html, /#1/);
  assert.match(html, /Alpha State/);
  assert.match(html, /94\.25/);
  assert.doesNotMatch(html, /<table/i);
});

test('rejects malformed ranking surfaces before publication', () => {
  const fixture = story();
  fixture.ranking_table = {
    schema: 'evercraft.journal.ranking-table.v1',
    rows: [
      { rank: 1, team_name: 'Alpha State', power_score: 101, confidence: 0.9 }
    ]
  };
  assert.throws(() => validateJournalStory(fixture, {
    now: new Date('2026-09-30T22:00:00.000Z')
  }), /power_score must be 0 to 100/i);
});


test('publishes frozen machine evidence beside a Journal edition and binds its hash into the receipt', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-machine-evidence-'));
  const fixture = story();
  fixture.machine_evidence = {
    schema: 'evercraft.journal.machine-evidence.v1',
    relative_path: 'data/owned-journal-test.json',
    payload: {
      schema: 'evercraft.cfb.edition-evidence.v1',
      run_id: 'cfbpi:test',
      rankings: [{ rank: 1, team: 'Alpha State' }]
    }
  };
  publishJournalStories([fixture], {
    outDir,
    now: new Date('2026-09-30T22:00:00.000Z'),
    publicOrigin: 'https://journal.test.evercraft.local'
  });
  const evidencePath = path.join(outDir, 'data', 'owned-journal-test.json');
  assert.ok(fs.existsSync(evidencePath));
  const receipt = JSON.parse(fs.readFileSync(path.join(outDir, 'receipts', 'owned-journal-test.json'), 'utf8'));
  assert.equal(receipt.machine_evidence_ref, 'data/owned-journal-test.json');
  assert.match(receipt.machine_evidence_sha256, /^[a-f0-9]{64}$/);
});

test('rejects unsafe machine-evidence output paths', () => {
  const fixture = story();
  fixture.machine_evidence = {
    schema: 'evercraft.journal.machine-evidence.v1',
    relative_path: '../escape.json',
    payload: { ok: true }
  };
  assert.throws(() => validateJournalStory(fixture, {
    now: new Date('2026-09-30T22:00:00.000Z')
  }), /safe data/i);
});


test('ranking stories generate feed, square and story visuals and bind them into Clip lineage', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-ranking-visuals-'));
  const fixture = story();
  fixture.ranking_table = {
    schema: 'evercraft.journal.ranking-table.v1',
    title: 'Evercraft Top 25',
    note: 'CFBPI v0.2',
    rows: Array.from({ length: 25 }, (_, i) => ({
      rank: i + 1,
      team_name: i === 0 ? 'Alabama' : 'Team ' + (i + 1),
      record: { wins: 5, losses: i === 9 ? 1 : 0 },
      movement: null,
      power_score: 81.49 - i,
      confidence: 0.95
    }))
  };
  fixture.machine_evidence = {
    schema: 'evercraft.journal.machine-evidence.v1',
    relative_path: 'data/owned-journal-test.json',
    payload: {
      schema: 'evercraft.cfb.edition-evidence.v1',
      ranking_run_id: 'cfbpi:test',
      evidence_through_at: '2026-09-30T21:00:00.000Z',
      model: { model_version: 'evercraft-cfbpi-0.2.0' }
    }
  };
  publishJournalStories([fixture], {
    outDir,
    now: new Date('2026-09-30T22:00:00.000Z'),
    publicOrigin: 'https://journal.test.evercraft.local'
  });

  for (const format of ['feed','square','story']) {
    assert.ok(fs.existsSync(path.join(outDir, 'production', 'owned-journal-test', 'ranking-' + format + '.svg')));
  }

  const article = fs.readFileSync(path.join(outDir, 'owned-journal-test', 'index.html'), 'utf8');
  assert.match(article, /ranking-feed\.svg/);
  assert.match(article, /property="og:image"/);

  const handoff = JSON.parse(fs.readFileSync(path.join(outDir, 'production', 'owned-journal-test', 'clip-handoff.json'), 'utf8'));
  assert.match(handoff.ranking_visuals.feed.url, /ranking-feed\.svg$/);
  assert.match(handoff.ranking_visuals.feed.sha256, /^[a-f0-9]{64}$/);

  const receipt = JSON.parse(fs.readFileSync(path.join(outDir, 'receipts', 'owned-journal-test.json'), 'utf8'));
  assert.equal(receipt.ranking_visuals.story.ref, 'production/owned-journal-test/ranking-story.svg');
});

test('editorial hero uses only an explicitly rights-verified source photo', () => {
  const fixture = story();
  fixture.hero_visual = {
    url: 'https://example.com/official-field-photo.jpg',
    source_ref: 'source:a',
    rights_state: 'verified',
    alt: 'Documented field photograph',
    caption: 'Verified source photograph'
  };
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-photo-'));
  publishJournalStories([fixture], {
    outDir,
    now: new Date('2026-09-30T22:00:00.000Z'),
    publicOrigin: 'https://journal.test.evercraft.local'
  });
  const indexHtml = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  assert.match(indexHtml, /class="feature-photo"/);
  assert.match(indexHtml, /https:\/\/example\.com\/official-field-photo\.jpg/);
  assert.match(indexHtml, /Documented field photograph/);
});
