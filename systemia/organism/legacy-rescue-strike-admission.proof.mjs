import assert from 'node:assert/strict';
import {
  admitLegacyRescueStrike,
  buildLegacyRescueStrikePlan,
  legacyRescueStrikeKey,
} from './legacy-rescue-strike-admission.mjs';

const high = {
  signal_key:'source|modernization|001',
  source:'Public procurement',
  title:'Legacy Mainframe Modernization',
  url:'https://example.gov/rfp/001',
  change_type:'new_signal',
  evidence_refs:['public:rfp-001'],
  urgency:98,
  buyer_access:86,
  proofability:99,
  evidence_quality:100,
  days_to_cash:78,
};

const key = legacyRescueStrikeKey(high);
assert.match(key, /^public-rescue-strike:[a-f0-9]{16}$/);
assert.equal(key, legacyRescueStrikeKey({...high}));

const plan = buildLegacyRescueStrikePlan({signal:high, goalKey:key});
assert.equal(plan.length,7);
assert.equal(plan[0].work_key,'ground-public-evidence');
assert.equal(plan.at(-1).human_gate_required,true);
assert.deepEqual(plan.at(-1).dependency_keys.sort(), ['package-proof-before-pitch','qualify-buyer-access'].sort());

const admitted = admitLegacyRescueStrike({
  signal:high,
  cycleKey:'2026-09-25T20:05:00.000Z',
  now:new Date('2026-09-25T20:05:00.000Z'),
});
assert.equal(admitted.admitted,true);
assert.equal(admitted.disposition,'strike_candidate');
assert(admitted.score >= 80);
assert.equal(admitted.goal_state.goal_key,key);
assert(admitted.goal_state.next_work_keys.includes('ground-public-evidence'));
assert(admitted.goal_state.tasks.find((task)=>task.work_key==='founder-review-outreach').human_gate_unresolved);
assert.equal(admitted.authority.production_mutation,'explicit_authorization_required');

const medium = admitLegacyRescueStrike({
  signal:{...high,signal_key:'medium',urgency:65,buyer_access:60,proofability:70,evidence_quality:70,days_to_cash:60},
  cycleKey:'cycle',
  now:new Date('2026-09-25T20:05:00.000Z'),
});
assert.equal(medium.admitted,false);
assert.notEqual(medium.disposition,'strike_candidate');

console.log(JSON.stringify({
  ok:true,
  goal_key:key,
  score:admitted.score,
  first_work:admitted.goal_state.next_work_keys,
  outreach_gate:admitted.goal_state.tasks.find((task)=>task.work_key==='founder-review-outreach').human_gate_unresolved,
}));
