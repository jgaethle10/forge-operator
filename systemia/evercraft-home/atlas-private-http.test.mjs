import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startEvercraftHomeServer} from './server.mjs';
import {EvercraftIdentity} from '../identity/identity.mjs';
import {EvercraftPassport} from '../passport/passport.mjs';

const SECRET='evercraft-atlas-home-test-only-secret-2026-11-25-fully-private';
const makeRoot=t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-home-gate-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return {root,atlas:path.join(root,'atlas'),identity:path.join(root,'identity'),passport:path.join(root,'passport')};
};
function authorize(passport,{product,scopes,resource_refs,key}){
 passport.issueGrant({
  idempotency_key:key,subject_ref:'user:owner',issuer_ref:'evercraft:identity-authority',
  product,scopes,...(resource_refs?{resource_refs}:{}),
  starts_at:'2025-01-01T00:00:00Z',ends_at:'2030-01-01T00:00:00Z',
  max_delegation_depth:0,authority_state:'verified_identity_authority',
  authority_receipt_ref:'test:authorized-human',
 });
}
async function setup(t,{grantAtlas=true}={}){
 const dirs=makeRoot(t),identity=new EvercraftIdentity({stateDir:dirs.identity});
 identity.bootstrapOwner({
  subjectRef:'user:owner',login:'owner',displayName:'Atlas Tester',
  password:'test-only-Atlas-owner-password-with-plenty-of-length',
  authorityReceiptRef:'test:bootstrap',
 });
 const authentication=identity.authenticatePassword({
  login:'owner',password:'test-only-Atlas-owner-password-with-plenty-of-length'
 });
 const signed=identity.issueSession(authentication,{signingSecret:SECRET,signingKeyId:'ci',ttlSeconds:1800});
 const passport=new EvercraftPassport({stateDir:dirs.passport});
 authorize(passport,{product:'evercraft-home',scopes:['home.read'],key:'home-grant'});
 if(grantAtlas) authorize(passport,{product:'systemia-atlas',
  scopes:['atlas.read','atlas.write'],resource_refs:['tenant:alpha'],key:'atlas-grant'});
 const runtime=await startEvercraftHomeServer({
  host:'127.0.0.1',port:0,authMode:'passport',
  identitySecret:SECRET,identityKeyId:'ci',
  identityStateDir:dirs.identity,passportStateDir:dirs.passport,
  atlasStateDir:dirs.atlas,atlasPrivateEnabled:true,
  credentialStateDir:'',cookieSecure:false,serviceOrigins:{}
 });
 t.after(async()=>runtime.close());
 const cookie='evercraft_session='+encodeURIComponent(signed.token);
 const url=runtime.url+'/api/atlas/private/alpha';
 const fetchPrivate=async(pathSuffix='',options={})=>{
  const {headers={},...rest}=options;
  return fetch(url+pathSuffix,{...rest,headers:{cookie,...headers}});
 };
 const post=(payload,headers={})=>fetchPrivate('/events',{
   method:'POST',
   headers:{origin:runtime.url,'content-type':'application/json',
    'x-evercraft-atlas-intent':'mutation-v1',...headers},
   body:JSON.stringify(payload)
 });
 return {dirs,identity,passport,runtime,cookie,fetchPrivate,post};
}
const shipper=(id='create-shp-1')=>({
 type:'shipper.created',payload:{name:'Demo Local Shipper',region:'Washington'},
 idempotency_key:id,expected_revision:0
});

