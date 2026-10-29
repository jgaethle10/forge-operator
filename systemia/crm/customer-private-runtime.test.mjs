import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {issuePrivateCustomerSession} from './customer-sessions.mjs';
import {createRelationshipCommandPrivateRuntime} from './customer-private-runtime.mjs';
const NOW=new Date('2026-10-28T20:00:00Z');
const TENANT='tenant:portal';
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crm-private-portal-'));fs.chmodSync(root,0o700);
 const sessions=path.join(root,'sessions'),vault=path.join(root,'vault');
 fs.mkdirSync(sessions,{mode:0o700});fs.mkdirSync(vault,{mode:0o700});
 const tenants=path.join(vault,'tenants');fs.mkdirSync(tenants,{mode:0o700});
 const tenantFile=path.join(tenants,createHash('sha256').update(TENANT).digest('hex')+'.json');
 const records=[{tenant_id:TENANT,relationship_ref:'private:1',subject_ref:'private:contact',
  division_id:'home',display_name:'Fictional Service Partner',kind:'partner',
  stage:'discussion',outbound_policy:'manual_review_only',
  source_ref:'private:synthetic-thread',observed_at:'2026-10-27T00:00:00Z',
  next_review_at:'2026-10-27T00:00:00Z',
  timeline:[{type:'meeting_discussed',occurred_at:'2026-10-27T00:00:00Z',
   evidence_ref:'private:source',private_context:'Private note not exposed in static assets'}]}];
 fs.writeFileSync(tenantFile,JSON.stringify({
  schema:'evercraft.crm.tenant-private-records.v1',tenant_id:TENANT,records
 }),{mode:0o600});
 const identity={verified:true,tenant_id:TENANT,actor_ref:'private:operator',
  role:'operator',division_ids:['home'],identity_evidence_ref:'owner:identity'};
 const session=issuePrivateCustomerSession({storeDir:sessions,identity,
  verifyEnrollment:req=>({...req,approved:true,approval_ref:'owner:approved',
   expires_at:'2026-10-29T00:00:00Z'}),now:NOW});
 const runtime=createRelationshipCommandPrivateRuntime({vaultDir:vault,sessionDir:sessions,clock:()=>NOW});
 const response=()=>({status:null,headers:null,text:null,
  writeHead(code,headers){this.status=code;this.headers=headers;},
  end(data){this.text=Buffer.isBuffer(data)?data.toString('utf8'):String(data);}});
 const go=async(route,cookie=session.cookie,method='GET')=>{
  const res=response();await runtime({method,url:route,headers:{cookie}},res);return res;
 };
 return {root,session,go,sessions,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('private portal, scripts and CSS require an active server-verified cookie',async()=>{
 const f=fixture();try{
  for(const url of ['/relationship-command/','/relationship-command/portal.js',
   '/relationship-command/portal.css']){
    const denied=await f.go(url,'');
    assert.equal(denied.status,401,url);
    const allowed=await f.go(url);
    assert.equal(allowed.status,200,url);
    assert.equal(allowed.headers['cache-control'],'private, no-store, max-age=0');
    assert.match(allowed.headers['content-security-policy'],/script-src 'self'/);
    assert.match(allowed.headers['content-security-policy'],/connect-src 'self'/);
    assert.equal(allowed.text.includes('Fictional Service Partner'),false);
  }
 }finally{f.cleanup();}
});
test('same session fetches its authorized scoped API, no write authority',async()=>{
 const f=fixture();try{
  const response=await f.go('/v1/relationship-command/workspace');
  assert.equal(response.status,200);
  const data=JSON.parse(response.text);
  assert.equal(data.entries.length,1);
  assert.equal(data.entries[0].display_name,'Fictional Service Partner');
  assert.equal(data.action_authority,'none');
  const blocked=await f.go('/v1/relationship-command/workspace','','GET');
  assert.equal(blocked.status,401);
 }finally{f.cleanup();}
});
test('portal rejects mutation, arbitrary routes and injected query parameters',async()=>{
 const f=fixture();try{
  const post=await f.go('/relationship-command/portal.js',f.session.cookie,'POST');
  assert.equal(post.status,405);
  const bad=await f.go('/relationship-command/?tenant=other');
  assert.equal(bad.status,400);
  const missing=await f.go('/relationship-command/private-records.json');
  assert.equal(missing.status,404);
  const apiWrite=await f.go('/v1/relationship-command/workspace',f.session.cookie,'DELETE');
  assert.equal(apiWrite.status,405);
 }finally{f.cleanup();}
});
test('client portal script is syntax-valid, read-only, and renders text safely',async()=>{
 const f=fixture();try{
  const js=(await f.go('/relationship-command/portal.js')).text;
  assert.doesNotThrow(()=>new vm.Script(js));
  assert.match(js,/fetch\(API,\{method:'GET'/);
  assert.match(js,/credentials:'same-origin'/);
  assert.doesNotMatch(js,/\.innerHTML\s*=/);
  assert.doesNotMatch(js,/\b(localStorage|sessionStorage|WebSocket|sendBeacon|XMLHttpRequest)\b/);
  assert.doesNotMatch(js,/fetch\([^)]*method:'POST'/);
  assert.doesNotMatch(js,/https?:\/\/api\.(stripe|resend)\.com/);
  assert.match(js,/textContent/);
 }finally{f.cleanup();}
});
test('session expiration prevents private portal access, including static assets',async()=>{
 const f=fixture();try{
  const sessionsFile=path.join(f.sessions,'customer-sessions.json');
  const doc=JSON.parse(fs.readFileSync(sessionsFile,'utf8'));
  doc.sessions[0].expires_at='2026-10-27T00:00:00Z';
  fs.writeFileSync(sessionsFile,JSON.stringify(doc),{mode:0o600});
  assert.equal((await f.go('/relationship-command/')).status,401);
  assert.equal((await f.go('/relationship-command/portal.css')).status,401);
  assert.equal((await f.go('/v1/relationship-command/workspace')).status,401);
 }finally{f.cleanup();}
});
