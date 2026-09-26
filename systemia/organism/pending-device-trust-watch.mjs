import { createHash } from 'node:crypto';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

function receiptRef(value) {
  const ref = String(value || '').trim();
  return ref.startsWith('sha256:') ? ref : null;
}

function opaqueCandidateRef(candidate) {
  const material = {
    node_id: String(candidate?.node_id || ''),
    device_fingerprint: String(candidate?.device_fingerprint || ''),
    request_receipt_hash: String(candidate?.request_receipt_hash || ''),
  };
  return `candidate:sha256:${sha(material)}`;
}

export function evaluatePendingDeviceTrustWatch({
  pending = [],
  configured = true,
  observationError = '',
  brokerDeploymentId = '',
  now = new Date(),
} = {}) {
  const observedAt = now.toISOString();

  if (!configured) {
    const state = {
      schema: 'evercraft.remote-device.trust-watch-state.v1',
      status: 'not_configured',
      pending_count: 0,
      human_approval_required: false,
      next_action: 'No remote-capacity broker is configured for this Core runtime.',
      broker_deployment_id: null,
      observed_at: observedAt,
      candidate_refs: [],
      evidence_refs: [],
    };
    return {
      state,
      mission_snapshot: {
        schema: 'evercraft.kaidance.mission-snapshot.v1',
        snapshot_ref: `remote-device-trust:not-configured:${sha(state)}`,
        observed_at: observedAt,
        counts: { scanned: 1, changed: 0, admitted: 0, held: 0 },
        evidence_refs: [`trust-watch-state:sha256:${sha(state)}`],
      },
    };
  }

  if (observationError) {
    const state = {
      schema: 'evercraft.remote-device.trust-watch-state.v1',
      status: 'observation_unavailable',
      pending_count: null,
      human_approval_required: false,
      next_action: 'Restore the leased Yard view of the remote-capacity broker before making device-trust decisions.',
      broker_deployment_id: String(brokerDeploymentId || ''),
      observed_at: observedAt,
      candidate_refs: [],
      evidence_refs: [],
      observation_error_hash: `sha256:${sha(observationError)}`,
    };
    return {
      state,
      mission_snapshot: {
        schema: 'evercraft.kaidance.mission-snapshot.v1',
        snapshot_ref: `remote-device-trust:observation-unavailable:${sha(state)}`,
        observed_at: observedAt,
        counts: { scanned: 1, changed: 1, admitted: 0, held: 1 },
        evidence_refs: [
          state.observation_error_hash,
          `trust-watch-state:sha256:${sha(state)}`,
        ],
      },
    };
  }

  const rows = Array.isArray(pending) ? pending : [];
  const candidateRefs = rows.map(opaqueCandidateRef);
  const evidenceRefs = rows
    .map((row) => receiptRef(row?.request_receipt_hash))
    .filter(Boolean);

  const hasPending = rows.length > 0;
  const state = {
    schema: 'evercraft.remote-device.trust-watch-state.v1',
    status: hasPending ? 'waiting_for_explicit_authorization' : 'clear',
    pending_count: rows.length,
    human_approval_required: hasPending,
    next_action: hasPending
      ? 'Review pending remote devices in Yard. Explicitly authorize an exact candidate or leave it untrusted.'
      : 'No attested remote devices are waiting for approval.',
    broker_deployment_id: String(brokerDeploymentId || ''),
    observed_at: observedAt,
    candidate_refs: candidateRefs,
    evidence_refs: evidenceRefs,
  };

  return {
    state,
    mission_snapshot: {
      schema: 'evercraft.kaidance.mission-snapshot.v1',
      snapshot_ref: `remote-device-trust:${sha(state)}`,
      observed_at: observedAt,
      counts: {
        scanned: Math.max(1, rows.length),
        changed: hasPending ? 1 : 0,
        admitted: 0,
        held: hasPending ? 1 : 0,
      },
      evidence_refs: [
        ...evidenceRefs,
        `trust-watch-state:sha256:${sha(state)}`,
      ],
    },
  };
}

export async function collectPendingDeviceTrustWatch({
  yard,
  brokerDeploymentId = '',
  now = new Date(),
} = {}) {
  const configured = Boolean(String(brokerDeploymentId || '').trim());
  if (!configured) {
    return evaluatePendingDeviceTrustWatch({
      configured: false,
      now,
    });
  }

  try {
    const view = await yard.listPendingRemoteDevices(brokerDeploymentId);
    return evaluatePendingDeviceTrustWatch({
      configured: true,
      brokerDeploymentId,
      pending: view.pending || [],
      now,
    });
  } catch (error) {
    return evaluatePendingDeviceTrustWatch({
      configured: true,
      brokerDeploymentId,
      observationError: String(error?.message || error),
      now,
    });
  }
}
