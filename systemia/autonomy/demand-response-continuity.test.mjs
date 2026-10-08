import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDemandResponse } from './demand-response-continuity.mjs';

const at = '2026-10-07T23:00:00.000Z';
const assess = (overrides = {}) => auditDemandResponse({
  leads: [], prospects: [], notifications: [], closeActions: [], now: at, ...overrides,
});

test('missing source snapshots remain unknown instead of fake zero', () => {
  const report = auditDemandResponse({ now: at });
  assert.deepEqual(report.coverage, {
    leads: false, prospects: false, notifications: false, closeActions: false,
  });
  assert.equal(report.summary.new_leads, null);
  assert.equal(report.summary.failed_notification_records, null);
  assert.equal(report.summary.settled_revenue_cents, null);
  assert.equal(report.alerts.length, 0);
});

test('new lead without owner and response is escalated; notification failure is not human acknowledgment', () => {
  const report = assess({
    leads: [{ lead_id: 'ld-1', status: 'New', createdAt: '2026-10-07T22:00:00Z', email: 'private@example.org' }],
    notifications: [{ leadId: 'ld-1', status: 'failed', channel: 'sms' },
      { leadId: 'ld-1', status: 'success', channel: 'email' }],
  });
  assert.equal(report.summary.new_leads_unowned, 1);
  assert.equal(report.summary.first_response_overdue, 1);
  assert.equal(report.summary.failed_notification_records, 1);
  assert.deepEqual(report.alerts.map((a) => a.code), [
    'lead_notification_failure', 'new_lead_response_overdue', 'new_lead_unowned',
  ].sort((a,b) => {
    const rank = (x) => x === 'lead_notification_failure' ? 1 : 0;
    return rank(a)-rank(b) || a.localeCompare(b);
  }));
  assert.equal(report.authorization.no_automated_outbound, true);
  assert.equal(JSON.stringify(report).includes('private@example.org'), false);
});

test('unverified timestamp is explicit rather than an invented overdue SLA', () => {
  const report = assess({ leads: [{ lead_id: 'ld-2', status: 'New', assignedTo: 'ops' }] });
  assert.equal(report.summary.first_response_overdue, 0);
  assert.equal(report.summary.first_response_age_unknown, 1);
  assert.equal(report.alerts[0].code, 'first_response_age_unverified');
});

test('dedupe is stable by opaque source id and latest update wins', () => {
  const report = assess({ leads: [
    { lead_id: 'ld-3', status: 'New', updated_at: '2026-10-07T21:00:00Z', createdAt: '2026-10-07T21:00:00Z' },
    { lead_id: 'ld-3', status: 'Contacted', updated_at: '2026-10-07T22:00:00Z' },
    { status: 'New' },
  ] });
  assert.equal(report.summary.new_leads, 0);
  assert.equal(report.summary.duplicate_records.leads, 1);
  assert.equal(report.summary.unidentifiable_records.leads, 1);
});

test('contacted prospects need follow-up, but suppressed and terminal records are not queued for contact', () => {
  const report = assess({ prospects: [
    { prospect_key: 'p1', status: 'contacted', next_followup_at: null },
    { prospect_key: 'p2', status: 'contacted', next_followup_at: '2026-10-06T12:00:00Z' },
    { prospect_key: 'p3', status: 'do_not_contact' },
    { prospect_key: 'p4', status: 'lost' },
  ] });
  assert.equal(report.summary.contacted_prospects, 2);
  assert.equal(report.summary.contacted_without_followup, 1);
  assert.deepEqual(report.alerts.map((a) => a.code),
    ['contacted_without_followup', 'prospect_followup_overdue']);
  assert.ok(report.alerts.every((a) => !['p3', 'p4'].includes(a.source_key)));
});

test('expired owner action gets triage, never a fabricated sale', () => {
  const report = assess({ closeActions: [
    { attempt_id: 'a1', status: 'open', due_at: '2026-10-06T00:00:00Z' },
    { attempt_id: 'a2', status: 'completed', due_at: '2026-10-06T00:00:00Z' },
  ], leads: [{ lead_id: 'w1', status: 'Won', amount: 90000 }] });
  assert.equal(report.summary.close_actions_overdue, 1);
  assert.equal(report.summary.settled_revenue_cents, null);
  assert.equal(report.summary.verified_human_responses, null);
  assert.equal(report.alerts.length, 1);
});

test('invalid observation time or response SLA fails closed', () => {
  assert.throws(() => assess({ now: 'not-a-time' }), /valid_observation_time_required/);
  assert.throws(() => assess({ responseSlaMinutes: 0 }), /positive_response_sla_required/);
});
