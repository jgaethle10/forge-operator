import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {observeReceiverAuthBoundary,RECEIVER_AUTH_URL,receiverAuthUrlForWing} from './receiver-auth-canary.mjs';

function fixture(t,wing='fallen'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wing-courier-auth-canary-'));
 fs.chmodSync(root,0o700);
 t.after(()=>fs.rmSync(root,{force:true,recursive:true}));
 const dest=path.join(root,'inbox');fs.mkdirSync(dest,{mode:0o700});
 const secret=(name,body)=>{
  const file=path.join(root,name);
  fs.writeFileSync(file,body,{mode:0o600});
  return file;
 };
 const token='t'.repeat(48);
 const receiver=crypto.generateKeyPairSync('x25519');
 const ack=crypto.generateKeyPairSync('ed25519');
 const sender=crypto.generateKeyPairSync('ed25519');
 const privatePem=k=>k.export({type:'pkcs8',format:'pem'});
 const publicPem=k=>k.export({type:'spki',format:'pem'});
 const cfg={
  wing,
  baseUrl:'https://fabric.systemiacommandcenters.com/api/internal/wing-courier',
  receiveTokenFile:secret('fallen.receive',token),
  receiverPrivateKeyFile:secret('fallen.decrypt.key',privatePem(receiver.privateKey)),
  receiverSigningKeyFile:secret('fallen.sign.key',privatePem(ack.privateKey)),
  destinationDir:dest,
  senderVerifyPublicKeys:{[wing==='harbor'?'fallen':'harbor']:secret('trusted-signer.pub',publicPem(sender.publicKey))}
 };
 const configPath=secret('config.json',JSON.stringify(cfg));
 return {configPath,token};
}
const denied=status=>new Response('',{status});
const inbox=(data={})=>new Response(JSON.stringify({
 schema:'evercraft.wing-broker.inbox.v1',wing:'fallen',items:[],more:false,...data
}),{status:200,headers:{'content-type':'application/json'}});
const probe=(configPath,fetchImpl,authorizeNetworkCheck=true,wingExpected='fallen')=>observeReceiverAuthBoundary({
 configPath,wingExpected,fetchImpl,authorizeNetworkCheck,now:()=> '2026-11-20T00:00:00.000Z'
});

test('dry run never sends a request or exposes private token',async t=>{
 const f=fixture(t);
 const report=await probe(f.configPath,()=>{throw Error('must not fetch')},false);
 assert.equal(report.mode,'DRY_RUN');
 assert.equal(report.authenticatedRouteReady,false);
 assert.equal(report.customerBytesMoved,false);
 assert.doesNotMatch(JSON.stringify(report),new RegExp(f.token));
});

test('route 404 holds and never transmits a bearer token',async t=>{
 const f=fixture(t),calls=[];
 const result=await probe(f.configPath,async(url,opts)=>{
  calls.push({url,opts});return denied(404);
 });
 assert.equal(result.reason,'private_route_disabled_or_stale');
 assert.equal(result.authenticatedRouteReady,false);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,RECEIVER_AUTH_URL);
 assert.equal(calls[0].opts.headers.authorization,undefined);
 assert.equal(calls[0].opts.method,'GET');
 assert.equal(calls[0].opts.redirect,'manual');
 assert.equal(calls[0].opts.credentials,'omit');
 assert.equal(calls[0].opts.body,undefined);
});

test('anonymous 200 is unsafe and never triggers authenticated request',async t=>{
 const f=fixture(t);let calls=0;
 const result=await probe(f.configPath,async()=>{calls++;return inbox();});
 assert.equal(calls,1);
 assert.equal(result.reason,'unexpected_anonymous_access');
 assert.equal(result.anonymousAccessDenied,false);
});

test('authorized two-step route proves actual scoped receiver token and broker inbox contract only',async t=>{
 const f=fixture(t),calls=[];
 const result=await probe(f.configPath,async(url,opts)=>{
  calls.push({url,opts});
  return calls.length===1?denied(401):inbox();
 });
 assert.equal(calls.length,2);
 assert.ok(calls.every(c=>c.url===RECEIVER_AUTH_URL));
 assert.equal(calls[0].opts.headers.authorization,undefined);
 assert.equal(calls[1].opts.headers.authorization,'Bearer '+f.token);
 assert.equal(result.anonymousAccessDenied,true);
 assert.equal(result.authenticatedStatus,200);
 assert.equal(result.authenticatedRouteReady,true);
 assert.equal(result.brokerInboxContractVerified,true);
 assert.equal(result.receiverTokenAccepted,true);
 assert.equal(result.customerBytesMoved,false);
 assert.equal(result.customerDeliveryAuthorized,false);
 assert.equal(result.systemiaAdmissionGranted,false);
 assert.equal(result.relayProcessIdentityAttested,false);
 assert.equal(result.reason,'authenticated_read_only_boundary_pass');
 assert.doesNotMatch(JSON.stringify(result),new RegExp(f.token));
 assert.doesNotMatch(JSON.stringify(result),/items/);
});

