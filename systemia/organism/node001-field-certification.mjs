import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

const STEP_ORDER = [
  'field_kit_ready',
  'preflight_passed',
  'nodeseed_installed',
  'reboot_persistence_verified',
  'offline_operation_verified',
  'telemetry_verified',
  'field_evidence_candidate_ready',
  'yard_enrollment_verified',
  'live_identity_attested',
  'kaidance_deployed',
  'kaidance_field_pulse_verified',
  'continuity_receipt_verified',
];

const STEP_LABELS = {
  field_kit_ready: 'Use the merged Node 001 field kit.',
  preflight_passed: 'Run Node 001 preflight on the physical candidate.',
  nodeseed_installed: 'Install and enable Evercraft NodeSeed.',
  reboot_persistence_verified: 'Reboot the machine and prove service persistence.',
  offline_operation_verified: 'Run the deliberate offline-operation receipt check.',
  telemetry_verified: 'Verify NodeSeed telemetry after reboot/offline testing.',
  field_evidence_candidate_ready: 'Generate the field evidence candidate.',
  yard_enrollment_verified: 'Ingest and validate the candidate in Yard.',
  live_identity_attested: 'Challenge the live NodeSeed identity from Yard.',
  kaidance_deployed: 'Deploy KAIDANCE to the enrolled field node.',
  kaidance_field_pulse_verified: 'Require KAIDANCE pulse field attestation = verified.',
  continuity_receipt_verified: 'Capture rollback/continuity receipt on the field deployment.',
};

