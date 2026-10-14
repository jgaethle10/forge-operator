import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewCandidate} from './review-gate.mjs';
const fixture=JSON.parse(readFileSync(new URL('./review-record.json',import.meta.url),'utf8'));
const change=(f)=>{const r=structuredClone(fixture);f(r);return r;};
test('valid metadata stays held, never authorizes deployment',()=>{
 const o=reviewCandidate(fixture);
 assert.equal(o.status,'REVIEW_HELD');
 assert.equal(o.deployment_verified,false);
 assert.equal(o.admitted_by_systemia,false);
 assert.equal(o.physical_proof_verified,false);
});
test('rejects fabricated deployment',()=>assert.throws(()=>reviewCandidate(change(r=>{r.claims.deployed=true;})),/unsupported claim/));
test('rejects fabricated receipt',()=>assert.throws(()=>reviewCandidate(change(r=>{r.authority.yard_deployment_receipt='unverified';})),/unverified authority/));
test('rejects fixture deployment claim',()=>assert.throws(()=>reviewCandidate(change(r=>{r.tests.yard_fixture.deployed=true;})),/fixture must refuse/));
test('rejects missed Compute attestation hold',()=>assert.throws(()=>reviewCandidate(change(r=>{r.tests.yard_fixture.release_denial='allowed';})),/fixture must refuse/));
test('rejects failing local tests',()=>assert.throws(()=>reviewCandidate(change(r=>{r.tests.owned_core.passed--;})),/test failure/));
test('rejects treating an HTTP 401 as unreachable',()=>assert.throws(()=>reviewCandidate(change(r=>{r.field01b_reachability.any_valid_http_response_means_core_reachable=false;})),/HTTP response/));
test('rejects publishing private source in public repo',()=>assert.throws(()=>reviewCandidate(change(r=>{r.source_in_public_repo=true;})),/private Core/));
test('rejects invalid archive hashes',()=>assert.throws(()=>reviewCandidate(change(r=>{r.artifact.sha256='bad';})),/archive identity/));
test('rejects unproven carrier or public-safety claims',()=>{
 assert.throws(()=>reviewCandidate(change(r=>{r.claims.carrier_service_proven=true;})),/unsupported claim/);
 assert.throws(()=>reviewCandidate(change(r=>{r.claims.public_safety_authority=true;})),/unsupported claim/);
});
