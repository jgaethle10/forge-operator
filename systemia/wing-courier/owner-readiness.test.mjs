import test from 'node:test';
import assert from 'node:assert/strict';
import {observeOwnerReadiness,OWNER_READINESS_SCHEMA}
 from './owner-readiness.mjs';

const COMMIT='4edff5edccebd09cc6bbf459e7f74100fe0525be';
function fakeExec(calls,{serviceState='loaded',active='inactive',clean=true}={}){
 return (command,args)=>{
  calls.push({command,args});
  if(command==='git'&&args.includes('rev-parse'))
   return {status:0,stdout:COMMIT+'\n'};
  if(command==='git'&&args.includes('status'))
   return {status:0,stdout:clean?'':' M private-local-change.txt\n'};
  if(command==='systemctl'){
   return {status:0,stdout:'LoadState='+serviceState+'\nActiveState='+active+'\n'};
  }
  throw Error('unexpected command');
 };
}
test('local Harbor evidence snapshot never executes, sends, or reveals private files',()=>{
 const calls=[],secret='/private/owner/SECRET_CONFIG_WITH_REAL_TOKEN.json';
 const r=observeOwnerReadiness({
  wing:'harbor',configPath:secret,sourceRoot:'/private/owner/forge-operator',
  platform:'linux',nodeMajor:22,uid:1000,
  exec:fakeExec(calls,{active:'active'}),
  configEvaluator:({configPath,wingExpected})=>{
   assert.equal(configPath,secret);
   assert.equal(wingExpected,'harbor');
   return {readyForLocalActivation:true,wing:'harbor',
    privateDestination:'/PRIVATE_KEY_MUST_NOT_BE_IN_OUTPUT'};
  }
 });
 assert.equal(r.schema,OWNER_READINESS_SCHEMA);
 assert.equal(r.status,'LOCAL_REVIEW_CANDIDATE_ONLY');
 assert.equal(r.sourceReviewedAndSignedByOwner,false);
 assert.equal(r.ownerPrivateConfig,'LOCAL_PRIVATE_PREFLIGHT_PASS');
 assert.equal(r.canonicalSourceCommit,COMMIT);
 assert.equal(r.userServiceState,'ACTIVE_UNATTESTED');
 assert.equal(r.realSignedCustodyReceipt,false);
 assert.equal(r.outboundNetworkRequested,false);
 assert.equal(r.serviceMutationPerformed,false);
 assert.equal(r.customerFilesMoved,false);
 assert.equal(r.tokensReadByThisTool,false);
 assert.equal(r.signingKeysReadByThisTool,true,'--config may parse owner-local private key types');
 assert.equal(r.signingKeysPublished,false);
 assert.equal(r.workerExecutionAuthorized,false);
 assert.equal(r.paymentAuthorized,false);
 assert.ok(calls.every(c=>['git','systemctl'].includes(c.command)));
 assert.equal(calls.some(c=>c.args.some(a=>/enable|start|daemon-reload|restart|curl|fetch/.test(a))),false);
 assert.doesNotMatch(JSON.stringify(r),/SECRET_CONFIG|PRIVATE_KEY_MUST/);
});
test('Harbor without private config reports hold but still inspects exact role unit',()=>{
 const calls=[];
 const r=observeOwnerReadiness({wing:'harbor',platform:'linux',nodeMajor:22,uid:1000,
  exec:fakeExec(calls,{serviceState:'not-found',active:'inactive'})});
 assert.equal(r.ownerPrivateConfig,'NOT_SUPPLIED');
 assert.equal(r.signingKeysReadByThisTool,false);
 assert.equal(r.userServiceState,'NOT_INSTALLED');
 assert.equal(r.status,'HOLD_FOR_PRIVATE_SETUP');
 assert.equal(r.nextGate,'OWNER_PRIVATE_RECEIVER_CONFIG_AND_KEY_ENROLLMENT');
 assert.ok(calls.some(x=>x.command==='systemctl'&&
   x.args.includes('evercraft-wing-courier-harbor.service')));
});
test('Fallen role never examines Harbor unit, and no unit status implies live identity',()=>{
 const calls=[];
 const r=observeOwnerReadiness({wing:'fallen',platform:'linux',nodeMajor:22,uid:1000,
  exec:fakeExec(calls,{active:'active'}),configPath:'/owner/fallen.json',
  configEvaluator:()=>({wing:'fallen',readyForLocalActivation:true})});
 assert.equal(r.status,'LOCAL_REVIEW_CANDIDATE_ONLY');
 assert.equal(r.userServiceState,'ACTIVE_UNATTESTED');
 assert.equal(r.realSignedCustodyReceipt,false);
 const service=calls.filter(x=>x.command==='systemctl')[0].args;
 assert.ok(service.includes('evercraft-wing-courier-fallen.service'));
 assert.ok(!service.includes('evercraft-wing-courier-harbor.service'));
});
test('unsafe local config, root operator, stale Node and unverified manager fail closed',()=>{
 for(const override of [
  {nodeMajor:21},{uid:0},{platform:'win32'},
  {configEvaluator:()=>{throw Error('Bearer SUPERSECRET_PRIVATE_TOKEN')}},
  {exec:()=>({status:1,stdout:'Bearer SUPERSECRET_PRIVATE_TOKEN'})}
 ]){
  const r=observeOwnerReadiness({
   wing:'harbor',configPath:'/owner/config.json',platform:'linux',
   nodeMajor:22,uid:1000,exec:fakeExec([],{active:'active'}),
   configEvaluator:()=>({wing:'harbor',readyForLocalActivation:true}),
   ...override
  });
  assert.equal(r.status,'HOLD_FOR_PRIVATE_SETUP');
  assert.equal(r.realSignedCustodyReceipt,false);
  assert.doesNotMatch(JSON.stringify(r),/Bearer|SUPERSECRET|private\/owner/);
 }
});
test('unknown wing or impossible private config path is rejected or held',()=>{
 assert.throws(()=>observeOwnerReadiness({wing:'payments'}),/wing_required/);
 const calls=[];
 const r=observeOwnerReadiness({
  wing:'harbor',configPath:'./untrusted',platform:'linux',nodeMajor:22,uid:1000,
  exec:fakeExec(calls),
  configEvaluator:()=>{throw Error('should not inspect relative config')}
 });
 assert.equal(r.ownerPrivateConfig,'HOLD_INVALID_PRIVATE_CONFIGURATION');
 assert.equal(r.status,'HOLD_FOR_PRIVATE_SETUP');
});
test('dirty Git working tree remains visible without printing file names',()=>{
 const r=observeOwnerReadiness({
  wing:'fallen',platform:'linux',nodeMajor:22,uid:1000,
  exec:fakeExec([],{clean:false}),
  configPath:'/private/real.json',
  configEvaluator:()=>({wing:'fallen',readyForLocalActivation:true})
 });
 assert.equal(r.checkoutClean,'NO');
 assert.equal(r.sourceReviewedAndSignedByOwner,false);
 assert.doesNotMatch(JSON.stringify(r),/private-local-change/);
});
