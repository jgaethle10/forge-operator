import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRelationshipCommandApi} from './customer-api.mjs';

const now=new Date('2026-10-22T20:00:00Z');
const tenantId='tenant:pilot';
const access={tenant_id:tenantId,actor_ref:'operator:demo',active:true,
 role:'operator',division_ids:['home'],expires_at:'2026-10-23T22:00:00Z'};
function sample(){
 const vaultDir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-api-test-'));fs.chmodSync(vaultDir,0o700);
 const tenants=path.join(vaultDir,'tenants');fs.mkdirSync(tenants,{mode:0o700});
 const file=path.join(tenants,createHash('sha256').update(tenantId).digest('hex')+'.json');
 const record={tenant_id:tenantId,relationship_ref:'private:rel-1',
   subject_ref:'private:contact-1',division_id:'home',display_name:'Fictional Community Group',
   kind:'partner',stage:'meeting_discussed',source_ref:'private:mail-123',
   outbound_policy:'manual_review_only',observed_at:'2026-10-21T15:00:00Z',
   next_review_at:'2026-10-21T19:00:00Z',
   timeline:[{type:'contact_window_acknowledged',occurred_at:'2026-10-21T10:00:00Z',
     evidence_ref:'private:reply-123',private_context:'Private operator note visible only to authorized roles'}]};
 fs.writeFileSync(file,JSON.stringify({
   schema:'evercraft.crm.tenant-private-records.v1',tenant_id:tenantId,
   records:[record]
 }),{mode:0o600});
 return {vaultDir,file,cleanup:()=>fs.rmSync(vaultDir,{recursive:true,force:true})};
}
function res(){
 return {status:null,headers:null,text:null,
  writeHead(code,headers){this.status=code;this.headers=headers;},
  end(body){this.text=body;this.body=JSON.parse(body);}
 };
}
const request=(method='GET',url='/v1/relationship-command/workspace',headers={})=>
 ({method,url,headers});
test('authenticated pilot returns only scoped read model with anti-cache headers',async()=>{
 const f=sample();try{
  const handle=createRelationshipCommandApi({vaultDir:f.vaultDir,
   authenticate:async()=>({verified:true,tenant_id:tenantId,access}),clock:()=>now});
  const reply=res();await handle(request(),reply);
  assert.equal(reply.status,200);
  assert.equal(reply.body.schema,'evercraft.crm.customer-workspace.v1');
  assert.equal(reply.body.entries[0].display_name,'Fictional Community Group');
  assert.equal(reply.body.action_authority,'none');
  assert.equal(reply.headers['cache-control'],'private, no-store, max-age=0');
  assert.equal(reply.headers['x-content-type-options'],'nosniff');
  assert.equal(reply.body.entries[0].timeline[0].context.includes('Private operator note'),true);
 }finally{f.cleanup();}
});
test('query tenant override, mutation verbs, and unrelated paths are rejected',async()=>{
 const f=sample();try{
  let calls=0;const handle=createRelationshipCommandApi({vaultDir:f.vaultDir,
   authenticate:async()=>{calls++;return {verified:true,tenant_id:tenantId,access};},clock:()=>now});
  const query=res();await handle(request('GET','/v1/relationship-command/workspace?tenant=other'),query);
  assert.equal(query.status,400);
  const post=res();await handle(request('POST'),post);
  assert.equal(post.status,405);assert.equal(post.headers.allow,'GET');
  const other=res();await handle(request('GET','/v1/relationships/secret'),other);
  assert.equal(other.status,404);
  assert.equal(calls,0);
 }finally{f.cleanup();}
});
test('untrusted browser-supplied roles cannot replace private session verification',async()=>{
 const f=sample();try{
  const handle=createRelationshipCommandApi({vaultDir:f.vaultDir,
   authenticate:async()=>({verified:false,tenant_id:tenantId,access}),clock:()=>now});
  const reply=res();await handle(request('GET',undefined,{
   'x-user-role':'owner','x-tenant-id':tenantId
  }),reply);
  assert.equal(reply.status,401);
  assert.equal(JSON.stringify(reply.body).includes('Fictional Community Group'),false);
 }finally{f.cleanup();}
});
test('foreign tenant session never sees a customer vault or internal filename',async()=>{
 const f=sample();try{
  const handle=createRelationshipCommandApi({vaultDir:f.vaultDir,
   authenticate:async()=>({verified:true,tenant_id:'tenant:other',access}),clock:()=>now});
  const reply=res();await handle(request(),reply);
  assert.equal(reply.status,403);
  assert.equal(reply.text.includes(f.vaultDir),false);
  assert.equal(reply.text.includes('Fictional Community Group'),false);
 }finally{f.cleanup();}
});
test('viewer authorization reads timeline metadata but suppresses private context',async()=>{
 const f=sample();try{
  const handle=createRelationshipCommandApi({vaultDir:f.vaultDir,
   authenticate:async()=>({verified:true,tenant_id:tenantId,access:{...access,role:'viewer'}}),
   clock:()=>now});
  const reply=res();await handle(request(),reply);
  assert.equal(reply.status,200);
  assert.equal(reply.body.entries[0].timeline[0].context,undefined);
 }finally{f.cleanup();}
});
test('missing server-side authentication cannot instantiate a public API',()=>{
 assert.throws(()=>createRelationshipCommandApi({vaultDir:'/tmp/untrusted'}),
   /customer_api_trusted_authentication_required/);
 assert.throws(()=>createRelationshipCommandApi({authenticate:async()=>({verified:true})}),
   /customer_api_vault_not_configured/);
});
