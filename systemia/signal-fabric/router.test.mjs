import assert from 'node:assert/strict';
import { classify, fingerprint, route } from './router.mjs';

assert.equal(classify({source:'github',conclusion:'cancelled'}),'receipt');
assert.equal(classify({source:'github',conclusion:'skipped'}),'receipt');
assert.equal(classify({source:'branch',status:'failed',evidence_state:'source_build_green'}),'notice');
assert.equal(classify({source:'main',status:'failed'}),'warning');
assert.equal(classify({source:'canary',status:'failed',evidence_state:'live_verified'}),'critical');
assert.equal(classify({kind:'payment_blocked',human_action_required:true}),'critical');
assert.equal(classify({security_incident:true,status:'failed'}),'critical');

const a=fingerprint({product:'AliEV',source:'canary',kind:'health',component:'api',status:'failed'});
const b=fingerprint({product:'AliEV',source:'canary',kind:'health',component:'api',status:'failed'});
assert.equal(a,b);

const decision=route({product:'ForensiScope',source:'branch',status:'failed',evidence_state:'source_build_green'});
assert.equal(decision.severity,'notice');
assert.equal(decision.immediate_allowed,false);
assert.equal(decision.digest_eligible,true);
assert.ok(decision.routes.includes('ledger'));

console.log('SIGNAL FABRIC PASS');
