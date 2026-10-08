#!/usr/bin/env node
// Systemia Demand Response: read-only commercial continuity admission candidates.
// Does not message anyone, create orders, publish content, or verify revenue.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const TERMINAL = new Set(['won', 'lost', 'declined', 'do_not_contact', 'closed', 'cancelled']);
const SENT_STATUSES = new Set(['contacted', 'responded', 'booked', 'qualified', 'won', 'lost']);
const asText = (v) => String(v ?? '').trim();
const lower = (v) => asText(v).toLowerCase().replace(/[\s-]+/g, '_');
const time = (v) => {
  if (!v) return null;
  const n = Date.parse(String(v));
  return Number.isFinite(n) ? n : null;
};
const records = (v) => Array.isArray(v) ? v : Array.isArray(v?.entities) ? v.entities : null;
const idFor = (v, fields) => fields.map((k) => asText(v?.[k])).find(Boolean) || null;
const modified = (v) => time(v?.updated_at ?? v?.updatedAt ?? v?.updated_date ?? v?.created_at ?? v?.createdAt ?? v?.created_date) ?? 0;

function canonicalize(items, keys) {
  const best = new Map();
  let identityMissing = 0;
  for (const item of items) {
    const id = idFor(item, keys);
    if (!id) { identityMissing++; continue; }
    const old = best.get(id);
    if (!old || modified(item) >= modified(old)) best.set(id, item);
  }
  return { records: [...best.entries()], identity_missing: identityMissing, duplicates: items.length - best.size - identityMissing };
}

