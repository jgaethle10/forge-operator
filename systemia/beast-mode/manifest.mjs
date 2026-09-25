import { createHash } from 'node:crypto';

export const BEAST_SCHEMA = 'evercraft.beast-mode.cargo.v1';
export const RECEIPT_SCHEMA = 'evercraft.beast-mode.delivery-receipt.v1';

export const BEAST_STATES = Object.freeze([
  'ADMITTED',
  'PACKING',
  'IN_TRANSIT',
  'RECEIVED',
  'VERIFIED',
  'DELIVERED',
  'QUARANTINED'
]);

const TRANSITIONS = Object.freeze({
  ADMITTED: new Set(['PACKING', 'QUARANTINED']),
  PACKING: new Set(['IN_TRANSIT', 'QUARANTINED']),
  IN_TRANSIT: new Set(['RECEIVED', 'QUARANTINED']),
  RECEIVED: new Set(['VERIFIED', 'QUARANTINED']),
  VERIFIED: new Set(['DELIVERED', 'QUARANTINED']),
  QUARANTINED: new Set(['PACKING']),
  DELIVERED: new Set()
});

const SHA256_RE = /^[a-f0-9]{64}$/i;

function clean(value) {
  return String(value ?? '').trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stable(value[key])])
    );
  }
  return value;
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

function requireString(value, name) {
  const out = clean(value);
  if (!out) throw new Error(`${name}_required`);
  return out;
}

function normalizeArtifact(raw, index) {
  const artifactId = requireString(raw?.artifact_id, `artifacts_${index}_artifact_id`);
  const sha256 = clean(raw?.sha256).toLowerCase();
  if (!SHA256_RE.test(sha256)) throw new Error(`artifacts_${index}_sha256_invalid`);
  const byteCount = Number(raw?.byte_count);
  if (!Number.isSafeInteger(byteCount) || byteCount < 0) {
    throw new Error(`artifacts_${index}_byte_count_invalid`);
  }

  return {
    artifact_id: artifactId,
    artifact_type: requireString(raw?.artifact_type, `artifacts_${index}_artifact_type`),
    filename: requireString(raw?.filename, `artifacts_${index}_filename`),
    mime_type: requireString(raw?.mime_type, `artifacts_${index}_mime_type`),
    sha256,
    byte_count: byteCount,
    evidence_state: requireString(raw?.evidence_state ?? 'unknown', `artifacts_${index}_evidence_state`),
    provenance: {
      source_asset_key: requireString(raw?.provenance?.source_asset_key ?? artifactId, `artifacts_${index}_source_asset_key`),
      source_package_key: clean(raw?.provenance?.source_package_key),
      source_revision: clean(raw?.provenance?.source_revision),
      geometry_sha256: clean(raw?.provenance?.geometry_sha256).toLowerCase() || null,
      renderer_revision: clean(raw?.provenance?.renderer_revision) || null
    },
    permissions: {
      customer_visible: raw?.permissions?.customer_visible === true,
      external_delivery_authorized: raw?.permissions?.external_delivery_authorized === true,
      mutation_authorized: raw?.permissions?.mutation_authorized === true
    }
  };
}

export function createCargoManifest(input, { now = new Date().toISOString() } = {}) {
  const source = {
    system: requireString(input?.source?.system, 'source_system'),
    app_id: clean(input?.source?.app_id) || null
  };
  const destination = {
    system: requireString(input?.destination?.system, 'destination_system'),
    app_id: clean(input?.destination?.app_id) || null,
    workspace: clean(input?.destination?.workspace) || null
  };
  const artifacts = Array.isArray(input?.artifacts)
    ? input.artifacts.map(normalizeArtifact)
    : [];
  if (!artifacts.length) throw new Error('artifacts_required');

  const authority = {
    scope: requireString(input?.authority?.scope ?? 'internal', 'authority_scope'),
    payment_state: clean(input?.authority?.payment_state) || 'not_required',
    customer_delivery_authorized: input?.authority?.customer_delivery_authorized === true,
    authorization_ref: clean(input?.authority?.authorization_ref) || null
  };

  if (authority.scope === 'external_customer' && !authority.customer_delivery_authorized) {
    throw new Error('external_customer_delivery_requires_explicit_authority');
  }

  const identity = {
    source,
    destination,
    authority,
    artifacts: artifacts.map((a) => ({
      artifact_id: a.artifact_id,
      sha256: a.sha256,
      byte_count: a.byte_count
    })),
    contract_version: 1
  };

  const cargoId = `beast:${digest(identity)}`;

  return {
    schema: BEAST_SCHEMA,
    cargo_id: cargoId,
    state: 'ADMITTED',
    created_at: now,
    updated_at: now,
    source,
    destination,
    authority,
    artifacts,
    delivery_requirements: {
      destination_object_exists: true,
      exact_sha256_match: true,
      exact_byte_count_match: true,
      provenance_present: true,
      permissions_match_manifest: true,
      explicit_external_delivery_authority: authority.scope === 'external_customer',
      receipt_required: true
    },
    attempts: 0,
    quarantine: null,
    events: [{
      at: now,
      from: null,
      to: 'ADMITTED',
      reason: 'systemia_admission',
      actor: 'systemia'
    }]
  };
}

