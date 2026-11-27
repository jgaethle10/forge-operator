import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {EvercraftPassport} from '../systemia/passport/passport.mjs';
import {EvercraftIdentity} from '../systemia/identity/identity.mjs';
import {runScopedSovereignProof} from '../systemia/leiland/scoped-sovereign-proof.mjs';
const token='test-only-existing-gateway-token-1234567890';
const secret='test-only-session-key-1234567890-1234567890';
const subject='user:synthetic-reviewer';
const model='synthetic-fixture';
const digest='sha256:'+'a'.repeat(64);
function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'leiland-scope-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const passportStateDir=path.join(root,'passport'),identityStateDir=path.join(root,'identity');
 const passport=new EvercraftPassport({stateDir:passportStateDir});
 const identity=new EvercraftIdentity({stateDir:identityStateDir});
 const now=Date.now(),until=new Date(now+600000).toISOString();
 const session={schema:'evercraft.identity.session.v1',signing_key_id:'test',
  subject_ref:subject,display_name:'Synthetic Reviewer',session_id:'leiland-test-session',
  issued_at:new Date(now).toISOString(),expires_at:until};
 const encoded=Buffer.from(JSON.stringify(session)).toString('base64url');
 const sessionToken=encoded+'.'+createHmac('sha256',secret).update(encoded).digest('base64url');
 function grant({product='findmypart',scopes=['leiland.synthetic-review'],resource_refs=['synthetic-leiland:findmypart']}={}){
  return passport.issueGrant({idempotency_key:'grant:'+product,subject_ref:subject,
   issuer_ref:'evercraft:identity-authority',product,scopes,
   ...(resource_refs===null?{}:{resource_refs}),
   starts_at:new Date(now-60000).toISOString(),ends_at:until,
   max_delegation_depth:0,authority_state:'verified_identity_authority',
   authority_receipt_ref:'test:identity:owner'});
 }
 const calls=[];
 function fetchImpl(url,opts){
  const route=new URL(url).pathname;calls.push(route);
  assert.equal(opts.redirect,'error');
  if(route==='/health')return Response.json({ok:true,service:'raven-inference-gateway',provider:'ollama',
   model,loopback_only:true,base44_required:false,external_side_effects_authorized:false});
  assert.equal(opts.headers.authorization,'Bearer '+token);
  if(route==='/v1/validate')return Response.json({status:'available',provider:'ollama',model,
   inference_performed:false,prompt_sent:false,base44_used:false,raw_credential_returned:false,
   external_side_effects_authorized:false,validation_receipt:digest});
  if(route==='/v1/infer'){
   const body=JSON.parse(opts.body);
   assert.equal(body.constraints.no_external_actions,true);
   assert.match(body.input,/Fictional QA case/);
   return Response.json({status:'completed',provider:'ollama',model,provider_receipt:digest,
    text:'Synthetic answer only'});
  }
  throw Error('unexpected_route');
 }
 const revoke=()=>identity.revokeSession({sessionId:session.session_id,subjectRef:subject,reason:'explicit_logout'});
 const run=opts=>runScopedSovereignProof({identityStateDir,passportStateDir,
  sessionKeyring:{test:secret},sessionToken,lane:'findmypart',token,fetchImpl,allowInference:true,...opts});
 return {run,grant,calls,revoke,fetchImpl};
}
test('exact product scope admits only one fixed synthetic task',async t=>{
 const {run,grant,calls}=setup(t);grant();
 const r=await run();
 assert.equal(r.state,'provider_reported_completed');
 assert.equal(r.inference_completed,1);assert.equal(r.result_released,true);
 assert.equal(r.receipts[0].lane,'findmypart');
 assert.deepEqual(calls,['/health','/v1/validate','/v1/infer']);
 assert.equal(r.external_actions_authorized,false);
 assert.doesNotMatch(JSON.stringify(r),/Synthetic answer only|test-only|synthetic-reviewer/);
 const other=await run({lane:'atlas'});
 assert.equal(other.state,'held');assert.equal(other.inference_request_attempted,false);
 assert.equal(calls.length,3);
});
test('missing, unscoped and wrong-resource grants never reach gateway',async t=>{
 const {run,grant,calls}=setup(t);
 assert.equal((await run()).state,'held');
 assert.throws(()=>grant({resource_refs:[]}),/resource_refs_required/);
 grant({resource_refs:null});
 assert.equal((await run()).state,'held');
 grant({product:'systemia-atlas',resource_refs:['synthetic-leiland:findmypart']});
 assert.equal((await run({lane:'atlas'})).state,'held');
 assert.deepEqual(calls,[]);
});
test('revoked or malformed session never reaches gateway',async t=>{
 const {run,grant,revoke,calls}=setup(t);grant();
 assert.equal((await run({sessionToken:'invalid'})).state,'held');
 revoke();assert.equal((await run()).state,'held');
 assert.deepEqual(calls,[]);
});
test('revocation during metadata validation prevents sending prompt',async t=>{
 const {run,grant,revoke,calls,fetchImpl}=setup(t);grant();
 const r=await run({fetchImpl:(url,opts)=>{
  const response=fetchImpl(url,opts);
  if(new URL(url).pathname==='/v1/validate')revoke();
  return response;
 }});
 assert.equal(r.state,'held');assert.equal(r.inference_request_attempted,false);
 assert.deepEqual(calls,['/health','/v1/validate']);
});
test('revocation after inference submission withholds result without pretending no work occurred',async t=>{
 const {run,grant,revoke,calls,fetchImpl}=setup(t);grant();
 const r=await run({fetchImpl:(url,opts)=>{
  const response=fetchImpl(url,opts);
  if(new URL(url).pathname==='/v1/infer')revoke();
  return response;
 }});
 assert.equal(r.state,'held');assert.equal(r.inference_request_attempted,true);
 assert.equal(r.inference_completed,1);assert.equal(r.result_released,false);
 assert.equal(r.receipts,undefined);
 assert.deepEqual(calls,['/health','/v1/validate','/v1/infer']);
});
test('metadata only respects product permission and does not send a prompt',async t=>{
 const {run,grant,calls}=setup(t);grant({product:'systemia-atlas',resource_refs:['synthetic-leiland:atlas']});
 const r=await run({lane:'atlas',allowInference:false});
 assert.equal(r.state,'metadata_only');assert.equal(r.inference_completed,0);
 assert.equal(r.inference_request_attempted,false);
 assert.deepEqual(calls,['/health','/v1/validate']);
});
