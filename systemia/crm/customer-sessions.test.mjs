import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
 issuePrivateCustomerSession,createPrivateCustomerAuthenticator,
 revokePrivateCustomerSession
} from './customer-sessions.mjs';
import {createRelationshipCommandApi} from './customer-api.mjs';

const NOW=new Date('2026-10-28T18:00:00Z');
const identity={verified:true,tenant_id:'tenant:sample',actor_ref:'operator:owner',
  role:'operator',division_ids:['home'],identity_evidence_ref:'operator:trusted-passport'};
function approval(request){
 return {approved:true,approval_ref:'operator:authorized-enrollment',
   tenant_id:request.tenant_id,actor_ref:request.actor_ref,
   role:request.role,division_ids:[...request.division_ids],
   identity_evidence_ref:request.identity_evidence_ref,
   expires_at:'2026-10-29T00:00:00Z'};
}
const cookieRequest=cookie=>({headers:{cookie},method:'GET',url:'/v1/relationship-command/workspace'});
function yard(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crm-customer-session-'));fs.chmodSync(root,0o700);
 const sessions=path.join(root,'sessions');fs.mkdirSync(sessions,{mode:0o700});
 const vault=path.join(root,'vault');fs.mkdirSync(vault,{mode:0o700});
 const tenants=path.join(vault,'tenants');fs.mkdirSync(tenants,{mode:0o700});
 const file=path.join(tenants,createHash('sha256').update(identity.tenant_id).digest('hex')+'.json');
 fs.writeFileSync(file,JSON.stringify({schema:'evercraft.crm.tenant-private-records.v1',
   tenant_id:identity.tenant_id,records:[{
    tenant_id:identity.tenant_id,relationship_ref:'sample:relationship',
    subject_ref:'sample:person',division_id:'home',display_name:'Fictional Archive',
    kind:'partner',stage:'discussion',outbound_policy:'manual_review_only',
    source_ref:'sample:private-email',observed_at:'2026-10-27T00:00:00Z',
    next_review_at:'2026-10-27T00:00:00Z',
    timeline:[{type:'contact_window_requested',occurred_at:'2026-10-26T00:00:00Z',
      evidence_ref:'sample:source',private_context:'Private customer note'}]
   }]}),{mode:0o600});
 const issue=(override={})=>issuePrivateCustomerSession({
   storeDir:sessions,identity,verifyEnrollment:approval,now:NOW,...override
 });
 return {root,vault,sessions,issue,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function res(){return {status:null,headers:null,text:null,
 writeHead(status,headers){this.status=status;this.headers=headers;},
 end(text){this.text=text;this.body=JSON.parse(text);}};}
test('trusted enrollment creates secure opaque cookie with protected hashed token store',()=>{
 const f=yard();try{
  const receipt=f.issue();
  assert.equal(receipt.state,'issued');
  assert.match(receipt.session_token,/^[a-f0-9]{64}$/);
  assert.match(receipt.cookie,/^__Host-evercraft_rc=[a-f0-9]{64}; Path=\/; Secure; HttpOnly; SameSite=Strict$/);
  const file=path.join(f.sessions,'customer-sessions.json');
  assert.equal(fs.statSync(file).mode&0o077,0);
  const persisted=fs.readFileSync(file,'utf8');
  assert.equal(persisted.includes(receipt.session_token),false);
  assert.equal(JSON.parse(persisted).sessions.length,1);
 }finally{f.cleanup();}
});
test('session cookie authorizes scoped private customer API and rejects role-header spoofing',async()=>{
 const f=yard();try{
  const issued=f.issue();
  const authenticate=createPrivateCustomerAuthenticator({storeDir:f.sessions,clock:()=>NOW});
  const handler=createRelationshipCommandApi({vaultDir:f.vault,
    authenticate,clock:()=>NOW});
  const good=res();await handler(cookieRequest(issued.cookie),good);
  assert.equal(good.status,200);
  assert.equal(good.body.entries[0].display_name,'Fictional Archive');
  assert.equal(good.body.entries[0].contact_state,'human_review_required');
  const forged=res();await handler({...cookieRequest(''),
    headers:{'x-tenant-id':identity.tenant_id,'x-user-role':'owner'}},forged);
  assert.equal(forged.status,401);
  assert.equal(JSON.stringify(forged.body).includes('Fictional Archive'),false);
  const duplicate=res();await handler(cookieRequest(issued.cookie+'; '+issued.cookie),duplicate);
  assert.equal(duplicate.status,401);
 }finally{f.cleanup();}
});
test('immediate server-side revocation disables previously valid cookie',async()=>{
 const f=yard();try{
  const issued=f.issue(),authenticate=createPrivateCustomerAuthenticator({
   storeDir:f.sessions,clock:()=>NOW});
  const req=cookieRequest(issued.cookie);
  assert.equal((await authenticate(req)).verified,true);
  const tokenHash=createHash('sha256').update(issued.session_token).digest('hex');
  const revocation=revokePrivateCustomerSession({
   storeDir:f.sessions,tokenHash,actorRef:'operator:owner',now:NOW,
   verifyRevocation:({token_hash,actor_ref})=>({
    approved:true,token_hash,actor_ref,
    approval_ref:'operator:revocation',expires_at:'2026-10-28T19:00:00Z'})
  });
  assert.equal(revocation.state,'revoked');
  assert.equal((await authenticate(req)).verified,false);
  const again=revokePrivateCustomerSession({storeDir:f.sessions,tokenHash,
   actorRef:'operator:owner',now:NOW,
   verifyRevocation:({token_hash,actor_ref})=>({
    approved:true,token_hash,actor_ref,
    approval_ref:'operator:revocation',expires_at:'2026-10-28T19:00:00Z'})});
  assert.equal(again.state,'already_revoked');
 }finally{f.cleanup();}
});
test('expired session and invented cookie are rejected',async()=>{
 const f=yard();try{
  const token=f.issue({ttlSeconds:60});
  const late=createPrivateCustomerAuthenticator({storeDir:f.sessions,
   clock:()=>new Date(NOW.getTime()+61*1000)});
  assert.equal((await late(cookieRequest(token.cookie))).verified,false);
  assert.equal((await late(cookieRequest('__Host-evercraft_rc='+'0'.repeat(64)))).verified,false);
  const valid=createPrivateCustomerAuthenticator({storeDir:f.sessions,clock:()=>NOW});
  assert.equal((await valid(cookieRequest(token.cookie))).verified,true);
 }finally{f.cleanup();}
});
test('caller claims, approval scope escalation and missing authority fail closed',()=>{
 const f=yard();try{
  assert.throws(()=>f.issue({verifyEnrollment:()=>({approved:true})}),/session_enrollment_not_approved/);
  assert.throws(()=>f.issue({identity:{...identity,verified:false}}),/session_identity_not_verified/);
  assert.throws(()=>f.issue({verifyEnrollment:({tenant_id,actor_ref,identity_evidence_ref})=>({
   approved:true,tenant_id,actor_ref,identity_evidence_ref,role:'owner',
   division_ids:['home'],approval_ref:'forged:scope',expires_at:'2026-10-29T00:00:00Z'
  })}),/session_enrollment_not_approved/);
  assert.throws(()=>f.issue({verifyEnrollment:null}),/session_enrollment_authority_required/);
 }finally{f.cleanup();}
});
test('unsafe session storage never issues new token or validates existing one',async()=>{
 const f=yard();try{
  const token=f.issue();
  fs.chmodSync(f.sessions,0o755);
  assert.throws(()=>f.issue(),/session_store_dir_unsafe/);
  const auth=createPrivateCustomerAuthenticator;
  assert.throws(()=>auth({storeDir:f.sessions}),/session_store_dir_unsafe/);
  fs.chmodSync(f.sessions,0o700);
  fs.chmodSync(path.join(f.sessions,'customer-sessions.json'),0o644);
  const reader=createPrivateCustomerAuthenticator({storeDir:f.sessions,clock:()=>NOW});
  assert.equal((await reader(cookieRequest(token.cookie))).verified,false);
 }finally{f.cleanup();}
});
test('revocation cannot be triggered by a caller approval flag',()=>{
 const f=yard();try{
  const token=f.issue();
  const tokenHash=createHash('sha256').update(token.session_token).digest('hex');
  assert.throws(()=>revokePrivateCustomerSession({
   storeDir:f.sessions,tokenHash,actorRef:'operator:owner',
   operatorApproval:{approved:true,approval_ref:'client:request'},now:NOW
  }),/session_revocation_approval_required/);
  assert.throws(()=>revokePrivateCustomerSession({
   storeDir:f.sessions,tokenHash,actorRef:'operator:owner',
   verifyRevocation:()=>({approved:true,approval_ref:'wrong',token_hash:'different',
     actor_ref:'operator:owner',expires_at:'2026-10-28T19:00:00Z'}),now:NOW
  }),/session_revocation_approval_required/);
 }finally{f.cleanup();}
});
