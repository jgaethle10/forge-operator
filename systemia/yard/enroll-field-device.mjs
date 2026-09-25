#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { YardOperator } from './operator.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const stateDir = arg('--state-dir');
const evidenceFile = arg('--evidence');
if (!stateDir || !evidenceFile) {
  console.error('usage: enroll-field-device.mjs --state-dir /private/yard --evidence /private/field-evidence-candidate.json');
  process.exit(2);
}

const candidate = JSON.parse(fs.readFileSync(path.resolve(evidenceFile), 'utf8'));
if (candidate.schema !== 'evercraft.node001.field-evidence-candidate.v1') {
  console.error('field evidence candidate schema invalid');
  process.exit(3);
}
if (candidate.ready_for_yard_enrollment !== true) {
  console.error('field evidence candidate is not ready for Yard enrollment');
  process.exit(4);
}
if (!candidate.evidence?.device_fingerprint || !candidate.evidence?.node_id) {
  console.error('field evidence candidate is missing device identity');
  process.exit(5);
}

const yard = new YardOperator({ stateDir: path.resolve(stateDir) });
const enrollment = yard.enrollFieldDevice({
  deviceFingerprint: candidate.evidence.device_fingerprint,
  nodeId: candidate.evidence.node_id,
  evidence: candidate.evidence,
});

console.log(JSON.stringify({
  schema: enrollment.schema,
  status: enrollment.status,
  node_id: enrollment.node_id,
  device_fingerprint: enrollment.device_fingerprint,
  field_evidence_receipt: enrollment.field_evidence_receipt,
  runtime_release_ref: enrollment.runtime_release_ref,
  runtime_payload_digest: enrollment.runtime_payload_digest,
  receipt_hash: enrollment.receipt_hash,
  enrolled_at: enrollment.enrolled_at,
}, null, 2));
