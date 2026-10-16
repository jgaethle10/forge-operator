import test from 'node:test';
import assert from 'node:assert/strict';
import { signDurableJobRequest, verifyDurableJobRequest } from './systemia-admission.mjs';

const secret = 'ci-only-systemia-browser-durable-secret-1234567890';
function verify(headers, opts = {}) {
  return verifyDurableJobRequest(secret, {
    headers, method:'POST', path:'/v1/jobs',
    body:'{"mission_key":"proof","work_key":"proof1"}',
    nonces:new Map(), ...opts
  });
}
test('valid signed Systemia job admission binds exact method path body and timestamp', () => {
  const now = Date.now();
  const body = '{"mission_key":"proof","work_key":"proof1"}';
  const headers = signDurableJobRequest(secret, { method:'POST',path:'/v1/jobs',body,timestamp:now });
  assert.equal(verify(headers,{now}),true);
  assert.throws(() => verify(headers,{path:'/v1/jobs/other-id',now}),/durable_job_signature_invalid/);
  assert.throws(() => verify(headers,{method:'DELETE',now}),/durable_job_signature_invalid/);
  assert.throws(() => verify(headers,{body:body+' ',now}),/durable_job_signature_invalid/);
});
test('replayed nonce, stale timestamps, forged secrets fail closed', () => {
  const now=Date.now(), body='{"mission_key":"proof","work_key":"proof1"}';
  const headers=signDurableJobRequest(secret,{method:'POST',path:'/v1/jobs',body,timestamp:now});
  const seen=new Map();
  assert.equal(verify(headers,{now,nonces:seen}),true);
  assert.throws(() => verify(headers,{now,nonces:seen}),/durable_job_request_replayed/);
  assert.throws(() => verify(headers,{now:now+360_000}),/durable_job_signature_invalid/);
  assert.throws(() => verify({...headers,'x-evercraft-signature':'0'.repeat(64)},{now}),/durable_job_signature_invalid/);
  assert.throws(() => signDurableJobRequest('short',{method:'POST',path:'/v1/jobs',body}),/durable_job_signing_key_invalid/);
});
test('nonce cache saturation fails closed until expired entries are swept', () => {
  const now = Date.now(), body='{"mission_key":"proof","work_key":"proof1"}';
  const headers=signDurableJobRequest(secret,{method:'POST',path:'/v1/jobs',body,timestamp:now});
  const nonces=new Map(Array.from({length:10000},(_,i)=>['old-'+i,now+1000]));
  assert.throws(() => verify(headers,{now,nonces}),/durable_job_replay_cache_full/);
  for (const key of nonces.keys()) nonces.set(key,now-1);
  assert.equal(verify(headers,{now,nonces}),true);
});