function readJson(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function receiptRef(value) {
  if (!value) return null;
  const ref = String(value);
  return ref.startsWith('sha256:') ? ref : null;
}

function evidenceCandidateReady(candidate) {
  return candidate?.schema === 'evercraft.node001.field-evidence-candidate.v1' &&
    candidate.ready_for_yard_enrollment === true &&
    candidate.evidence?.host_type === 'physical' &&
    candidate.evidence?.reboot_persistence_verified === true &&
    Boolean(receiptRef(candidate.evidence?.reboot_receipt_ref)) &&
    candidate.evidence?.offline_operation_verified === true &&
    Boolean(receiptRef(candidate.evidence?.offline_receipt_ref)) &&
    candidate.evidence?.telemetry_verified === true &&
    Boolean(receiptRef(candidate.evidence?.telemetry_receipt_ref)) &&
    Boolean(candidate.evidence?.device_fingerprint) &&
    Boolean(candidate.evidence?.node_id);
}

export function evaluateNode001FieldMission({
  candidateKey = 'megatron-node001-candidate',
  issueRef = 'github:issue:175',
  fieldKitMerged = true,
  preflight = null,
  installReceipt = null,
  offlineReceipt = null,
  evidenceCandidate = null,
  enrollment = null,
  liveAttestation = null,
  kaidanceDeployment = null,
  kaidancePulse = null,
  continuityReceipt = null,
  now = new Date(),
  proofMode = false,
} = {}) {
  const steps = {
    field_kit_ready: Boolean(fieldKitMerged),
    preflight_passed:
      preflight?.schema === 'evercraft.node001.preflight.v1' &&
      preflight.passed === true,
    nodeseed_installed:
      installReceipt?.schema === 'evercraft.node001.install-receipt.v1' &&
      Boolean(installReceipt.node_id),
    reboot_persistence_verified:
      evidenceCandidate?.evidence?.reboot_persistence_verified === true &&
      Boolean(receiptRef(evidenceCandidate?.evidence?.reboot_receipt_ref)),
    offline_operation_verified:
      offlineReceipt?.schema === 'evercraft.node001.offline-receipt.v1' &&
      offlineReceipt.verified === true &&
      Boolean(receiptRef(offlineReceipt.receipt_hash)),
    telemetry_verified:
      evidenceCandidate?.evidence?.telemetry_verified === true &&
      Boolean(receiptRef(evidenceCandidate?.evidence?.telemetry_receipt_ref)),
    field_evidence_candidate_ready: evidenceCandidateReady(evidenceCandidate),
    yard_enrollment_verified:
      enrollment?.schema === 'evercraft.yard.field-enrollment.v1' &&
      enrollment.status === 'verified' &&
      Boolean(receiptRef(enrollment.receipt_hash)),
    live_identity_attested:
      liveAttestation?.schema === 'evercraft.yard.field-attestation.v1' &&
      liveAttestation.identity_verified === true &&
      liveAttestation.field_verified === true &&
      Boolean(receiptRef(liveAttestation.receipt_hash)),
    kaidance_deployed:
      kaidanceDeployment?.schema === 'evercraft.yard.deployment-receipt.v1' &&
      kaidanceDeployment.workload_class === 'systemia.kaidance-collider.v1' &&
      Boolean(receiptRef(kaidanceDeployment.receipt_hash)),
    kaidance_field_pulse_verified:
      kaidancePulse?.schema === 'evercraft.kaidance.pulse.v1' &&
      kaidancePulse.state === 'healthy' &&
      kaidancePulse.field_attestation?.state === 'verified' &&
      Boolean(receiptRef(kaidancePulse.field_attestation?.receipt)),
    continuity_receipt_verified:
      continuityReceipt?.schema === 'evercraft.yard.continuity-supervisor-result.v1' &&
      ['healthy', 'rebound'].includes(continuityReceipt.action) &&
      Boolean(receiptRef(continuityReceipt.receipt_hash)),
  };

  const completedSteps = STEP_ORDER.filter((step) => steps[step]);
  const nextStep = STEP_ORDER.find((step) => !steps[step]) || null;
  const complete = !nextStep;

  const evidenceRefs = [
    issueRef,
    receiptRef(offlineReceipt?.receipt_hash),
    receiptRef(evidenceCandidate?.evidence?.reboot_receipt_ref),
    receiptRef(evidenceCandidate?.evidence?.offline_receipt_ref),
    receiptRef(evidenceCandidate?.evidence?.telemetry_receipt_ref),
    receiptRef(enrollment?.receipt_hash),
    receiptRef(liveAttestation?.receipt_hash),
    receiptRef(kaidanceDeployment?.receipt_hash),
    receiptRef(kaidancePulse?.field_attestation?.receipt),
    receiptRef(continuityReceipt?.receipt_hash),
  ].filter(Boolean);

  const physicalGate = [
    'preflight_passed',
    'nodeseed_installed',
    'reboot_persistence_verified',
    'offline_operation_verified',
    'telemetry_verified',
    'field_evidence_candidate_ready',
  ].includes(nextStep);

  const state = {
    schema: 'evercraft.node001.field-mission-state.v1',
    candidate_key: candidateKey,
    issue_ref: issueRef,
    status: complete ? 'complete' : physicalGate ? 'waiting_on_field_evidence' : 'ready_for_systemia',
    completed_steps: completedSteps,
    next_step: nextStep,
    next_action: complete ? 'Field certification complete.' : STEP_LABELS[nextStep],
    human_field_action_required: Boolean(physicalGate),
    progress: {
      completed: completedSteps.length,
      total: STEP_ORDER.length,
      percent: Math.round((completedSteps.length / STEP_ORDER.length) * 100),
    },
    proof_mode: Boolean(proofMode),
    observed_at: now.toISOString(),
    evidence_refs: evidenceRefs,
  };

  const snapshot = {
    schema: 'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref: `node001-field:${candidateKey}:${sha(state)}`,
    observed_at: state.observed_at,
    counts: {
      scanned: 1,
      changed: complete ? 0 : 1,
      admitted: complete || physicalGate ? 0 : 1,
      held: physicalGate ? 1 : 0,
    },
    evidence_refs: [
      ...evidenceRefs,
      `mission-state:sha256:${sha(state)}`,
    ],
  };

  return {
    mission: state,
    mission_snapshot: snapshot,
  };
}

export function evaluateNode001FieldMissionFromDirectory({
  dir,
  candidateKey,
  issueRef,
  fieldKitMerged = true,
  now = new Date(),
} = {}) {
  const root = path.resolve(dir);
  return evaluateNode001FieldMission({
    candidateKey,
    issueRef,
    fieldKitMerged,
    preflight: readJson(path.join(root, 'node001-preflight.json')),
    installReceipt: readJson(path.join(root, 'install-receipt.json')),
    offlineReceipt: readJson(path.join(root, 'offline-receipt.json')),
    evidenceCandidate: readJson(path.join(root, 'field-evidence-candidate.json')),
    enrollment: readJson(path.join(root, 'yard-field-enrollment.json')),
    liveAttestation: readJson(path.join(root, 'yard-field-attestation.json')),
    kaidanceDeployment: readJson(path.join(root, 'kaidance-deployment-receipt.json')),
    kaidancePulse: readJson(path.join(root, 'kaidance-pulse.json')),
    continuityReceipt: readJson(path.join(root, 'kaidance-continuity-receipt.json')),
    now,
  });
}
