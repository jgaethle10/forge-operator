import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  authorizeInternalOpsMachineKey,
  ingestInternalOpsSnapshot,
  INTERNALOPS_MISSION_KEY,
  validateInternalOpsSnapshot,
} from './snapshot-ingress.mjs';

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-internalops-ingress-'));
const snapshot = {
  ok: true,
  contract: 'eps_systemia_read_only_snapshot_v1',
  source_app_id: 'legacy-id-must-not-persist',
  generated_at: '2026-09-30T18:00:00.000Z',
  authority: {
    read_only: true,
    contains_personal_contact_data: false,
    contains_tax_or_payment_account_data: false,
    may_authorize_mutation: false,
    note: 'Aggregate decision support only.',
  },
  jobs: {
    active_or_scheduled: 3,
    ready_to_invoice_count: 2,
    ready_to_invoice_value: 1400,
    verified_outstanding_count: 1,
    verified_outstanding_value: 650,
    payment_state_reconciliation_holds: 0,
  },
  crew: {
    active_team_members: 4,
    clocked_in_now: 1,
    current_period_submitted_logs: 2,
    current_period_approved_unpaid_logs: 1,
    current_period_approved_unpaid_hours: 6.5,
    current_period_approved_unpaid_gross: 162.5,
  },
  payroll_integrity: {
    action_gate: 'clear',
    current_period_paid_logs_without_linked_payment: 0,
    corrected_unapproved_logs: 0,
    current_period_start: '2026-09-20T00:00:00.000Z',
  },
  reimbursements: {
    open_items: 1,
    open_balance: 42.5,
    payment_records_observed: 2,
  },
  pipeline: {
    leads_needing_contact_or_followup: 4,
    events_next_48h: 3,
  },
  record_counts: {
    jobs: 20,
    team_members: 8,
    time_logs: 100,
    worker_payments: 20,
    expenses: 10,
    reimbursement_payments: 8,
    leads: 30,
    calendar_events: 18,
  },
};

assert.equal(authorizeInternalOpsMachineKey('correct-key', 'correct-key'), true);
assert.equal(authorizeInternalOpsMachineKey('wrong-key', 'correct-key'), false);
assert.equal(authorizeInternalOpsMachineKey('', 'correct-key'), false);

const validated = validateInternalOpsSnapshot(snapshot);
assert.equal('source_app_id' in validated, false);
assert.equal(validated.authority.read_only, true);

assert.throws(
  () => validateInternalOpsSnapshot({
    ...snapshot,
    authority: { ...snapshot.authority, contains_personal_contact_data: true },
  }),
  /snapshot_personal_contact_data_forbidden/
);

const first = ingestInternalOpsSnapshot({
  snapshot,
  missionKey: INTERNALOPS_MISSION_KEY,
  sourceCheckpointId: 'checkpoint-001',
  stateDir,
  now: new Date('2026-09-30T18:01:00.000Z'),
});
assert.equal(first.ok, true);
assert.equal(first.accepted, true);
assert.equal(first.duplicate, false);
assert.match(first.payload_hash, /^[a-f0-9]{64}$/);

const second = ingestInternalOpsSnapshot({
  snapshot,
  missionKey: INTERNALOPS_MISSION_KEY,
  sourceCheckpointId: 'checkpoint-001',
  stateDir,
  now: new Date('2026-09-30T18:02:00.000Z'),
});
assert.equal(second.duplicate, true);
assert.equal(second.payload_hash, first.payload_hash);

const latest = JSON.parse(fs.readFileSync(path.join(stateDir, 'latest.json'), 'utf8'));
assert.equal(latest.snapshot_key, first.snapshot_key);
assert.equal(latest.source_system, 'legacy_internalops_adapter');
assert.equal(latest.snapshot.source_app_id, undefined);
assert.equal(latest.snapshot.jobs.ready_to_invoice_value, 1400);

const receiptFiles = fs.readdirSync(path.join(stateDir, 'receipts'));
assert.equal(receiptFiles.length, 1);

assert.throws(
  () => ingestInternalOpsSnapshot({
    snapshot,
    missionKey: 'wrong-mission',
    stateDir,
  }),
  /mission_key_invalid/
);

fs.rmSync(stateDir, { recursive: true, force: true });
console.log(JSON.stringify({
  status: 'INTERNALOPS_OWNED_SNAPSHOT_INGRESS_PASS',
  duplicate_replay_deduplicated: true,
  legacy_source_identifier_persisted: false,
  private_data_authority_gate: 'pass',
}));
