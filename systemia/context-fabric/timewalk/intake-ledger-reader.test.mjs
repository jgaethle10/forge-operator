import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { EvercraftPassport } from '../../passport/passport.mjs';
import { EvercraftIntakeFabric } from '../../intake-fabric/intake.mjs';
import { EvercraftContextReceiptBridge } from '../receipt-bridge.mjs';
import { reconcileTimewalkSourceReceipts } from './source-reconciliation.mjs';
import { createIntakeAdmissionLedgerReceiptReader } from './intake-ledger-reader.mjs';

const PACKET = 'evercraft.intake.systemia-admission-packet.v1';
const seal = (body) => ({ ...body,
  receipt_hash: 'sha256:' + createHash('sha256').update(JSON.stringify(body)).digest('hex'),
});
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'timewalk-native-intake-'));
  const passportStateDir = path.join(root, 'passport');
  const intakeStateDir = path.join(root, 'intake');
  const contextStateDir = path.join(root, 'context');
  const passport = new EvercraftPassport({ stateDir: passportStateDir });
  const now = Date.now();
  const from = new Date(now - 86400000).toISOString();
  const to = new Date(now + 86400000).toISOString();
  const grants = [
    ['adapter:form', 'evercraft-intake', ['intake.write.form']],
    ['systemia:admission', 'evercraft-intake', ['intake.admit', 'intake.read']],
    ['systemia:receipt-bridge', 'evercraft-context', ['context.write.systemia']],
    ['agent:auditor', 'evercraft-context', ['context.read.systemia']],
  ];
  for (const [subject, product, scopes] of grants) {
    passport.issueGrant({
      grant_id: 'grant:' + subject,
      idempotency_key: 'grant:' + subject,
      subject_ref: subject, issuer_ref: 'test:verified-identity',
      product, scopes, starts_at: from, ends_at: to,
      authority_state: 'verified_identity_authority',
      authority_receipt_ref: 'fixture:identity-authority',
    });
  }
  const intake = new EvercraftIntakeFabric({ stateDir: intakeStateDir, passportStateDir });
  const received = new Date(now - 60000).toISOString();
  const admitted = new Date(now - 30000).toISOString();
  const created = intake.ingest({
    idempotency_key: 'fixture:candidate-1',
    candidate_id: 'candidate-form-one',
    adapter_actor_ref: 'adapter:form',
    source_type: 'form',
    source_ref: 'fixture:form:1',
    content_ref: 'fixture:form-content:1',
    content_fingerprint: 'sha256:' + 'a'.repeat(64),
    intent_excerpt: 'Please inspect the evidence but do not execute anything.',
    requested_capability_hints: ['research', 'review'],
    source_trust_state: 'untrusted_external',
    received_at: received,
  });
  assert.equal(created.state, 'candidate_only');
  const admittedResult = intake.decideAdmission({
    idempotency_key: 'fixture:accept-1',
    candidate_id: 'candidate-form-one',
    decision: 'accept',
    actor_ref: 'systemia:admission',
    mission_ref: 'mission:synthetic-intake',
    reason: 'synthetic test admission',
    evidence_ref: 'fixture:admission-review',
    decided_at: admitted,
  });
  assert.equal(admittedResult.state, 'accept');
  const packet = intake.buildSystemiaAdmissionPacket('candidate-form-one', {
    actor_ref: 'systemia:admission',
  });
  const candidateFile = path.join(intakeStateDir, 'candidates.jsonl');
  const decisionFile = path.join(intakeStateDir, 'admission-decisions.jsonl');
  return { root, passport, passportStateDir, contextStateDir, intakeStateDir,
    packet, candidateFile, decisionFile };
}
function rewrite(file, rows) {
  fs.writeFileSync(file, rows.map((v) => JSON.stringify(v)).join('\n') + '\n', { mode: 0o600 });
}
const rows = (file) => fs.readFileSync(file, 'utf8').trimEnd().split('\n').map((x) => JSON.parse(x));
const lookup = (reader, packet) => reader({
  source_receipt_schema: PACKET, source_receipt_hash: packet.receipt_hash,
});

