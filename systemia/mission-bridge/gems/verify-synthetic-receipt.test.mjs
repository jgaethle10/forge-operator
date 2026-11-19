import test from 'node:test';
import assert from 'node:assert/strict';
import {runSyntheticGemsResearchSmoke} from './synthetic-research-worker.mjs';
import {verify} from './verify-synthetic-receipt.mjs';
test('independent verifier accepts generated synthetic fixture receipt',()=>{
 const output=verify(runSyntheticGemsResearchSmoke());
 assert.equal(output.verified,true);
 assert.equal(output.official_dti_claimed,false);
});
test('independent verifier rejects altered metrics and real-data claims',()=>{
 const original=runSyntheticGemsResearchSmoke();
 const tampered=structuredClone(original);
 tampered.results[0].heldout.f1=0.99;
 assert.throws(()=>verify(tampered),/receipt_digest_mismatch/);
 const falseClaim=structuredClone(original);
 falseClaim.real_gems_dataset_used=true;
 assert.throws(()=>verify(falseClaim));
});
test('missing, malformed, or fictional receipt cannot pass',()=>{
 assert.throws(()=>verify(null));
 assert.throws(()=>verify({schema:'evercraft.gems.synthetic-compute-receipt.v1'}));
});
