import assert from 'node:assert/strict';
import { emptyContextState } from '../worldstate/observation-fabric.mjs';
import { ingestMachineObservation } from './machine-context.mjs';

const now = '2026-10-01T06:00:00.000Z';

const first = ingestMachineObservation(emptyContextState(), {
  source_access: 'public',
  source_family: 'state-business-registry',
  observed_at: now,
  signal_type: 'company_registration',
  target_entity: 'example-growth-co',
  evidence_state: 'verified',
  provenance_ref: 'registry:123'
});

assert.equal(first.decision.action, 'propagate');
assert.ok(first.decision.consumers.includes('systemia_world_model'));
assert.ok(first.decision.consumers.includes('opportunity_fabric'));
assert.ok(first.decision.consumers.includes('saban'));
assert.equal(first.state.observations[first.decision.observation_id].metadata.autonomous_contact, false);

const second = ingestMachineObservation(first.state, {
  source_access: 'public',
  source_family: 'state-business-registry',
  observed_at: now,
  signal_type: 'company_registration',
  target_entity: 'example-growth-co',
  evidence_state: 'verified',
  provenance_ref: 'registry:123'
});

assert.equal(second.decision.action, 'deduped');
assert.equal(second.decision.duplicate, true);

const probe = ingestMachineObservation(second.state, {
  source_access: 'authorized',
  source_family: 'first-party-web-log',
  observed_at: now,
  signal_type: 'api_probe',
  target_entity: 'evercraft-public-api',
  actor_domain: 'scanner.example',
  provenance_ref: 'log:probe-1'
});

assert.ok(probe.decision.consumers.includes('security'));
assert.ok(probe.decision.consumers.includes('portfolio_sentinel'));
assert.equal(probe.decision.consumers.includes('opportunity_fabric'), false);

console.log(JSON.stringify({
  ok: true,
  business_consumers: first.decision.consumers,
  probe_consumers: probe.decision.consumers,
  duplicate_collapsed: second.decision.duplicate
}, null, 2));
