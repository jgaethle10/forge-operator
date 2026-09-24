import assert from 'node:assert/strict';
import {
  admitGoalPlan,
  createGoalState,
} from '../organism/goal-runtime.mjs';
import {
  createCapabilityRegistry,
  executeGoalWorkWithAdapter,
} from '../organism/capability-runtime.mjs';
import { createChumOfferDiscoveryAdapter } from './goal-adapter.mjs';

const registry = createCapabilityRegistry([
  createChumOfferDiscoveryAdapter({
    catalogPath: 'public/.well-known/evercraft-machine-catalog.json',
    minimumScore: 8,
    limit: 3,
  }),
]);

let state = createGoalState({
  goalKey: 'chum-goal-adapter-proof',
  objective: 'Resolve a user pain to the smallest fitting public Evercraft offer without creating payment authority.',
  now: new Date('2026-09-24T19:50:00Z'),
});

state = admitGoalPlan({
  state,
  plan: [{
    work_key: 'match-ev-pain',
    work_type: 'commercial-discovery',
    title: 'EV charger site analysis for a property address',
  }],
  now: new Date('2026-09-24T19:50:01Z'),
});

const result = await executeGoalWorkWithAdapter({
  state,
  workKey: 'match-ev-pain',
  registry,
  context: { query: 'is this site good for EV charging' },
  now: new Date('2026-09-24T19:51:00Z'),
});

assert.equal(result.ok, true);
assert.equal(result.state.status, 'complete');
assert.equal(result.output.schema, 'evercraft.chum.goal-discovery-result.v1');
assert.ok(result.output.matches.length >= 1);
assert.equal(result.output.matches[0].public_id, 'aliev-site-opportunity-snapshot-v1');
assert.equal(result.output.safety.discovery_creates_obligation, false);
assert.equal(result.output.safety.checkout_is_payment_proof, false);
assert.equal(result.receipt.authority, 'read-only');
assert.ok(result.receipt.evidence_refs.some((ref) => ref.startsWith('evercraft-machine-catalog:')));

let noMatchState = createGoalState({
  goalKey: 'chum-no-match-proof',
  objective: 'Do not force an Evercraft offer when nothing fits.',
  now: new Date('2026-09-24T19:52:00Z'),
});
noMatchState = admitGoalPlan({
  state: noMatchState,
  plan: [{
    work_key: 'match-nonsense',
    work_type: 'commercial-discovery',
    title: 'unrelated invented need',
  }],
  now: new Date('2026-09-24T19:52:01Z'),
});
const noMatch = await executeGoalWorkWithAdapter({
  state: noMatchState,
  workKey: 'match-nonsense',
  registry,
  context: { query: 'quantum banana orchestra submarine wallpaper' },
  now: new Date('2026-09-24T19:53:00Z'),
});
assert.equal(noMatch.ok, true);
assert.equal(noMatch.output.match_count, 0);

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.chum.goal-adapter-proof.v1',
  top_match: result.output.matches[0].public_id,
  no_match_is_valid_observation: true,
  payment_authority_created: false,
}, null, 2));
