import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEventFeasibility, eventWorkPackages, EVENT_SCENARIOS, assessEventFromDemandQueue } from './event-coordination.mjs';

const caseId = 'synthetic:heritage-event-001';
const assess = options => assessEventFeasibility({ opportunity_id: caseId, ...options });

test('unconfirmed heritage event starts with every external action denied', () => {
  const result = assess();
  assert.equal(result.stage, 'discovery_incomplete');
  assert.equal(result.scenario, 'outdoor_separate');
  assert.equal(result.checks.length, 14);
  assert.equal(result.next_work.length, 14);
  assert.equal(result.event_approved, false);
  assert.equal(result.ticket_sales_authorized, false);
  assert.equal(result.charitable_collection_authorized, false);
  assert.equal(result.performance_or_testing_authorized, false);
  assert.equal(result.external_contact_authorized, false);
});

test('each event format has specific independent evidence requirements', () => {
  const indoor = assess({ scenario: 'indoor_headphone' }).checks.map(x => x.id);
  const outdoor = assess({ scenario: 'outdoor_separate' }).checks.map(x => x.id);
  const filmed = assess({ scenario: 'heritage_only' }).checks.map(x => x.id);
  assert(indoor.includes('headphone_comms') && indoor.includes('crowd_loads'));
  assert(!outdoor.includes('headphone_comms') && outdoor.includes('outdoor_transmission'));
  assert(filmed.includes('filming_and_exhibits') && !filmed.includes('outdoor_ground_and_wind'));
  assert.equal(Object.keys(EVENT_SCENARIOS).length, 3);
});

test('one source reference without observation is not evidence', () => {
  const result = assess({ evidence: { structural_review: { source_ref: 'ref:dummy' } } });
  assert.equal(result.checks.find(g => g.id === 'structural_review').status, 'missing');
});

test('even a dossier full of claimed approval never grants permission or authorizes sales', () => {
  const baseline = assess();
  const evidence = Object.fromEntries(baseline.checks.map(g => [g.id, {
    source_ref: 'private-ledger:synthetic-' + g.id,
    observed_at: '2026-11-23T12:00:00Z',
    finding: 'approved',
    trusted: true,
  }]));
  const result = assess({ evidence });
  assert.equal(result.stage, 'dossier_ready_for_independent_review');
  assert.equal(result.next_work.length, 0);
  assert.equal(result.event_approved, false);
  assert.equal(result.ticket_sales_authorized, false);
  assert.equal(result.external_contact_authorized, false);
  assert(result.checks.every(g => g.status === 'submitted_unverified'));
});

test('reported unsafe structural condition generates stop-and-review work', () => {
  const result = assess({ evidence: { structural_review: {
    source_ref: 'private-ledger:synthetic',
    observed_at: '2026-11-23T12:00:00Z',
    finding: 'unsafe',
  } } });
  assert.equal(result.stage, 'hold_pending_qualified_review');
  const task = result.next_work.find(x => x.requirement === 'structural_review');
  assert.equal(task.priority, 'stop_and_review');
});

test('flames and other exceptional effects are explicit separate gates, never assumed', () => {
  const result = assess({ scenario: 'heritage_only', features: [
    'open_flame', 'historic_structure_rigging', 'drones', 'aerial_laser', 'open_flame',
  ] });
  assert.equal(result.checks.filter(g => g.id === 'open_flame').length, 1);
  for (const id of ['open_flame', 'historic_structure_rigging', 'drones', 'aerial_laser']) {
    assert(result.next_work.find(x => x.requirement === id));
  }
  assert.equal(result.event_approved, false);
});

test('work packets are stable, role-specific and cannot automatically assign or dispatch', () => {
  const result = assess();
  const first = eventWorkPackages(result);
  assert.deepEqual(first, eventWorkPackages(result));
  assert.equal(new Set(first.map(p => p.work_package_key)).size, first.length);
  assert(first.some(p => p.responsibility === 'qualified acoustical consultant'));
  assert(first.every(p => p.authorized_to_dispatch === false && p.assignment_state === 'unassigned'));
});

test('invalid variants and features fail closed', () => {
  assert.throws(() => assessEventFeasibility(), /opportunity_id_required/);
  assert.throws(() => assess({ scenario: 'giant_rave' }), /scenario_not_supported/);
  assert.throws(() => assess({ features: ['pyro_auto_approved'] }), /features_invalid/);
  assert.throws(() => assess({ evidence: [] }), /evidence_object_required/);
});