export function transitionCargo(manifest, nextState, event = {}) {
  if (manifest?.schema !== BEAST_SCHEMA) throw new Error('beast_manifest_schema_invalid');
  if (!BEAST_STATES.includes(nextState)) throw new Error('beast_state_invalid');
  const current = manifest.state;
  if (!TRANSITIONS[current]?.has(nextState)) {
    throw new Error(`illegal_beast_transition:${current}->${nextState}`);
  }

  const at = clean(event.at) || new Date().toISOString();
  const next = structuredClone(manifest);
  next.state = nextState;
  next.updated_at = at;
  next.attempts = current === 'QUARANTINED' && nextState === 'PACKING'
    ? Number(next.attempts || 0) + 1
    : Number(next.attempts || 0);

  if (nextState === 'QUARANTINED') {
    next.quarantine = {
      reason: requireString(event.reason, 'quarantine_reason'),
      stage: current,
      detail: clean(event.detail) || null,
      at
    };
  } else if (current === 'QUARANTINED' && nextState === 'PACKING') {
    next.quarantine = null;
  }

  next.events = [
    ...(Array.isArray(next.events) ? next.events : []),
    {
      at,
      from: current,
      to: nextState,
      reason: clean(event.reason) || null,
      actor: clean(event.actor) || 'beast-mode'
    }
  ];
  return next;
}

export function verifyDestination(manifest, observations = []) {
  if (manifest?.schema !== BEAST_SCHEMA) throw new Error('beast_manifest_schema_invalid');
  const byId = new Map(
    (Array.isArray(observations) ? observations : [])
      .map((row) => [clean(row?.artifact_id), row])
      .filter(([key]) => key)
  );

  const results = manifest.artifacts.map((artifact) => {
    const observed = byId.get(artifact.artifact_id);
    const reasons = [];
    if (!observed) reasons.push('destination_object_missing');
    if (observed && clean(observed.sha256).toLowerCase() !== artifact.sha256) reasons.push('sha256_mismatch');
    if (observed && Number(observed.byte_count) !== artifact.byte_count) reasons.push('byte_count_mismatch');
    if (observed && observed.provenance_present !== true) reasons.push('provenance_missing');
    if (observed && observed.permissions_match !== true) reasons.push('permissions_mismatch');
    return {
      artifact_id: artifact.artifact_id,
      ok: reasons.length === 0,
      reasons
    };
  });

  return {
    ok: results.every((row) => row.ok),
    artifact_results: results
  };
}

export function buildDeliveryReceipt(manifest, verification, { now = new Date().toISOString() } = {}) {
  if (manifest?.state !== 'VERIFIED') throw new Error('cargo_must_be_verified_before_delivery_receipt');
  if (!verification?.ok) throw new Error('destination_verification_failed');

  if (manifest.authority.scope === 'external_customer' && !manifest.authority.customer_delivery_authorized) {
    throw new Error('external_customer_delivery_requires_explicit_authority');
  }

  const receipt = {
    schema: RECEIPT_SCHEMA,
    receipt_id: `beast-receipt:${digest({
      cargo_id: manifest.cargo_id,
      destination: manifest.destination,
      artifacts: manifest.artifacts.map((a) => [a.artifact_id, a.sha256, a.byte_count])
    })}`,
    cargo_id: manifest.cargo_id,
    delivered_at: now,
    source: manifest.source,
    destination: manifest.destination,
    authority: manifest.authority,
    artifacts: manifest.artifacts.map((artifact) => ({
      artifact_id: artifact.artifact_id,
      sha256: artifact.sha256,
      byte_count: artifact.byte_count
    })),
    verification,
    evidence: {
      destination_object_exists: true,
      sha256_match: true,
      byte_count_match: true,
      provenance_present: true,
      permissions_match: true
    }
  };

  return {
    manifest: transitionCargo(manifest, 'DELIVERED', {
      at: now,
      reason: 'destination_verified_and_receipt_written',
      actor: 'beast-mode'
    }),
    receipt
  };
}

export function cargoWorkItems(manifest) {
  if (manifest?.schema !== BEAST_SCHEMA) throw new Error('beast_manifest_schema_invalid');
  return manifest.artifacts.map((artifact) => ({
    kind: 'beast_cargo_artifact',
    key: artifact.artifact_id,
    raw: {
      cargo_id: manifest.cargo_id,
      source: manifest.source,
      destination: manifest.destination,
      authority: manifest.authority,
      artifact
    }
  }));
}