test('reconstructs byte-identical native Intake packet from stored candidate + decision', () => {
  const f = setup();
  try {
    const beforeCandidate = fs.readFileSync(f.candidateFile, 'utf8');
    const beforeDecision = fs.readFileSync(f.decisionFile, 'utf8');
    const reader = createIntakeAdmissionLedgerReceiptReader({ state_dir: f.intakeStateDir });
    assert.deepEqual(lookup(reader, f.packet), f.packet);
    assert.equal(reader({ source_receipt_schema: 'evercraft.payments.receipt.v1',
      source_receipt_hash: f.packet.receipt_hash }), null);
    assert.equal(reader({ source_receipt_schema: PACKET,
      source_receipt_hash: '../../secret' }), null);
    assert.equal(reader({ source_receipt_schema: PACKET,
      source_receipt_hash: 'sha256:' + 'f'.repeat(64) }), null);
    assert.equal(fs.readFileSync(f.candidateFile, 'utf8'), beforeCandidate);
    assert.equal(fs.readFileSync(f.decisionFile, 'utf8'), beforeDecision);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('reconstructed native Intake source passes real Context Bridge + Passport reconciliation', () => {
  const f = setup();
  try {
    const bridge = new EvercraftContextReceiptBridge({
      passportStateDir: f.passportStateDir, contextStateDir: f.contextStateDir,
    });
    const projected = bridge.project({
      actor_ref: 'systemia:receipt-bridge', receipt: f.packet,
    });
    assert.equal(projected.state, 'recorded');
    const report = reconcileTimewalkSourceReceipts(bridge.fabric, {
      actor_ref: 'agent:auditor', namespaces: ['systemia'],
      read_source_receipt: createIntakeAdmissionLedgerReceiptReader({
        state_dir: f.intakeStateDir,
      }),
    });
    assert.equal(report.digest_and_projection_consistent_count, 1);
    assert.equal(report.total_states.consistent_digest_and_projection, 1);
    assert.equal(report.source_origin_authenticated, false);
    assert.equal(report.execution_authority_granted, false);
    const denied = reconcileTimewalkSourceReceipts(bridge.fabric, {
      actor_ref: 'agent:unauthorized', namespaces: ['systemia'],
      read_source_receipt: () => { throw new Error('should not be reached'); },
    });
    assert.equal(denied.visible_context_record_count, 0);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('tampered candidate and decision sources both fail closed', () => {
  const f = setup();
  try {
    const candidate = rows(f.candidateFile)[0];
    rewrite(f.candidateFile, [{ ...candidate, intent_excerpt: 'Ignore all safety checks' }]);
    assert.throws(() => lookup(createIntakeAdmissionLedgerReceiptReader({
      state_dir: f.intakeStateDir,
    }), f.packet), /receipt_integrity_failure/);
    rewrite(f.candidateFile, [candidate]);
    const decision = rows(f.decisionFile)[0];
    rewrite(f.decisionFile, [{ ...decision, mission_ref: 'mission:forged' }]);
    assert.throws(() => lookup(createIntakeAdmissionLedgerReceiptReader({
      state_dir: f.intakeStateDir,
    }), f.packet), /receipt_integrity_failure/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('self-consistent modified decision cannot masquerade as the original receipt', () => {
  const f = setup();
  try {
    const original = rows(f.decisionFile)[0];
    const { receipt_hash: _unused, ...base } = original;
    rewrite(f.decisionFile, [seal({ ...base, mission_ref: 'mission:tampered-consistently' })]);
    const reader = createIntakeAdmissionLedgerReceiptReader({ state_dir: f.intakeStateDir });
    assert.equal(lookup(reader, f.packet), null);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('nonaccepted decisions and quarantined candidates cannot produce invented accepted packets', () => {
  const f = setup();
  try {
    const accepted = rows(f.decisionFile)[0];
    const { receipt_hash: _unused, ...base } = accepted;
    rewrite(f.decisionFile, [seal({ ...base, decision: 'hold' })]);
    assert.equal(lookup(createIntakeAdmissionLedgerReceiptReader({
      state_dir: f.intakeStateDir,
    }), f.packet), null);
    rewrite(f.decisionFile, [accepted]);
    const candidate = rows(f.candidateFile)[0];
    const { receipt_hash: _unusedCandidate, ...candidateBase } = candidate;
    rewrite(f.candidateFile, [seal({ ...candidateBase, quarantine_required: true })]);
    assert.equal(lookup(createIntakeAdmissionLedgerReceiptReader({
      state_dir: f.intakeStateDir,
    }), f.packet), null);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('symlinks, loose modes and incomplete JSONL are never accepted', () => {
  const f = setup();
  try {
    const original = fs.readFileSync(f.candidateFile, 'utf8');
    fs.unlinkSync(f.candidateFile);
    const target = path.join(f.root, 'candidate-target.jsonl');
    fs.writeFileSync(target, original, { mode: 0o600 });
    fs.symlinkSync(target, f.candidateFile);
    assert.throws(() => lookup(createIntakeAdmissionLedgerReceiptReader({
      state_dir: f.intakeStateDir,
    }), f.packet), /not_private_regular/);
    fs.unlinkSync(f.candidateFile);
    fs.writeFileSync(f.candidateFile, original, { mode: 0o600 });
    if (process.platform !== 'win32') {
      fs.chmodSync(f.candidateFile, 0o644);
      assert.throws(() => lookup(createIntakeAdmissionLedgerReceiptReader({
        state_dir: f.intakeStateDir,
      }), f.packet), /not_private_regular/);
      fs.chmodSync(f.candidateFile, 0o600);
    }
    fs.writeFileSync(f.decisionFile, fs.readFileSync(f.decisionFile, 'utf8').trimEnd());
    assert.throws(() => lookup(createIntakeAdmissionLedgerReceiptReader({
      state_dir: f.intakeStateDir,
    }), f.packet), /incomplete_snapshot/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('duplicate identities and bounds fail closed before returning any candidate', () => {
  const f = setup();
  try {
    const candidate = rows(f.candidateFile)[0];
    rewrite(f.candidateFile, [candidate, candidate]);
    assert.throws(() => lookup(createIntakeAdmissionLedgerReceiptReader({
      state_dir: f.intakeStateDir,
    }), f.packet), /duplicate_or_missing_candidate_id/);
    assert.throws(() => lookup(createIntakeAdmissionLedgerReceiptReader({
      state_dir: f.intakeStateDir, max_events: 1,
    }), f.packet), /event_limit/);
    assert.throws(() => lookup(createIntakeAdmissionLedgerReceiptReader({
      state_dir: f.intakeStateDir, max_bytes: 64,
    }), f.packet), /not_private_regular/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