export function auditDemandResponse({
  leads = null, prospects = null, notifications = null, closeActions = null,
  now = new Date(), responseSlaMinutes = 15,
} = {}) {
  const at = now instanceof Date ? now.getTime() : time(now);
  if (at == null) throw new Error('valid_observation_time_required');
  if (!Number.isFinite(responseSlaMinutes) || responseSlaMinutes <= 0) throw new Error('positive_response_sla_required');
  const inputs = { leads, prospects, notifications, closeActions };
  const coverage = Object.fromEntries(Object.entries(inputs).map(([key, val]) => [key, records(val) !== null]));
  const alerts = [];
  const alert = (source, sourceKey, code, severity, gate) => alerts.push({
    source, source_key: sourceKey, code, severity, next_gate: gate,
    state: 'requires_systemia_admission',
    human_review_required: true, automatic_contact_authorized: false, payment_authority: false,
  });

  const leadRows = coverage.leads ? canonicalize(records(leads), ['lead_id', 'id', '_id']) : null;
  const prospectRows = coverage.prospects ? canonicalize(records(prospects), ['prospect_key', 'id', '_id']) : null;
  const closeRows = coverage.closeActions ? canonicalize(records(closeActions), ['attempt_id', 'id', '_id']) : null;
  const notificationRows = coverage.notifications ? records(notifications) : null;

  const notificationFailures = new Set();
  let failedNotificationRecords = null;
  if (notificationRows) {
    failedNotificationRecords = 0;
    for (const entry of notificationRows) {
      if (lower(entry?.status) !== 'failed') continue;
      failedNotificationRecords++;
      const linked = idFor(entry, ['leadId', 'lead_id', 'leadKey']);
      if (linked) notificationFailures.add(linked);
    }
  }

  let newLeads = null, unowned = null, overdueFirstResponse = null, unknownFirstResponseAge = null;
  if (leadRows) {
    newLeads = 0; unowned = 0; overdueFirstResponse = 0; unknownFirstResponseAge = 0;
    for (const [id, item] of leadRows.records) {
      const status = lower(item.status);
      if (status !== 'new') continue;
      newLeads++;
      const owner = idFor(item, ['assignedTo', 'assigned_to', 'owner']);
      if (!owner) {
        unowned++;
        alert('Lead', id, 'new_lead_unowned', 'critical', 'assign_accountable_owner');
      }
      const created = time(item.createdAt ?? item.created_at ?? item.created_date);
      if (created == null || created > at) {
        unknownFirstResponseAge++;
        alert('Lead', id, 'first_response_age_unverified', 'high', 'verify_intake_timestamp');
      } else if (at - created > responseSlaMinutes * 60000) {
        overdueFirstResponse++;
        alert('Lead', id, 'new_lead_response_overdue', 'critical', 'verify_outreach_and_route_response');
      }
      if (notificationFailures.has(id)) {
        alert('Lead', id, 'lead_notification_failure', 'high', 'verify_relay_and_fallback');
      }
    }
  }

  let contacted = null, contactedWithoutFollowup = null;
  if (prospectRows) {
    contacted = 0; contactedWithoutFollowup = 0;
    for (const [id, item] of prospectRows.records) {
      if (lower(item.status) !== 'contacted') continue;
      contacted++;
      const due = time(item.next_followup_at ?? item.nextFollowupAt);
      if (due === null) {
        contactedWithoutFollowup++;
        alert('RevenueProspect', id, 'contacted_without_followup', 'high', 'assign_next_followup_or_terminal_disposition');
      } else if (due < at) {
        alert('RevenueProspect', id, 'prospect_followup_overdue', 'high', 'review_suppression_then_route_owner');
      }
    }
  }

  let overdueCloseActions = null;
  if (closeRows) {
    overdueCloseActions = 0;
    for (const [id, item] of closeRows.records) {
      const status = lower(item.status);
      if (status !== 'open') continue;
      const due = time(item.due_at);
      if (due !== null && due < at) {
        overdueCloseActions++;
        alert('RevenueCloseAction', id, 'close_action_overdue', 'high', 'owner_review_and_replan');
      }
    }
  }
  const severity = {
    critical: alerts.filter((a) => a.severity === 'critical').length,
    high: alerts.filter((a) => a.severity === 'high').length,
  };
  return {
    schema: 'evercraft.systemia.demand-response-continuity.v1',
    observed_at: new Date(at).toISOString(),
    evidence_state: 'snapshot_review_only',
    authorization: {
      systemia_admission_required: true, passport_required_for_contact: true,
      interaction_ledger_preflight_required: true, outreach_permit_required: true,
      notification_provider_success_not_human_acknowledgment: true,
      no_automated_outbound: true, no_payment_authority: true,
      won_is_not_settled_revenue: true,
    },
    coverage,
    summary: {
      new_leads: newLeads, new_leads_unowned: unowned,
      first_response_overdue: overdueFirstResponse,
      first_response_age_unknown: unknownFirstResponseAge,
      contacted_prospects: contacted, contacted_without_followup: contactedWithoutFollowup,
      close_actions_overdue: overdueCloseActions,
      failed_notification_records: failedNotificationRecords,
      unidentifiable_records: {
        leads: leadRows?.identity_missing ?? null,
        prospects: prospectRows?.identity_missing ?? null,
        closeActions: closeRows?.identity_missing ?? null,
      },
      duplicate_records: {
        leads: leadRows?.duplicates ?? null,
        prospects: prospectRows?.duplicates ?? null,
        closeActions: closeRows?.duplicates ?? null,
      },
      severity,
      settled_revenue_cents: null,
      verified_human_responses: null,
    },
    alerts: alerts.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1) ||
      a.source.localeCompare(b.source) || a.source_key.localeCompare(b.source_key) || a.code.localeCompare(b.code)),
  };
}

function flag(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] || null;
}
function readSnapshot(filename) {
  if (!filename) return null;
  const raw = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!records(raw)) throw new Error('invalid_snapshot_rows:' + filename);
  return raw;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = auditDemandResponse({
    leads: readSnapshot(flag('--leads')),
    prospects: readSnapshot(flag('--prospects')),
    notifications: readSnapshot(flag('--notifications')),
    closeActions: readSnapshot(flag('--close-actions')),
    now: flag('--at') || new Date(),
  });
  const out = flag('--out');
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  else console.log(JSON.stringify(report, null, 2));
  if (Object.values(report.coverage).some((v) => !v)) process.exitCode = 3;
}
