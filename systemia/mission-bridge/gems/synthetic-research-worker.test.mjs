import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runSyntheticGemsResearchSmoke} from './synthetic-research-worker.mjs';
const sha=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('deterministic synthetic compute returns independently checkable receipt',()=>{
 const one=runSyntheticGemsResearchSmoke();
 const two=runSyntheticGemsResearchSmoke();
 assert.deepEqual(one,two);
 assert.equal(one.state,'computed_synthetic_fixture_only');
 const {receipt_sha256,...body}=one;
 assert.equal(receipt_sha256,sha(body));
 assert.equal(one.results.length,2);
 assert.ok(one.results.every(r=>Number.isFinite(r.heldout.f1)&&
   r.heldout.f1>=0&&r.heldout.f1<=1&&r.train_positive_count>0&&r.train_negative_count>0));
 assert.equal(one.real_gems_dataset_used,false);
 assert.equal(one.drivendata_submission_made,false);
 assert.equal(one.official_dti_claimed,false);
 assert.equal(one.external_network_called,false);
});
test('synthetic smoke refuses unknown fixture versions and user payloads',()=>{
 assert.throws(()=>runSyntheticGemsResearchSmoke({fixtureVersion:'v2'}),/unsupported_fixed_fixture/);
 assert.throws(()=>runSyntheticGemsResearchSmoke({fixtureVersion:'../../secrets'}));
});