test('401 on public edge followed by broker unavailable cannot claim readiness',async t=>{
 const f=fixture(t);let calls=0;
 const result=await probe(f.configPath,async()=>++calls===1?denied(401):denied(503));
 assert.equal(result.anonymousAccessDenied,true);
 assert.equal(result.authenticatedStatus,503);
 assert.equal(result.authenticatedRouteReady,false);
 assert.equal(result.reason,'private_broker_unavailable');
});

test('authenticated 200 with wrong inbox schema is not a verified broker contract',async t=>{
 const f=fixture(t);let calls=0;
 const result=await probe(f.configPath,async()=>++calls===1?denied(403):inbox({wing:'harbor'}));
 assert.equal(result.brokerInboxContractVerified,false);
 assert.equal(result.receiverTokenAccepted,false);
 assert.equal(result.reason,'broker_inbox_contract_mismatch');
});

test('oversized response and network error are safely held without exposing details',async t=>{
 const f=fixture(t);let calls=0;
 const tooLarge=await probe(f.configPath,async()=>++calls===1?denied(401):
   new Response('x'.repeat(70000),{status:200}));
 assert.equal(tooLarge.authenticatedRouteReady,false);
 assert.equal(tooLarge.reason,'network_or_response_unavailable');
 const sensitive='private-user-token-should-not-appear';
 const error=await probe(f.configPath,async()=>{throw Error(sensitive);});
 assert.equal(error.reason,'network_or_response_unavailable');
 assert.doesNotMatch(JSON.stringify(error),new RegExp(sensitive));
});

test('Harbor uses exact own inbox route, anonymous denial first and no payload transfer',async t=>{
 const f=fixture(t,'harbor'),calls=[];
 const report=await probe(f.configPath,async(url,opts)=>{
  calls.push({url,opts});
  return calls.length===1?denied(401):inbox({wing:'harbor'});
 },true,'harbor');
 assert.equal(calls.length,2);
 assert.ok(calls.every(x=>x.url===receiverAuthUrlForWing('harbor')));
 assert.equal(calls[0].opts.headers.authorization,undefined);
 assert.equal(calls[1].opts.headers.authorization,'Bearer '+f.token);
 assert.equal(report.wing,'harbor');
 assert.equal(report.authenticatedRouteReady,true);
 assert.equal(report.receiverTokenAccepted,true);
 assert.equal(report.brokerInboxContractVerified,true);
 assert.equal(report.customerBytesMoved,false);
 assert.equal(report.systemiaAdmissionGranted,false);
 assert.equal(report.relayProcessIdentityAttested,false);
 assert.doesNotMatch(JSON.stringify(report),new RegExp(f.token));
});
test('Harbor cannot use wrong-wing config or accept Fallen-shaped reply',async t=>{
 const f=fixture(t,'harbor');
 await assert.rejects(()=>probe(f.configPath,async()=>{throw Error('no fetch');},
  false,'fallen'),/wing_resident_scope_mismatch/);
 let called=0;
 const report=await probe(f.configPath,async()=>{
  called++;
  return called===1?denied(401):inbox({wing:'fallen'});
 },true,'harbor');
 assert.equal(report.authenticatedRouteReady,false);
 assert.equal(report.reason,'broker_inbox_contract_mismatch');
 assert.equal(called,2);
});
test('Harbor never sends receiver token to disabled route or unsafe anonymous success',async t=>{
 const f=fixture(t,'harbor'),calls=[];
 const fail=await probe(f.configPath,async(url,opts)=>{
  calls.push({url,opts});return denied(404);
 },true,'harbor');
 assert.equal(fail.reason,'private_route_disabled_or_stale');
 assert.equal(calls.length,1);
 assert.equal(calls[0].opts.headers.authorization,undefined);
 let count=0;
 const unsafe=await probe(f.configPath,async()=>{count++;return inbox({wing:'harbor'});},true,'harbor');
 assert.equal(unsafe.reason,'unexpected_anonymous_access');
 assert.equal(count,1);
 assert.throws(()=>receiverAuthUrlForWing('saban'),/unsupported_wing/);
});
