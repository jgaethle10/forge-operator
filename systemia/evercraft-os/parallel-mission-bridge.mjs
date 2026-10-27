import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { admitMission, assertControlPlane } from '../control-plane/control-plane.mjs';

const PROGRAM_PATH = 'systemia/evercraft-os/parallel-program.json';

/**
 * Reuses the actual Systemia policy evaluator for all 12 read-only Saban
 * source lanes. This function is stateless: a successful receipt proves a
 * policy/route decision only, not durable mission admission, worker dispatch,
 * a Passport grant, or permission to change a physical device.
 */
export function preflightOsMission({
  program = null,
  rootDir = process.cwd(),
  softwareId = 'evercraft-os-readiness',
  now = new Date()
} = {}) {
  const rawProgram = program == null
    ? readFileSync(resolve(rootDir, PROGRAM_PATH))
    : Buffer.from(JSON.stringify(program));
  const source = JSON.parse(rawProgram.toString('utf8'));
  const programSha256 = 'sha256:' + createHash('sha256').update(rawProgram).digest('hex');
  if (source.schema !== 'evercraft.os.parallel-program.v1' ||
      source.mode !== 'read_only_preflight' ||
      source.state !== 'proposal_not_admitted' ||
      source.execution_authority_granted !== false ||
      source.public_deployment_authorized !== false ||
      source.budget_commitment_authorized !== false) {
    throw new Error('os_mission_program_not_read_only');
  }
  const lanes = source.lanes;
  if (!Array.isArray(lanes) || lanes.length !== 12 ||
      new Set(lanes.map(x => x.id)).size !== 12) {
    throw new Error('os_mission_expected_twelve_unique_lanes');
  }
  if (softwareId !== 'evercraft-os-readiness') {
    throw new Error('os_mission_unapproved_saban_software');
  }
  const tasks = lanes.map(lane => ({
    work_key: 'os-source-' + lane.id,
    title: 'Review Evercraft OS source readiness: ' + lane.id,
    work_type: 'qa',
    software_id: softwareId,
    parallel: true,
    logical_agents: 1,
    metered: false,
    human_gate_required: false,
    execution_gate_required: false,
    assigned_agents: [],
    authorization_refs: [],
    dependency_keys: []
  }));
  const plan = admitMission({
    rootDir,
    now,
    request: {
      mission_key: source.mission_key,
      objective: 'Validate all twelve Evercraft OS completion lanes via bounded source audits',
      success_condition: 'Independent evidence confirms source anchors for all twelve lanes; no runtime, permission or commercial claims',
      tasks
    }
  });
  assertControlPlane(plan);
  const decisions = plan.dispatch;
  const valid = plan.receipt.admitted === true && decisions.length === lanes.length &&
    plan.receipt.held_count === 0 && plan.receipt.execution_authority_granted === false &&
    decisions.every((decision, index) =>
      decision.work_key === tasks[index].work_key &&
      decision.software_id === softwareId &&
      decision.execution_component === 'saban' &&
      decision.scale_admitted === true &&
      decision.hold === null &&
      decision.human_gate_required === false &&
      decision.execution_authority_granted === false &&
      decision.route_selection_grants_execution_authority === false &&
      decision.pre_dispatch_gate === null &&
      decision.metered === false);
  if (!valid) throw new Error('os_mission_systemia_route_not_read_only_admitted');
  return {
    schema: 'evercraft.os.systemia-readiness-policy.v1',
    mission_key: source.mission_key,
    program_sha256: programSha256,
    state: 'systemia_policy_plan_admitted',
    policy_receipt_hash: plan.receipt.receipt_hash,
    lane_count: decisions.length,
    route_count: decisions.filter(d => d.execution_component === 'saban').length,
    routes: decisions.map(d => ({
      work_key: d.work_key,
      execution_component: d.execution_component,
      software_id: d.software_id,
      scale_admitted: d.scale_admitted,
      hold: d.hold,
      execution_authority_granted: d.execution_authority_granted
    })),
    systemia_policy_evaluated: true,
    durable_systemia_mission_recorded: false,
    actual_workers_dispatched_by_policy: 0,
    live_node_permissions_granted: false,
    payments_authorized: false,
    release_authorized: false
  };
}
