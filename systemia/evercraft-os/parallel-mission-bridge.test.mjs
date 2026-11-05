import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preflightOsMission } from './parallel-mission-bridge.mjs';

const program = JSON.parse(readFileSync('systemia/evercraft-os/parallel-program.json', 'utf8'));

test('Systemia evaluates twelve independent bounded Saban lanes with no execution authority', () => {
  const result = preflightOsMission({
    program,
    now: new Date('2026-10-21T23:00:00.000Z')
  });
  assert.equal(result.schema, 'evercraft.os.systemia-readiness-policy.v1');
  assert.equal(result.state, 'systemia_policy_plan_admitted');
  assert.equal(result.lane_count, 12);
  assert.equal(result.route_count, 12);
  assert.equal(result.mission_key, program.mission_key);
  assert.ok(result.policy_receipt_hash?.length > 0);
  assert.equal(result.systemia_policy_evaluated, true);
  assert.equal(result.durable_systemia_mission_recorded, false);
  assert.equal(result.actual_workers_dispatched_by_policy, 0);
  assert.equal(result.live_node_permissions_granted, false);
  assert.equal(result.payments_authorized, false);
  assert.equal(result.release_authorized, false);
  assert.deepEqual(
    new Set(result.routes.map(x => x.work_key)),
    new Set(program.lanes.map(x => 'os-source-' + x.id))
  );
  assert.ok(result.routes.every(x =>
    x.execution_component === 'saban' &&
    x.software_id === 'evercraft-os-readiness' &&
    x.scale_admitted === true &&
    x.hold === null &&
    x.execution_authority_granted === false
  ));
});

test('Systemia bridge holds mutated program authority and unauthorized software', () => {
  const changed = structuredClone(program);
  changed.execution_authority_granted = true;
  assert.throws(() => preflightOsMission({ program: changed }), /not_read_only/);
  const deploy = structuredClone(program);
  deploy.public_deployment_authorized = true;
  assert.throws(() => preflightOsMission({ program: deploy }), /not_read_only/);
  assert.throws(() => preflightOsMission({ program, softwareId: 'chum' }), /unapproved_saban_software/);
  const duplicate = structuredClone(program);
  duplicate.lanes[1].id = duplicate.lanes[0].id;
  assert.throws(() => preflightOsMission({ program: duplicate }), /twelve_unique_lanes/);
  const truncated = structuredClone(program);
  truncated.lanes.pop();
  assert.throws(() => preflightOsMission({ program: truncated }), /twelve_unique_lanes/);
});
