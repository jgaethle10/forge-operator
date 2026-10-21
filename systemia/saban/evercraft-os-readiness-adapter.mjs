import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { validateProgram } from '../evercraft-os/parallel-program.mjs';

const PROGRAM = 'systemia/evercraft-os/parallel-program.json';

function within(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
}
function sha256(bytes) {
  return 'sha256:' + createHash('sha256').update(bytes).digest('hex');
}
function readProgram(rootDir) {
  const bytes = readFileSync(resolve(rootDir, PROGRAM));
  return { program: JSON.parse(bytes), program_sha256: sha256(bytes) };
}
function inspectAnchor(rootDir, anchor) {
  const root = realpathSync(rootDir);
  const wanted = resolve(root, anchor);
  if (!within(root, wanted)) throw new Error('anchor_outside_repository');
  if (!existsSync(wanted)) return { anchor, state: 'missing', sha256: null };
  const resolved = realpathSync(wanted);
  if (!within(root, resolved)) throw new Error('anchor_symlink_escape');
  const stat = lstatSync(wanted);
  if (stat.isSymbolicLink()) throw new Error('anchor_symlink_disallowed');
  if (stat.isDirectory()) return { anchor, state: 'directory_present', sha256: null };
  if (!stat.isFile()) throw new Error('unsupported_anchor_type');
  return { anchor, state: 'file_present', sha256: sha256(readFileSync(wanted)) };
}

/**
 * Read-only Saban adapter. The local scheduler may execute 12 logical
 * assignments concurrently, but this is NOT Systemia mission admission,
 * permission to start product work, a real NodeSeed worker, or runtime proof.
 */
export async function runAssignment({ assignment, rootDir = process.cwd() }) {
  if (assignment?.role !== 'source_readiness_auditor' ||
      assignment?.work?.kind !== 'os_readiness_lane' ||
      typeof assignment?.work?.key !== 'string') {
    throw new Error('unapproved_os_readiness_assignment');
  }
  const { program, program_sha256 } = readProgram(rootDir);
  // Do not let an arbitrary assignment change the authoritative program.
  if (program.state !== 'proposal_not_admitted' ||
      program.execution_authority_granted !== false ||
      program.public_deployment_authorized !== false ||
      program.budget_commitment_authorized !== false ||
      program.mission_authority !== 'systemia') {
    throw new Error('program_authority_not_read_only');
  }
  if (!Array.isArray(program.lanes) || program.lanes.length !== 12 ||
      new Set(program.lanes.map(x => x.id)).size !== 12) {
    throw new Error('program_lane_contract_invalid');
  }
  const lane = program.lanes.find(x => x.id === assignment.work.key);
  if (!lane) throw new Error('unknown_os_lane');
  const anchors = lane.source_anchors.map(path => inspectAnchor(rootDir, path));
  const missing = anchors.filter(x => x.state === 'missing');
  return {
    schema: 'evercraft.os.readiness-assignment.v1',
    role: assignment.role,
    lane_id: lane.id,
    program_sha256,
    state: missing.length ? 'held_missing_source' : 'source_anchors_found',
    anchors,
    source_ready: missing.length === 0,
    runtime_observed: false,
    systemia_admitted: false,
    execution_authority_granted: false,
    payment_received: false,
    customer_delivered: false,
    status: missing.length ? 'held' : 'source_preflight_only'
  };
}

export async function reconcile({ results, rootDir = process.cwd() }) {
  const { program, program_sha256 } = readProgram(rootDir);
  // Reuse central manifest validator, independent of assignment payloads.
  validateProgram(program, { registry: { software: [] } });
  const expected = new Set(program.lanes.map(x => x.id));
  const counts = new Map();
  const findings = [];
  for (const row of results || []) {
    if (!row || row.schema !== 'evercraft.os.readiness-assignment.v1') {
      findings.push('invalid_result_schema'); continue;
    }
    counts.set(row.lane_id, (counts.get(row.lane_id) || 0) + 1);
    if (!expected.has(row.lane_id)) findings.push('unknown_lane:' + row.lane_id);
    if (row.program_sha256 !== program_sha256) findings.push('program_changed:' + row.lane_id);
    if (row.source_ready !== true || row.state !== 'source_anchors_found') {
      findings.push('lane_held:' + row.lane_id);
    }
    if (row.runtime_observed !== false || row.systemia_admitted !== false ||
        row.execution_authority_granted !== false || row.payment_received !== false ||
        row.customer_delivered !== false) findings.push('false_runtime_claim:' + row.lane_id);
  }
  for (const lane of expected) {
    if (counts.get(lane) !== 1) findings.push('coverage_or_duplicate:' + lane);
  }
  return {
    status: findings.length ? 'held' : 'reconciled',
    schema: 'evercraft.os.readiness-reconciliation.v1',
    program_sha256,
    expected_lanes: expected.size,
    returned_lanes: (results || []).length,
    findings,
    source_integrity_preserved: findings.length === 0,
    systemia_mission_admitted: false,
    real_nodes_invoked: false,
    deployment_proven: false,
    commercial_outcome_proven: false
  };
}