test('Demand Desk queue adapter preserves source stage without granting event approvals', () => {
  const queue = {
    schema: 1, kind: 'evercraft.demand-desk.queue', revision: 7,
    opportunities: [{ id: caseId, status: 'Replied', verified: true }],
  };
  const result = assessEventFromDemandQueue(queue, caseId, { scenario: 'heritage_only' });
  assert.equal(result.demand_queue_revision, 7);
  assert.equal(result.demand_stage_observed, 'Replied');
  assert.equal(result.demand_verified_claim, true);
  assert.equal(result.event_approved, false);
  assert.equal(result.external_contact_authorized, false);
});

test('Demand Desk adapter rejects absent/duplicate/closed or malformed queue entries', () => {
  const queue = {
    schema: 1, kind: 'evercraft.demand-desk.queue', revision: 1,
    opportunities: [{ id: caseId, status: 'Qualified' }],
  };
  assert.throws(() => assessEventFromDemandQueue({}, caseId), /demand_queue_contract_invalid/);
  assert.throws(() => assessEventFromDemandQueue(queue, 'missing'), /demand_opportunity_missing_or_duplicate/);
  assert.throws(() => assessEventFromDemandQueue({
    ...queue, opportunities: [...queue.opportunities, ...queue.opportunities]
  }, caseId), /demand_opportunity_missing_or_duplicate/);
  assert.throws(() => assessEventFromDemandQueue({
    ...queue, opportunities: [{ id: caseId, status: 'Closed' }]
  }, caseId), /demand_opportunity_not_open/);
});

test('hybrid silent zone gates outdoor stage and indoor headphone crowd separately', () => {
  const result = assess({ scenario: 'hybrid_silent_zone' });
  const byId = new Map(result.checks.map(check => [check.id,check]));
  for (const id of [
    'outdoor_ground_and_wind','outdoor_transmission','silent_zone_footprint',
    'headphone_comms','silent_zone_vibration','artifact_protection',
    'visual_effects_review',
  ]) assert(byId.has(id), 'missing hybrid gate: '+id);
  assert.equal(result.checks.length, 19);
  assert.equal(result.event_approved, false);
  assert.equal(result.performance_or_testing_authorized, false);
  assert.equal(result.ticket_sales_authorized, false);
  assert.equal(result.external_contact_authorized, false);
  assert(result.next_work.some(w => w.requirement === 'silent_zone_vibration'));
});

test('claiming a dome soundproof or a silent disco safe does not bypass professional reviews', () => {
  const baseline = assess({ scenario: 'hybrid_silent_zone' });
  const evidence = Object.fromEntries(baseline.checks.map(check => [check.id, {
    source_ref: 'synthetic:' + check.id, observed_at: '2026-11-23T21:00:00-08:00',
    finding: 'approved', soundproof: true, safe: true,
  }]));
  const result = assess({ scenario: 'hybrid_silent_zone', evidence });
  assert.equal(result.stage, 'dossier_ready_for_independent_review');
  assert.equal(result.event_approved, false);
  assert.equal(result.charitable_collection_authorized, false);
  assert(result.checks.every(check => check.status === 'submitted_unverified'));
});

test('hybrid unsafe crowd findings trigger stop instead of permission', () => {
  const result=assess({scenario:'hybrid_silent_zone', evidence:{
    silent_zone_vibration: { finding: 'unsafe', source_ref: 'synthetic:structural',
      observed_at:'2026-11-23T21:00:00-08:00' }
  }});
  assert.equal(result.stage,'hold_pending_qualified_review');
  assert(result.next_work.some(work => work.requirement==='silent_zone_vibration' && work.priority==='stop_and_review'));
});

test('freestanding visual dome creates an additional gate only when selected', () => {
  const plain = assess({ scenario: 'hybrid_silent_zone' });
  const dome = assess({ scenario: 'hybrid_silent_zone', features: ['freestanding_visual_dome'] });
  assert.equal(plain.checks.some(x => x.id === 'freestanding_visual_dome'), false);
  assert.equal(dome.checks.length, plain.checks.length + 1);
  assert.equal(dome.checks.some(x => x.id === 'freestanding_visual_dome'), true);
  assert.equal(dome.event_approved, false);
});
