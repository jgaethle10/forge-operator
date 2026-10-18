import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
 verifyRescueManifest,selectVerifiedHealthyMirror,signTestEnvelope,REGISTRY_SCHEMAS
} from './verified-registry.mjs';

const primary=generateKeyPairSync('ed25519');
const intruder=generateKeyPairSync('ed25519');
const pem=primary.publicKey.export({type:'spki',format:'pem'});
const t=Date.parse('2026-10-18T07:00:00.000Z');
const host='example.org';
const targetA='https://edge-a.example.net/rescue/';
const targetB='https://edge-b.example.net/rescue/';
const policy=()=>({
 schema:REGISTRY_SCHEMAS.POLICY,subject_host:host,
 owner_key_pem:pem,authority_verified:true,minimum_revision:0,
 approved_mirror_origins:['https://edge-a.example.net','https://edge-b.example.net']
});
const payload=()=>({
 schema:REGISTRY_SCHEMAS.MANIFEST,subject_host:host,revision:7,
 issued_at:'2026-10-18T06:00:00.000Z',expires_at:'2026-10-19T06:00:00.000Z',
 notice:'This independent informational mirror is explicitly identified as an alternate route.',
 mirrors:[
  {url:targetA,priority:1,markers:['Example information page','Verified contact link']},
  {url:targetB,priority:2,markers:['Example information page','Verified contact link']}
 ]
});
const revoke=(floor=0,opts={})=>signTestEnvelope({
 schema:REGISTRY_SCHEMAS.REVOCATION,subject_host:host,revoked_through_revision:floor,
 issued_at:opts.issued_at||'2026-10-18T06:00:00.000Z',
 expires_at:opts.expires_at||'2026-10-19T06:00:00.000Z'
},opts.key||primary.privateKey);
const assess=(args={})=>verifyRescueManifest({
 envelope:signTestEnvelope(payload(),primary.privateKey),policy:policy(),
 revocationEnvelope:revoke(),expectedHost:host,now:t,...args
});
const blocked=(result,why)=>{assert.equal(result.verified,false);assert.equal(result.reason,why);assert.deepEqual(result.mirrors,[]);assert.equal(result.automatic_routing_authorized,false);};

test('accepts strictly pinned Ed25519 signature with fresh revocation and two mirrors',()=>{
 const a=assess();
 assert.equal(a.verified,true);
 assert.equal(a.revision,7);
 assert.deepEqual(a.mirrors.map(x=>x.url),[targetA,targetB]);
 assert.equal(a.original_domain_dns_control,false);
 assert.equal(a.opt_in_user_review_required,true);
 assert.equal(a.automatic_routing_authorized,false);
});

test('rejects a missing owner key and an unverified owner-claimed key',()=>{
 blocked(assess({policy:null}),'missing_verified_owner_trust_anchor');
 blocked(assess({policy:{...policy(),authority_verified:false}}),'missing_verified_owner_trust_anchor');
 blocked(assess({policy:{...policy(),owner_key_pem:intruder.publicKey.export({type:'spki',format:'pem'})}}),'invalid_owner_signature');
});

test('wrong signer cannot forge manifest even when its contents look correct',()=>{
 blocked(assess({envelope:signTestEnvelope(payload(),intruder.privateKey)}),'invalid_owner_signature');
 const bad=payload();bad.notice='This independent alternate is unofficial';
 blocked(assess({envelope:{payload:bad,signature:signTestEnvelope(payload(),primary.privateKey).signature}}),'invalid_owner_signature');
});

test('manifest for another host cannot stand in for original',()=>{
 const p=payload();p.subject_host='other.example.org';
 blocked(assess({envelope:signTestEnvelope(p,primary.privateKey)}),'invalid_or_expired_manifest');
});

test('expired and not-yet-valid manifests are never usable',()=>{
 blocked(assess({now:Date.parse('2026-10-19T06:00:00.000Z')}),'invalid_or_expired_manifest');
 blocked(assess({now:Date.parse('2026-10-18T05:59:59.000Z')}),'invalid_or_expired_manifest');
 const p=payload();p.expires_at='2026-10-25T06:00:00.000Z';
 blocked(assess({envelope:signTestEnvelope(p,primary.privateKey)}),'invalid_or_expired_manifest');
});