test('Atlas private routes are absent in local mode and disabled mode',async t=>{
 const runtime=await startEvercraftHomeServer({
  port:0,host:'127.0.0.1',authMode:'local',credentialStateDir:'',atlasPrivateEnabled:false
 });
 t.after(async()=>runtime.close());
 const r=await fetch(runtime.url+'/api/atlas/private/alpha');
 assert.equal(r.status,404);assert.equal((await r.json()).state,'atlas_not_enabled');
});
test('Home rejects insecure Atlas opt-in configuration before network binding',async t=>{
 const dirs=makeRoot(t);
 await assert.rejects(()=>startEvercraftHomeServer({
  port:0,authMode:'local',atlasPrivateEnabled:true,atlasStateDir:dirs.atlas,
 }),/atlas_private_requires_passport_and_absolute_state/);
 await assert.rejects(()=>startEvercraftHomeServer({
  port:0,authMode:'passport',identitySecret:SECRET,identityStateDir:dirs.identity,
  passportStateDir:dirs.passport,atlasPrivateEnabled:true,atlasStateDir:'relative/path',
 }),/atlas_private_requires_passport_and_absolute_state/);
});
test('private Home read/write needs both Home login and exact Atlas tenant grant',async t=>{
 const {post,fetchPrivate}=await setup(t,{grantAtlas:false});
 let response=await fetchPrivate();
 assert.equal(response.status,403);
 response=await post(shipper());
 assert.equal(response.status,403);
});
test('private Home routes require signed Passport session even with Atlas grant',async t=>{
 const {runtime}=await setup(t);
 const response=await fetch(runtime.url+'/api/atlas/private/alpha');
 assert.equal(response.status,401);
 assert.equal((await response.json()).state,'atlas_home_session_required');
});
test('HTTP bridge enforces Origin, intent header, same-site and JSON before writes',async t=>{
 const {fetchPrivate,post,runtime}=await setup(t);
 let response=await post(shipper(),{origin:'https://evil.example'});
 assert.equal(response.status,403);
 response=await post(shipper(),{'x-evercraft-atlas-intent':'wrong'});
 assert.equal(response.status,403);
 response=await post(shipper(),{'sec-fetch-site':'cross-site'});
 assert.equal(response.status,403);
 response=await post(shipper(),{'content-type':'text/plain'});
 assert.equal(response.status,415);
 response=await fetchPrivate('/events',{method:'GET'});
 assert.equal(response.status,405);
 response=await fetchPrivate();
 assert.equal(response.status,200);
 assert.equal((await response.json()).snapshot.revision,0);
 assert.equal(runtime.authMode,'passport');
});
test('recorded load intake is private, durable and idempotent; no dispatch',async t=>{
 const {post,fetchPrivate,runtime}=await setup(t);
 const create=shipper();
 let response=await post(create);
 assert.equal(response.status,201);
 const first=await response.json();
 assert.equal(first.state,'recorded');assert.equal(first.external_action_performed,false);
 response=await post(create);
 assert.equal(response.status,200);assert.equal((await response.json()).state,'duplicate');
 response=await post({...create,idempotency_key:'create-shp-2',expected_revision:0});
 assert.equal(response.status,409);assert.equal((await response.json()).state,'atlas_revision_conflict');
 response=await fetchPrivate();
 assert.equal(response.status,200);
 const snapshot=(await response.json()).snapshot;
 assert.equal(snapshot.shippers.length,1);
 assert.equal(snapshot.revision,1);assert.equal(snapshot.dispatch_authorized,false);
 const shipperId=snapshot.shippers[0].id;
 response=await post({
  type:'load.opened',payload:{
   shipper_id:shipperId,origin:'Yakima, WA',destination:'Seattle, WA',equipment:'Dry van'
  },idempotency_key:'load-demo-1',expected_revision:1
 });
 assert.equal(response.status,201);
 const created=(await response.json()).record;
 assert.equal(created.dispatch_authorized,false);
 response=await post({
  type:'load.dispatched',payload:{load_id:created.id},idempotency_key:'send-real',expected_revision:2
 });
 assert.equal(response.status,400);
 response=await fetchPrivate();
 assert.equal((await response.json()).snapshot.revision,2);
 assert.equal(runtime.health!==undefined,true);
});
test('one tenant never sees a different tenant through a valid Home cookie',async t=>{
 const {cookie,runtime,fetchPrivate}=await setup(t);
 const r=await fetch(runtime.url+'/api/atlas/private/bravo',{headers:{cookie}});
 assert.equal(r.status,403);
 assert.equal((await r.json()).state,'atlas_access_denied');
 const snapshot=(await (await fetchPrivate()).json()).snapshot;
 assert.equal(snapshot.tenant_id,'alpha');
});
test('session revocation immediately denies Atlas private data',async t=>{
 const {identity,cookie,runtime}=await setup(t);
 const sessionEncoded=cookie.split('=')[1],token=decodeURIComponent(sessionEncoded);
 const payload=JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString());
 const before=await fetch(runtime.url+'/api/atlas/private/alpha',{headers:{cookie}});
 assert.equal(before.status,200);
 identity.revokeSession({sessionId:payload.session_id,subjectRef:'user:owner'});
 const after=await fetch(runtime.url+'/api/atlas/private/alpha',{headers:{cookie}});
 assert.equal(after.status,401);
});
test('strict Home response avoids credential echo and is not stored publicly',async t=>{
 const {post,fetchPrivate,dirs}=await setup(t);
 const res=await post({...shipper(),unexpected_role:'admin'});
 assert.equal(res.status,400);
 assert.equal(res.headers.get('cache-control'),'no-store');
 const body=await res.text();
 assert.equal(body.includes(SECRET),false);
 assert.equal(body.includes(dirs.root),false);
 assert.equal((await (await fetchPrivate()).json()).snapshot.revision,0);
});
