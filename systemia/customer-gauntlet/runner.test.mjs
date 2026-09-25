import assert from 'node:assert/strict';
import fs from 'node:fs';

const personas=JSON.parse(fs.readFileSync('systemia/customer-gauntlet/personas.json','utf8'));
const policy=JSON.parse(fs.readFileSync('systemia/customer-gauntlet/policy.json','utf8'));

assert.equal(personas.family,'Lennox');
assert.ok(personas.personas.length>=10);
assert.equal(new Set(personas.personas.map(p=>p.id)).size,personas.personas.length);
assert.ok(personas.personas.some(p=>p.tests.includes('duplicate_charge_guard')));
assert.ok(personas.personas.some(p=>p.tests.includes('delivery')));
assert.ok(personas.personas.some(p=>p.tests.includes('tab_order')));
assert.equal(policy.rules.third_party_test_engines_allowed,false);
assert.equal(policy.rules.live_payment_by_default,false);
assert.equal(policy.rules.quarantine_on_p0,true);
assert.ok(policy.severity.P0.includes('duplicate_charge'));
assert.ok(policy.severity.P0.includes('payment_verified_but_no_entitlement'));
console.log('CUSTOMER_GAUNTLET_CONTRACT_PASS');