test('no revocation proof, forged revocation and stale proof all fail closed',()=>{
 blocked(assess({revocationEnvelope:null}),'missing_or_invalid_fresh_revocation_status');
 blocked(assess({revocationEnvelope:revoke(0,{key:intruder.privateKey})}),'missing_or_invalid_fresh_revocation_status');
 blocked(assess({revocationEnvelope:revoke(0,{expires_at:'2026-10-18T06:59:59.000Z'})}),'missing_or_invalid_fresh_revocation_status');
});

test('signed revocation and minimum revision prevent replay',()=>{
 blocked(assess({revocationEnvelope:revoke(7)}),'revoked_or_replayed_revision');
 blocked(assess({policy:{...policy(),minimum_revision:7}}),'revoked_or_replayed_revision');
 blocked(assess({policy:{...policy(),minimum_revision:8}}),'revoked_or_replayed_revision');
 assert.equal(assess({revocationEnvelope:revoke(6)}).verified,true);
});

test('manifest rejects ambiguous fields and host URL impersonations',()=>{
 for(const changes of [
  p=>{p.mirrors[0].url='https://edge-a.example.net.evil.example/rescue/';},
  p=>{p.mirrors[0].url='http://edge-a.example.net/rescue/';},
  p=>{p.mirrors[0].url='https://edge-a.example.net/rescue/?steal=true';},
  p=>{p.mirrors[0].url='https://edge-a.example.net:8443/rescue/';},
  p=>{p.mirrors[1].url=p.mirrors[0].url;},
  p=>{p.mirrors[0].priority=p.mirrors[1].priority;},
  p=>{p.mirrors[0].markers=['ok'];},
  p=>{p.unknown_field='injected';},
  p=>{p.mirrors[0].unknown='disagreement';},
  p=>{p.subject_host='donate.example.org';},
  p=>{p.mirrors[0].url='https://example.org/';},
 ]) {
  const p=payload();changes(p);
  blocked(assess({envelope:signTestEnvelope(p,primary.privateKey)}),'invalid_or_expired_manifest');
 }
});

test('verified manifest cannot automatically change routing',()=>{
 const a=assess();
 assert.equal(a.automatic_routing_authorized,false);
 assert.equal('updateDns' in a,false);
 assert.equal('registerDomain' in a,false);
});

test('health probe picks first genuinely healthy verified mirror, then fails over',async()=>{
 const manifest=assess();const urls=[];
 const fetchImpl=async (u,opts)=>{
  urls.push([u,opts.method,opts.redirect]);
  if(u===targetA)return new Response('[APP UNAVAILABLE]',{status:402,headers:{'content-type':'text/html'}});
  return new Response('<h1>Example information page</h1><a>Verified contact link</a>',{
   status:200,headers:{'content-type':'text/html'}
  });
 };
 const r=await selectVerifiedHealthyMirror({verifiedResult:manifest,fetchImpl});
 assert.deepEqual(r,{url:targetB,reason:'healthy_verified_mirror',priority:2});
 assert.deepEqual(urls.map(v=>v[0]),[targetA,targetB]);
 assert.ok(urls.every(x=>x[1]==='GET'&&x[2]==='error'));
});

test('HTML that lacks pinned markers is not accepted as a live mirror',async()=>{
 const r=await selectVerifiedHealthyMirror({
  verifiedResult:assess(),
  fetchImpl:async()=>new Response('<h1>Lookalike</h1>',{status:200,headers:{'content-type':'text/html'}})
 });
 assert.equal(r.url,null);
 assert.equal(r.reason,'all_verified_mirrors_unavailable');
});

test('unverified manifests never trigger fetches',async()=>{
 let calls=0;
 const r=await selectVerifiedHealthyMirror({verifiedResult:assess({policy:null}),fetchImpl:async()=>{calls++;throw Error('should not fetch');}});
 assert.equal(calls,0);
 assert.equal(r.url,null);
 assert.equal(r.reason,'unverified_manifest');
});
