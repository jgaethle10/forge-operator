import assert from 'node:assert/strict';
import test from 'node:test';
import { publicationPayload, qualityGate, resolveCompletedWeek } from './engine.mjs';

test('resolves the previous completed Monday to Sunday window', () => {
  const window = resolveCompletedWeek(new Date('2026-09-30T17:15:00-07:00'));
  assert.equal(window.startDate, '2026-09-21');
  assert.equal(window.endDate, '2026-09-27');
  assert.equal(window.slug, 'evercraft-week-in-motion-2026-09-21-2026-09-27');
});

function evidence() {
  return Array.from({ length: 8 }, (_, i) => ({
    id: `e-${i + 1}`,
    sourceType: 'github_pr',
    sourceRef: `https://github.com/evercraft/example/pull/${i + 1}`,
    occurredAt: '2026-09-24T12:00:00Z',
    title: `Systemia evidence item ${i + 1}`,
    detail: 'Verified build changed the operating contract and preserved a blocked state when runtime proof was absent.',
    truthState: 'merged_source_change',
    theme: i % 2 ? 'systemia' : 'yard_infrastructure',
  }));
}

function goodOutput() {
  const paragraph = 'Evercraft spent this part of the week tightening the boundary between a capability that exists in source and a capability that has earned operational trust. The change mattered because the system now preserves the evidence state beside the work, allowing later runs to inherit what was actually proven instead of relying on a fluent description of intended behavior. That made the company easier to audit and harder to impress with its own unfinished machinery.';
  return {
    title: 'EVERCRAFT: WEEK IN MOTION | September 21-27, 2026',
    subtitle: 'The operating fabric got harder to fool.',
    excerpt: 'A weekly audit.',
    seo_description: 'A weekly audit.',
    article_markdown: [
      '## The operating fabric tightened',
      paragraph,
      paragraph,
      '## Infrastructure learned from failure',
      paragraph,
      paragraph,
      '## Distribution became part of the machine',
      paragraph,
      paragraph,
      '## What this week taught Evercraft how to do next',
      paragraph,
      paragraph,
    ].join('\n\n'),
    social_post: paragraph + '\n\n' + paragraph,
    listen_comment: "If you'd rather listen along, the deeper audit is in the Evercraft Journal: {{ARTICLE_URL}}",
    visual_brief: { thesis: 'Evidence becomes infrastructure.', real_asset_priorities: [], synthetic_allowed: [], synthetic_forbidden: [] },
    claim_refs: evidence().slice(0, 5).map((e) => ({ claim: e.title, evidence_ids: [e.id] })),
  };
}

test('publishing standard rejects stacked short one-line cadence', () => {
  const output = goodOutput();
  output.article_markdown = '## What this week taught Evercraft how to do next\n\nBuild more.\n\nShip more.\n\nMove faster.\n\nRemember everything.';
  const gate = qualityGate({ output, evidence: evidence(), window: resolveCompletedWeek(new Date('2026-09-30T17:15:00-07:00')) });
  assert.equal(gate.pass, false);
  assert.ok(gate.reasons.some((r) => r.startsWith('one_sentence_paragraph_ratio_too_high') || r === 'stacked_short_one_sentence_paragraphs'));
});

test('publishing standard rejects forbidden dash characters', () => {
  const output = goodOutput();
  output.social_post += ' This is forbidden — because the doctrine says so.';
  const gate = qualityGate({ output, evidence: evidence(), window: resolveCompletedWeek(new Date('2026-09-30T17:15:00-07:00')) });
  assert.equal(gate.pass, false);
  assert.ok(gate.reasons.includes('forbidden_dash_character'));
});

test('publication payload cannot claim preflight when the gate fails', () => {
  const output = goodOutput();
  const window = resolveCompletedWeek(new Date('2026-09-30T17:15:00-07:00'));
  const payload = publicationPayload({ output, evidence: evidence(), window, gate: { pass: false } });
  assert.equal(payload.preflight_passed, false);
  assert.equal(payload.publishable, false);
  assert.equal(payload.visual_rights_state, 'not_required');
});
