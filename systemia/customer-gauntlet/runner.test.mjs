import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadMultiplicationRegistry, resolveMultiplicationContract, buildMultiplicationPlan } from '../saban/multiplier.mjs';

const personas=JSON.parse(fs.readFileSync('systemia/customer-gauntlet/personas.json','utf8'));
const policy=JSON.parse(fs.readFileSync('systemia/customer-gauntlet/policy.json','utf8'));
const catalog=JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));

assert.equal(personas.family,'Lennox');
assert.ok(personas.personas.length>=10);
assert.equal(new Set(personas.personas.map(p=>p.id)).size,personas.personas.length);
assert.ok(personas.personas.some(p=>p.tests.includes('duplicate_charge_guard')));
assert.ok(personas.personas.some(p=>p.tests.includes('delivery')));
assert.ok(personas.personas.some(p=>p.tests.includes('tab_order')));
assert.equal(policy.rules.third_party_test_engines_allowed,false);
assert.equal(policy.rules.external_browser_saas_allowed,false);
assert.equal(policy.rules.owned_protocol_executor_required,true);
assert.equal(policy.rules.blocked_lane_never_counts_as_pass,true);
assert.equal(policy.rules.live_payment_by_default,false);
assert.equal(policy.rules.quarantine_on_p0,true);
assert.ok(policy.severity.P0.includes('duplicate_charge'));
assert.ok(policy.severity.P0.includes('payment_verified_but_no_entitlement'));
assert.ok(policy.severity.P1.includes('unsafe_transport'));

const registry=loadMultiplicationRegistry();
const contract=resolveMultiplicationContract('customer-gauntlet',registry);
assert.equal(contract.adapter,'systemia/customer-gauntlet/saban-adapter.mjs');
assert.deepEqual(contract.roles,personas.personas.map(p=>p.id));
const sellNow=(catalog.offers||[]).filter(o=>o?.public_id&&o?.commercial_state==='sell_now');
const workItems=sellNow.map(o=>({kind:'customer_offer',key:o.public_id,source_file:null,raw:{offer:o}}));
const plan=buildMultiplicationPlan({
  contract,
  logicalAgents:sellNow.length*personas.personas.length,
  physicalWorkers:Math.min(12,sellNow.length*personas.personas.length),
  workItems
});
assert.equal(plan.logical_agents,sellNow.length*personas.personas.length);
assert.equal(plan.roles.length,personas.personas.length);
assert.equal(plan.assignment_strategy,'role_item_cartesian');
console.log('CUSTOMER_GAUNTLET_CONTRACT_PASS');
