import assert from 'node:assert/strict';
import test from 'node:test';
import {observeCourierRoute,PROBE_URL} from './route-observation.mjs';
function fake(status,expectedState){
 return async(url,opts)=>{
  assert.equal(url,PROBE_URL);
  assert.equal(opts.method,'GET');
  assert.equal(opts.redirect,'manual');
  assert.equal(opts.headers.authorization,undefined);
  assert.equal(opts.body,undefined);
  return {status};
 };
}
test('404 is disabled or stale route, never an authenticated transfer',async()=>{
 const r=await observeCourierRoute({fetchImpl:fake(404)});
 assert.equal(r.routeState,'NOT_EXPOSED');
 assert.equal(r.reason,'route_disabled_or_stale_runtime');
 assert.equal(r.transferVerified,false);
 assert.equal(r.brokerAuthenticated,false);
});
test('401 is boundary enforcement, not proof broker or sender credentials',async()=>{
 const r=await observeCourierRoute({fetchImpl:fake(401)});
 assert.equal(r.routeState,'ANONYMOUS_DENIED');
 assert.equal(r.brokerAuthenticated,false);
 assert.equal(r.senderAuthenticated,false);
 assert.equal(r.secretProvisioned,false);
});
test('anonymous success is an alert and does not claim readiness',async()=>{
 const r=await observeCourierRoute({fetchImpl:fake(200)});
 assert.equal(r.routeState,'UNEXPECTED_ANONYMOUS_SUCCESS');
 assert.equal(r.publicUrlVerified,false);
 assert.equal(r.customerSendAuthorized,false);
});
test('network failure is held without leaking details',async()=>{
 const r=await observeCourierRoute({fetchImpl:async()=>{throw Error('secret details in DNS error')}});
 assert.equal(r.routeState,'UNKNOWN');
 assert.equal(r.reason,'external_route_unavailable');
 assert.doesNotMatch(JSON.stringify(r),/secret details/);
});
