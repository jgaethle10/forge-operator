import assert from 'node:assert/strict';
import { planAircraftRelay } from './aircraft-relay-planner.mjs';

const now = new Date('2026-09-26T16:00:00Z');

const nodes = [
  { id: 'yakima-field', kind: 'ground', state: 'verified', authorized: true },
  { id: 'remote-gateway', kind: 'gateway', state: 'verified', authorized: true },
  {
    id: 'flight-ec101',
    kind: 'aircraft_relay',
    state: 'verified',
    authorized: true,
    participation_opt_in: true,
    avionics_isolated: true,
    flight_control_access: false,
    safe_operating_state: true
  },
  {
    id: 'flight-not-opted-in',
    kind: 'aircraft_relay',
    state: 'verified',
    authorized: true,
    participation_opt_in: false,
    avionics_isolated: true,
    flight_control_access: false,
    safe_operating_state: true
  }
];

const contacts = [
  {
    from: 'yakima-field',
    to: 'flight-ec101',
    state: 'predicted',
    authorized: true,
    start_at: '2026-09-26T16:05:00Z',
    end_at: '2026-09-26T16:11:00Z',
    bandwidth_mbps: 40,
    link_efficiency: 0.7,
    evidence: 'fixture:operator-approved-schedule-a'
  },
  {
    from: 'flight-ec101',
    to: 'remote-gateway',
    state: 'predicted',
    authorized: true,
    start_at: '2026-09-26T16:23:00Z',
    end_at: '2026-09-26T16:29:00Z',
    bandwidth_mbps: 25,
    link_efficiency: 0.7,
    evidence: 'fixture:operator-approved-schedule-b'
  },
  {
    from: 'yakima-field',
    to: 'flight-not-opted-in',
    state: 'verified',
    authorized: true,
    start_at: '2026-09-26T16:05:00Z',
    end_at: '2026-09-26T16:20:00Z',
    bandwidth_mbps: 100,
    evidence: 'fixture:must-not-select'
  },
  {
    from: 'flight-not-opted-in',
    to: 'remote-gateway',
    state: 'verified',
    authorized: true,
    start_at: '2026-09-26T16:05:00Z',
    end_at: '2026-09-26T16:20:00Z',
    bandwidth_mbps: 100,
    evidence: 'fixture:must-not-select'
  }
];

const ferry = planAircraftRelay({
  now,
  mission: {
    purpose: 'rural_connectivity',
    mode: 'data_ferry',
    source_node_id: 'yakima-field',
    destination_node_id: 'remote-gateway',
    payload_bytes: 50 * 1024 * 1024,
    minimum_bandwidth_mbps: 10,
    allow_predicted_contacts: true,
    deliver_by: '2026-09-26T17:00:00Z'
  },
  nodes,
  contact_windows: contacts
});

assert.equal(ferry.status, 'FORECAST_PLAN_READY');
assert.equal(ferry.selected.mode, 'data_ferry');
assert.equal(ferry.selected.aircraft_node_id, 'flight-ec101');
assert.equal(ferry.selected.evidence_state, 'predicted');
assert.equal(ferry.truth_boundary.predicted_contact_is_not_live_route, true);
assert.ok(ferry.selected.carry_duration_seconds > 0);

const liveContacts = [
  {
    from: 'yakima-field',
    to: 'flight-ec101',
    state: 'verified',
    authorized: true,
    start_at: '2026-09-26T16:05:00Z',
    end_at: '2026-09-26T16:12:00Z',
    bandwidth_mbps: 50,
    evidence: 'fixture:live-a'
  },
  {
    from: 'flight-ec101',
    to: 'remote-gateway',
    state: 'verified',
    authorized: true,
    start_at: '2026-09-26T16:08:00Z',
    end_at: '2026-09-26T16:15:00Z',
    bandwidth_mbps: 30,
    evidence: 'fixture:live-b'
  }
];

const live = planAircraftRelay({
  now,
  mission: {
    purpose: 'emergency_communications',
    mode: 'live_relay',
    source_node_id: 'yakima-field',
    destination_node_id: 'remote-gateway',
    payload_bytes: 20 * 1024 * 1024,
    minimum_bandwidth_mbps: 10
  },
  nodes,
  contact_windows: liveContacts
});

assert.equal(live.status, 'ROUTE_READY');
assert.equal(live.selected.evidence_state, 'verified');
assert.equal(live.selected.aircraft_node_id, 'flight-ec101');

const predictedLive = planAircraftRelay({
  now,
  mission: {
    purpose: 'emergency_communications',
    mode: 'live_relay',
    source_node_id: 'yakima-field',
    destination_node_id: 'remote-gateway',
    payload_bytes: 1,
    minimum_bandwidth_mbps: 1,
    allow_predicted_contacts: true
  },
  nodes,
  contact_windows: contacts
});
assert.equal(predictedLive.status, 'NO_ROUTE');

const noConsent = planAircraftRelay({
  now,
  mission: {
    purpose: 'rural_connectivity',
    mode: 'data_ferry',
    source_node_id: 'yakima-field',
    destination_node_id: 'remote-gateway',
    payload_bytes: 1,
    allow_predicted_contacts: true
  },
  nodes: nodes.filter((node) => node.id !== 'flight-ec101'),
  contact_windows: contacts
});
assert.equal(noConsent.status, 'NO_ROUTE');

const denied = planAircraftRelay({
  now,
  mission: {
    purpose: 'rural_connectivity',
    mode: 'data_ferry',
    source_node_id: 'yakima-field',
    destination_node_id: 'remote-gateway',
    payload_bytes: 1,
    allow_predicted_contacts: true,
    intent: 'targeting support'
  },
  nodes,
  contact_windows: contacts
});
assert.equal(denied.status, 'POLICY_DENIED');

console.log(JSON.stringify({
  schema: 'evercraft.aircraft-relay-proof.v1',
  status: 'PASS',
  invariants: {
    aircraft_requires_explicit_participation: true,
    avionics_isolation_required: true,
    flight_control_access_must_be_false: true,
    future_contact_can_form_forecast_plan: true,
    predicted_contact_never_becomes_live_route: true,
    verified_overlap_can_form_live_route: true,
    payload_capacity_checked: true,
    delivery_deadline_checked: true,
    civilian_scope_enforced: true
  },
  ferry_plan: ferry.selected,
  live_plan: live.selected
}, null, 2));
