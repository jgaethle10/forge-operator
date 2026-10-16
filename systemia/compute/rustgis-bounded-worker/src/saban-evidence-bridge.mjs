/**
 * Read-only Saban -> RustGIS evidence reconciliation, not a dispatcher.
 *
 * The worker receipt and artifact are untrusted inputs. The signed job is
 * verified against a separately supplied, trusted issuer public key. This
 * verifier proves content agreement, NOT the identity of a remote machine.
 * It is intentionally NOT registered with NodeSeed or Saban multiplication.
 */
import { verify as verifySignature, createHash } from 'node:crypto';
import { stable } from './worker.mjs';

export const RUSTGIS_MISSION_KEY = 'evercraft-rustgis-geospatial-engine-evaluation-20261013';
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/;
const hashPattern = /^[0-9a-f]{64}$/;
const allowedKeys = new Set([
  'schema','job_id','mission_key','target_node_id','issued_at','expires_at',
  'nonce','operation','dataset','dataset_sha256','expected_binary_sha256','synthetic_only'
]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export class BridgeHold extends Error {
  constructor(code) { super(code); this.code = code; }
}
const demand = (okay, code) => { if (!okay) throw new BridgeHold(code); };

export function reconcileRustgisSabanEvidence({
  assignment, job, permit, trustedIssuerPublicKey, workerReceipt, artifactBytes,
  expectedNodeId, expectedMissionKey = RUSTGIS_MISSION_KEY
} = {}) {
  demand(assignment && typeof assignment === 'object', 'SABAN_ASSIGNMENT_REQUIRED');
  demand(idPattern.test(assignment.agent_id), 'SABAN_AGENT_INVALID');
  demand(assignment.role === 'geospatial_canary_guard', 'SABAN_ROLE_DENIED');
  demand(assignment.work?.key === job?.job_id &&
    assignment.work?.raw?.job_id === job?.job_id, 'SABAN_JOB_BINDING_MISMATCH');
  demand(assignment.idempotency_key === job?.job_id, 'SABAN_IDEMPOTENCY_MISMATCH');
  demand(job && typeof job === 'object' && !Array.isArray(job) &&
    Object.keys(job).every(key => allowedKeys.has(key)) &&
    Object.keys(job).length === allowedKeys.size &&
    job.schema === 'evercraft.rustgis.job.v1', 'JOB_SCHEMA_INVALID');
  demand(idPattern.test(job.job_id) && idPattern.test(job.nonce), 'JOB_IDENTIFIER_INVALID');
  demand(job.mission_key === RUSTGIS_MISSION_KEY &&
    expectedMissionKey === RUSTGIS_MISSION_KEY, 'MISSION_DENIED');
  demand(typeof expectedNodeId === 'string' && expectedNodeId.length > 3 &&
    job.target_node_id === expectedNodeId, 'NODE_MISMATCH');
  demand(job.synthetic_only === true && /^canary_(baseline|narrow|wide)\.geojson$/.test(job.dataset),
    'REAL_DATA_HELD');
  demand(['render','buffer_100m'].includes(job.operation), 'OPERATION_DENIED');
  demand(hashPattern.test(job.dataset_sha256) && hashPattern.test(job.expected_binary_sha256),
    'INPUT_HASH_INVALID');
  const issued = Date.parse(job.issued_at), expires = Date.parse(job.expires_at);
  demand(Number.isFinite(issued) && Number.isFinite(expires) &&
    expires > issued && expires-issued <= 900000, 'JOB_TIME_INVALID');

  demand(permit?.schema === 'evercraft.rustgis.permit.v1' &&
    permit.job_id === job.job_id &&
    typeof permit.signature === 'string' &&
    typeof trustedIssuerPublicKey === 'string' && trustedIssuerPublicKey.includes('PUBLIC KEY'),
    'PERMIT_INVALID');
  let valid = false;
  try {
    valid = verifySignature(null, Buffer.from(stable(job)), trustedIssuerPublicKey,
      Buffer.from(permit.signature, 'base64'));
  } catch { /* untrusted input must fail closed */ }
  demand(valid, 'SIGNATURE_DENIED');

  const r = workerReceipt;
  demand(r?.schema === 'evercraft.rustgis.worker-receipt.v1' &&
    r.state === 'verified' && r.synthetic_only === true &&
    r.evidence_level === 'locally-verified-not-production', 'RECEIPT_NOT_VERIFIED');
  demand(r.job_id === job.job_id && r.mission_key === job.mission_key &&
    r.nonce === job.nonce && r.operation === job.operation, 'RECEIPT_JOB_MISMATCH');
  demand(r.source_sha256 === job.dataset_sha256 &&
    r.binary_sha256 === job.expected_binary_sha256, 'RECEIPT_HASH_MISMATCH');
  demand(Number.isInteger(r.feature_count) && r.feature_count > 0 &&
    r.feature_count <= 1000, 'FEATURE_COUNT_INVALID');
  const observed = Date.parse(r.observed_at_utc);
  demand(Number.isFinite(observed) && observed >= issued-60000 &&
    observed <= expires+120000, 'RECEIPT_TIME_INVALID');

  demand(Array.isArray(r.artifacts) && r.artifacts.length === 1, 'ARTIFACT_COUNT_INVALID');
  const artifact = r.artifacts[0];
  demand(artifact?.file === (job.operation === 'render' ? 'map.png' : 'buffered.rgis'),
    'ARTIFACT_NAME_INVALID');
  demand(Buffer.isBuffer(artifactBytes) && artifactBytes.length > 12 &&
    artifactBytes.length < 10 * 1024 * 1024, 'ARTIFACT_BYTES_INVALID');
  demand(artifact.size === artifactBytes.length && hashPattern.test(artifact.sha256) &&
    hash(artifactBytes) === artifact.sha256, 'ARTIFACT_INTEGRITY_FAILED');
  if (job.operation === 'render') {
    const png = Buffer.from([137,80,78,71,13,10,26,10]);
    demand(artifactBytes.subarray(0,8).equals(png) &&
      artifactBytes.readUInt32BE(16) === 640 && artifactBytes.readUInt32BE(20) === 420,
      'PNG_HEADER_INVALID');
  }

  const evidence = {
    schema: 'evercraft.rustgis.saban-evidence-intake.v1',
    state: 'verified_synthetic_evidence_only',
    mission_key: job.mission_key,
    node_id_claim: job.target_node_id,
    agent_id: assignment.agent_id,
    idempotency_key: assignment.idempotency_key,
    job_id: job.job_id,
    operation: job.operation,
    source_sha256: job.dataset_sha256,
    engine_sha256: job.expected_binary_sha256,
    artifact: { file: artifact.file, size: artifact.size, sha256: artifact.sha256 },
    job_sha256: hash(Buffer.from(stable(job))),
    receipt_sha256: hash(Buffer.from(stable(r))),
    assignment_sha256: hash(Buffer.from(stable(assignment))),
    dispatch_allowed: false,
    machine_attestation_verified: false,
    remote_execution_authorized: false,
    systemia_release_ready: false,
    external_recipient_access_verified: false
  };
  return { ...evidence, evidence_sha256: hash(Buffer.from(stable(evidence))) };
}
