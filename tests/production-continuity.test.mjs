import test from 'node:test';
import assert from 'node:assert/strict';
import { auditProductionLedger, LEDGER_SCHEMA } from '../systemia/production-continuity/ledger.mjs';

const NOW = Date.parse('2026-11-09T22:00:00.000Z');
const receipt = (at = '2026-11-09T21:00:00.000Z') => ({
  verified: true, receipt_id: 'synthetic-001', artifact_ref: 'local://synthetic',
  source: 'fixture', verified_at: at,
});
const job = (overrides = {}) => ({
  project_id: 'synthetic-project', current_stage: 'ACTIVE',
  next_action: { kind: 'editorial_review', owner: 'studio' },
  last_verified_receipt: receipt(), ...overrides,
});
const run = (...projects) => auditProductionLedger({ schema: LEDGER_SCHEMA, projects }, { now: NOW });

test('fresh active project has no recovery action', () => {
  const result = run(job());
  assert.equal(result.attention_count, 0);
  assert.deepEqual(result.proposed_internal_work, []);
});

test('orphan canary detects absent next action and stale receipt', () => {
  const result = run(job({ next_action: null, last_verified_receipt: receipt('2026-11-06T01:00:00.000Z') }));
  assert.equal(result.projects[0].stale, true);
  assert.ok(result.projects[0].reason_codes.includes('missing_owned_next_action'));
  assert.ok(result.proposed_internal_work.some((x) => x.kind === 'recover_owned_next_action'));
  assert.equal(result.dispatch_performed, false);
});

test('unverified activity is not accepted as fresh receipt', () => {
  const result = run(job({ last_verified_receipt: { ...receipt(), verified: false } }));
  assert.equal(result.projects[0].has_verified_receipt, false);
  assert.ok(result.projects[0].reason_codes.includes('no_verified_receipt'));
});

test('research waiting on evidence cannot be published by scanner', () => {
  const result = run(job({ current_stage: 'WAITING_ON_EVIDENCE', blocker: 'missing record', last_verified_receipt: null }));
  assert.ok(result.proposed_internal_work.some((x) => x.kind === 'refresh_source_evidence'));
  assert.equal(result.publication_performed, false);
});

test('creative canon selection always goes to founder', () => {
  const result = run(job({ next_action: { kind: 'choose_variant', owner: 'little-red', requires_gate: 'canon' } }));
  assert.ok(result.founder_decisions.some((x) => x.kind === 'authorize_canon'));
  assert.equal(result.canon_modified, false);
});

test('publication approval is a protected gate', () => {
  const result = run(job({ current_stage: 'READY_FOR_RELEASE', publication_approved: false }));
  assert.ok(result.founder_decisions.some((x) => x.kind === 'approve_or_hold_publication'));
});

test('released status cannot pass without release evidence', () => {
  const result = run(job({ current_stage: 'RELEASED_VERIFIED', release_receipt: null }));
  assert.equal(result.attention_count, 1);
  assert.ok(result.proposed_internal_work.some((x) => x.kind === 'verify_release_receipt'));
});

test('parked means approved hold, not quiet disappearance', () => {
  const ok = run(job({ current_stage: 'PARKED_INTENTIONALLY', blocker: 'approved pause', parked_approved_by: 'founder' }));
  assert.equal(ok.attention_count, 0);
  const missing = run(job({ current_stage: 'PARKED_INTENTIONALLY', blocker: '' }));
  assert.equal(missing.attention_count, 1);
});

test('review due is flagged without inventing work completion', () => {
  const result = run(job({ review_due: '2026-11-09T20:00:00.000Z' }));
  assert.ok(result.projects[0].reason_codes.includes('review_due'));
  assert.equal(result.dispatch_performed, false);
});

test('duplicate project IDs are rejected', () => {
  assert.throws(() => run(job(), job()), /Duplicate project ID/);
});

test('audit does not echo private manuscript text or paths', () => {
  const secret = 'NEVER PUBLISH THESE UNAPPROVED STORY SPOILERS';
  const result = run(job({ title: secret, draft_text: secret, source_path: secret }));
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('unknown states and unsafe identifiers fail closed', () => {
  assert.throws(() => run(job({ current_stage: 'PUBLISHED' })), /Unsupported state/);
  assert.throws(() => run(job({ project_id: '../secret' })), /unsafe project ID/);
});
