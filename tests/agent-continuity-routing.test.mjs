import test from 'node:test';
import assert from 'node:assert/strict';
import { routeTask } from '../systemia/control-plane/control-plane.mjs';

test('commissioned specialist route retains Systemia authority and declares Juniper/Sentinel mandatory', () => {
  const route = routeTask({
    work_key: 'team-review',
    work_type: 'research',
    assigned_agents: ['Forge', 'Raven'],
  });
  assert.equal(route.agent_continuity_preflight_required, true);
  assert.equal(route.agent_continuity_verified_at_route_selection, false);
  assert.equal(route.execution_gate_required, true);
  assert.equal(route.execution_authority_granted, false);
  assert.equal(route.hold, null);
  for (const requirement of [
    'evercraft-commissioned-role-registry',
    'evercraft-juniper-memory-preflight',
    'evercraft-sentinel-protective-preflight',
    'independently-verified-agent-dispatch-receipt',
    'evercraft-execution-gate',
  ]) assert.ok(route.pre_dispatch_requirements.includes(requirement));
});
test('embedded DNA is never a commissioned dispatch target', () => {
  for (const agent of ['Sentinel', 'Juniper']) {
    const route = routeTask({
      work_key: 'invalid-agent-route', work_type: 'research',
      assigned_agents: ['Forge', agent],
    });
    assert.equal(route.hold, 'embedded_dna_cannot_be_dispatched_as_agent');
    assert.equal(route.dna_protocols_are_dispatch_targets, false);
    assert.equal(route.execution_authority_granted, false);
  }
});
test('unassigned ordinary tasks do not fabricate team runtime or memory preflight', () => {
  const route = routeTask({ work_key: 'read-only', work_type: 'research' });
  assert.equal(route.agent_continuity_preflight_required, false);
  assert.equal(route.agent_continuity_verified_at_route_selection, false);
  assert.equal(route.pre_dispatch_requirements.includes('evercraft-juniper-memory-preflight'), false);
  assert.equal(route.execution_authority_granted, false);
});
