/** Fail-closed Saban proof: independent OS lanes are proposals, not active workers. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessProgram, validateProgram } from '../evercraft-os/parallel-program.mjs';

const program = JSON.parse(readFileSync(new URL('../evercraft-os/parallel-program.json', import.meta.url)));
const registry = JSON.parse(readFileSync(new URL('./multiplication-registry.json', import.meta.url)));
assert.equal(validateProgram(program, { registry }), true);
const report = assessProgram(program, { registry });
assert.equal(report.lane_count, 12);
assert.equal(report.parallel_readiness_wave.length, 12);
assert.equal(report.outcome, 'source_preflight_only');
assert.equal(report.source_ready_count, 12);
assert.equal(report.actual_saban_workers_launched, 0);
assert.equal(report.execution_authority_granted, false);
assert.equal(report.payments_collected, false);
assert.ok(report.lanes.every(x => !x.live_execution_observed && !x.completion_receipted));
assert.ok(report.lanes.some(x => x.lane_id === 'developer_platform' && x.saban_software_registered));
assert.ok(report.lanes.some(x => x.lane_id === 'device_fleet' && !x.saban_software_registered));

const duplicate = structuredClone(program);
duplicate.lanes[1].id = duplicate.lanes[0].id;
assert.throws(() => validateProgram(duplicate, { registry }), /duplicate/);
const unauthorized = structuredClone(program);
unauthorized.execution_authority_granted = true;
assert.throws(() => validateProgram(unauthorized, { registry }), /unauthorized_flag/);
const phantom = structuredClone(program);
phantom.lanes[0].saban_registered_software = 'fictional_unregistered_swarm';
assert.throws(() => validateProgram(phantom, { registry }), /unregistered_saban_software/);
const sourceGap = assessProgram(program, { registry, sourceExists: path => !path.endsWith('/systemia/evercraft-os/runtime.mjs') });
assert.equal(sourceGap.outcome, 'held_source_gaps');
assert.equal(sourceGap.source_ready_count, 11);
console.log(JSON.stringify({
  proof: 'evercraft.os.parallel-lane-readiness.v1',
  status: 'PASS',
  lanes: 12,
  source_anchors: report.source_ready_count,
  saban_workers_launched: 0,
  systemia_admission: false,
  external_side_effects: false
}, null, 2));
