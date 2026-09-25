import { createHash } from 'node:crypto';
import path from 'node:path';
import { YardOperator } from '../yard/operator.mjs';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

function receiptRef(value) {
  const ref = String(value || '').trim();
  return /^sha256:[a-f0-9]{64}$/i.test(ref) ? ref.toLowerCase() : null;
}

function opaqueRef(value) {
  return `sha256:${sha(String(value || ''))}`;
}

export function evaluateRemoteDeviceAdmissionWatch({
  configured = false,
  brokerDeploymentId = '',
  pendingView = null,
  queryError = null,
  now = new Date(),
} = {}) {
  const observedAt = now.toISOString();

  if (!configured || !String(brokerDeploymentId || '').trim()) {
    const state = {
      schema: 'evercraft.remote-device-admission-watch.v1',
      status: 'not_configured',
      pending_count: 0,
      human_approval_required: false,
      automatic_authorization_permitted: false,
      next_action: null,
      observed_at: observedAt,
      evidence_refs: [],
    };
    return {
      state,
      mission_snapshot: {
        schema: 'evercraft.kaidance.mission-snapshot.v1',
        snapshot_ref: `remote-device-admission:${sha(state)}`,
        observed_at: observedAt,
        counts: { scanned: 0, changed: 0, admitted: 0, held: 0 },
        evidence_refs: [],
      },
    };
  }

  if (queryError) {
    const errorRef = opaqueRef(queryError);
    const state = {
      schema: 'evercraft.remote-device-admission-watch.v1',
      status: 'degraded',
      pending_count: 0,
      human_approval_required: false,
      automatic_authorization_permitted: false,
      next_action: 'Restore the private Yard-to-broker management path before reviewing device admissions.',
      observed_at: observedAt,
      evidence_refs: [`remote-device-admission-query-error:${errorRef}`],
    };
    return {
      state,
      mission_snapshot: {
        schema: 'evercraft.kaidance.mission-snapshot.v1',
        snapshot_ref: `remote-device-admission:${sha(state)}`,
        observed_at: observedAt,
        counts: { scanned: 1, changed: 1, admitted: 0, held: 1 },
        evidence_refs: state.evidence_refs,
      },
    };
  }

  if (pendingView?.schema !== 'evercraft.yard.pending-remote-devices.v1') {
    throw new Error('pending remote device view schema invalid');
  }

  const pending = Array.isArray(pendingView.pending) ? pendingView.pending : [];
  const candidateReceipts = pending
    .map((row) => receiptRef(row.request_receipt_hash))
    .filter(Boolean);
  const managementReceipt = String(
    pendingView.compute_management_receipt_hash || ''
  ).trim();
  const evidenceRefs = [
    ...candidateReceipts.map((ref) => `remote-device-enrollment-request:${ref}`),
    ...(managementReceipt
      ? [`remote-device-inbox-read:${opaqueRef(managementReceipt)}`]
      : []),
  ];

  const count = pending.length;
  const state = {
    schema: 'evercraft.remote-device-admission-watch.v1',
    status: count > 0 ? 'waiting_for_explicit_approval' : 'clear',
    pending_count: count,
    human_approval_required: count > 0,
    automatic_authorization_permitted: false,
    next_action: count > 0
      ? 'Review the private Yard pending-device inbox and explicitly authorize, leave pending, or revoke each identity.'
      : null,
    observed_at: observedAt,
    evidence_refs: evidenceRefs,
  };

  return {
    state,
    mission_snapshot: {
      schema: 'evercraft.kaidance.mission-snapshot.v1',
      snapshot_ref: `remote-device-admission:${sha({
        status: state.status,
        pending_count: state.pending_count,
        evidence_refs: state.evidence_refs,
      })}`,
      observed_at: observedAt,
      counts: count > 0
        ? { scanned: count, changed: count, admitted: 0, held: count }
        : { scanned: 1, changed: 0, admitted: 0, held: 0 },
      evidence_refs: evidenceRefs,
    },
  };
}

export async function runRemoteDeviceAdmissionWatch({
  yardStateDir,
  brokerDeploymentId = '',
  now = new Date(),
} = {}) {
  const brokerId = String(brokerDeploymentId || '').trim();
  if (!brokerId) {
    return evaluateRemoteDeviceAdmissionWatch({
      configured: false,
      now,
    });
  }
  if (!yardStateDir) throw new Error('yardStateDir is required');

  const yard = new YardOperator({ stateDir: path.resolve(yardStateDir) });
  try {
    const pendingView = await yard.listPendingRemoteDevices(brokerId);
    return evaluateRemoteDeviceAdmissionWatch({
      configured: true,
      brokerDeploymentId: brokerId,
      pendingView,
      now,
    });
  } catch (error) {
    return evaluateRemoteDeviceAdmissionWatch({
      configured: true,
      brokerDeploymentId: brokerId,
      queryError: String(error?.message || error),
      now,
    });
  }
}
