#!/usr/bin/env node
// Public-safe metadata gate. Validates a pinned REVIEW_HELD snapshot only.
// This DOES NOT verify Drive bytes, Systemia/Yard/Compute authority, or field proof.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const fail = (message) => { throw new Error('REVIEW_GATE_HELD: ' + message); };
const assert = (value, message) => { if (!value) fail(message); };
const exactKeys = (obj, expected, location) => {
  assert(obj !== null && typeof obj === 'object' && !Array.isArray(obj), `${location}: invalid object`);
  const got = Object.keys(obj).sort();
  const required = [...expected].sort();
  assert(got.length === required.length && got.every((key, i) => key === required[i]), `${location}: unexpected or missing field`);
};
const hexSha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export const PINNED_REVIEW_SNAPSHOT = Object.freeze({
  candidate: 'field01b-v3-owned-core-p03-20261013',
  archive_sha256: '5474e311286bf614b1c3f2e8b4821886b2550abe6277e831d50ac26274527426',
  archive_bytes: 202379,
  owned_core_tests: 106,
  yard_ci_tests: 172,
  yard_fixture_steps: 3,
});
const FIELDS = Object.freeze({
  root: ['schema', 'service_id', 'candidate', 'state', 'repository_visibility', 'source_in_public_repo', 'contains_secrets', 'artifact', 'tests', 'authority', 'claims', 'field01b_reachability', 'boundary'],
  artifact: ['sha256', 'bytes', 'custody_note'],
  tests: ['owned_core', 'yard_ci', 'yard_fixture'],
  counts: ['passed', 'total'],
  fixture: ['passed', 'total', 'release_denial', 'deployment_authorized', 'deployed'],
  authority: ['systemia_admission_receipt', 'compute_attestation_receipt', 'yard_deployment_receipt', 'route_verification_receipt', 'rollback_receipt', 'physical_field_test_receipt'],
  claims: ['deployed', 'compute_executed', 'physical_exchange_proven', 'geographic_coverage_proven', 'carrier_service_proven', 'emergency_backhaul_proven', 'public_safety_authority', 'wsf_deployed'],
  reachability: ['any_valid_http_response_means_core_reachable', 'unreachable_requires_transport_failure', 'infrastructure_lan_available_required'],
});
const PUBLIC_BOUNDARY = 'Public metadata consistency only. No proof of authority, physical test, Drive bytes, or live route.';

export function reviewCandidate(record) {
  exactKeys(record, FIELDS.root, 'review record');
  assert(record.schema === 'evercraft.network.field01b.public-review.v1', 'incorrect schema');
  assert(record.service_id === 'evercraft-network-field01b-owned-core', 'incorrect service');
  assert(record.candidate === PINNED_REVIEW_SNAPSHOT.candidate, 'unpinned candidate');
  assert(record.state === 'REVIEW_HELD', 'not review-held');
  assert(record.repository_visibility === 'public_metadata_only' && record.source_in_public_repo === false, 'private Core boundary');
  assert(record.contains_secrets === false, 'contains secrets');
  assert(record.boundary === PUBLIC_BOUNDARY, 'truth boundary changed');

  exactKeys(record.artifact, FIELDS.artifact, 'artifact');
  assert(hexSha256(record.artifact.sha256) && record.artifact.sha256 === PINNED_REVIEW_SNAPSHOT.archive_sha256, 'unpinned artifact digest');
  assert(Number.isSafeInteger(record.artifact.bytes) && record.artifact.bytes === PINNED_REVIEW_SNAPSHOT.archive_bytes, 'unpinned archive bytes');
  assert(record.artifact.custody_note === 'verified_by_owned_drive_readback_not_by_this_gate', 'custody truth boundary');

  exactKeys(record.tests, FIELDS.tests, 'test groups');
  for (const [name, count, fields] of [
    ['owned_core', PINNED_REVIEW_SNAPSHOT.owned_core_tests, FIELDS.counts],
    ['yard_ci', PINNED_REVIEW_SNAPSHOT.yard_ci_tests, FIELDS.counts],
    ['yard_fixture', PINNED_REVIEW_SNAPSHOT.yard_fixture_steps, FIELDS.fixture],
  ]) {
    const group = record.tests[name];
    exactKeys(group, fields, `${name} tests`);
    assert(Number.isSafeInteger(group.passed) && Number.isSafeInteger(group.total) && group.passed === count && group.total === count, `unpinned test result: ${name}`);
  }
  const fixture = record.tests.yard_fixture;
  assert(fixture.release_denial === 'compute_attestation_required' && fixture.deployment_authorized === false && fixture.deployed === false, 'fixture authorization boundary');

  exactKeys(record.authority, FIELDS.authority, 'authority');
  for (const field of FIELDS.authority) assert(record.authority[field] === null, `unsupported receipt: ${field}`);
  exactKeys(record.claims, FIELDS.claims, 'claims');
  for (const field of FIELDS.claims) assert(record.claims[field] === false, `unsupported claim: ${field}`);
  exactKeys(record.field01b_reachability, FIELDS.reachability, 'reachability');
  for (const field of FIELDS.reachability) assert(record.field01b_reachability[field] === true, `false reachability claim: ${field}`);

  return {
    schema: 'evercraft.network.field01b.review-gate-result.v2',
    candidate: PINNED_REVIEW_SNAPSHOT.candidate,
    record_matches_pinned_snapshot: true,
    custody_independently_verified: false,
    admitted_by_systemia: false,
    deployment_verified: false,
    physical_proof_verified: false,
    status: 'REVIEW_HELD',
    next_gate: 'independent_Systemia_admission_and_attested_Compute_authority',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert(process.argv.length === 3, 'usage: node review-gate.mjs <review-record.json>');
    console.log(JSON.stringify(reviewCandidate(JSON.parse(readFileSync(process.argv[2], 'utf8'))), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
