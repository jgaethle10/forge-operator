import assert from 'node:assert/strict';
import test from 'node:test';
import {diagnoseOwnedEdge,FABRIC_HOST} from './edge-network-diagnostics.mjs';
test('failed DNS is accurately separated from TLS, no IP emitted',async()=>{
 let called=false;
 const r=await diagnoseOwnedEdge({lookup:async(host)=>{assert.equal(host,FABRIC_HOST);const e=Error('private hostname could not be resolved');e.code='ENOTFOUND';throw e},
  probeTls:async()=>{called=true;return {passed:true}}});
 assert.equal(r.stage,'dns_unresolved');assert.equal(r.dnsResolved,false);assert.equal(called,false);
 assert.doesNotMatch(JSON.stringify(r),/private hostname could not be resolved/);
});
test('valid DNS then TLS handshake failure means transport, not DNS',async()=>{
 const r=await diagnoseOwnedEdge({lookup:async()=>[{address:'192.0.2.200',family:4}],
  probeTls:async()=>({passed:false,stage:'https_transport_unavailable'})});
 assert.equal(r.dnsResolved,true);
 assert.equal(r.tlsHandshakeVerified,false);
 assert.equal(r.stage,'https_transport_unavailable');
 assert.doesNotMatch(JSON.stringify(r),/192\.0\.2\.200/);
});
test('valid TLS is only a prerequisite and never a courier deployment attestation',async()=>{
 const r=await diagnoseOwnedEdge({lookup:async()=>[{address:'192.0.2.200',family:4}],
  probeTls:async()=>({passed:true,stage:'https_tls_identity_verified'})});
 assert.equal(r.tlsHandshakeVerified,true);
 assert.equal(r.relayRunningVerified,false);
 assert.equal(r.deploymentAllowed,false);
 assert.equal(r.customerDataTouched,false);
});
test('missing DNS records are held',async()=>{
 const r=await diagnoseOwnedEdge({lookup:async()=>[],probeTls:async()=>{throw Error('must not run')}});
 assert.equal(r.stage,'dns_unresolved');
});
