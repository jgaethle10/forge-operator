#!/usr/bin/env node
// Independent non-transactional owner-hosted FindMyPart public launch witness.
// GET only: no PII, payment, lead creation, browsing analytics, or agent work.
import crypto from 'node:crypto';
import fs from 'node:fs';
const ORIGIN='https://fabric.systemiacommandcenters.com';
const observed_at_utc=new Date().toISOString();
const sha=(body)=>crypto.createHash('sha256').update(body).digest('hex');
const checks=[
 {route:'/findmypart/',source:'public/findmypart/index.html',type:'text/html',
   tokens:['Missing part.','Not the end.','part-request-form','Quick Hunt','Deep Hunt','Rescue Hunt','$19','$49','$99']},
 {route:'/findmypart/app.mjs',source:'public/findmypart/app.mjs',type:'javascript',
   tokens:['/api/findmypart/inquiry','/api/findmypart/readiness']},
 {route:'/findmypart/sample-report/',source:'public/findmypart/sample-report/index.html',type:'text/html',
   tokens:['Part Passport','ILLUSTRATIVE ONLY']},
 {route:'/findmypart/brand/hero-gear.jpg',source:'public/findmypart/brand/hero-gear.jpg',type:'image/jpeg',
   tokens:[]},
 {route:'/findmypart/brand/mark.svg',source:'public/findmypart/brand/mark.svg',type:'image/svg+xml',
   tokens:['FindMyPart']},
 {route:'/findmypart/brand/launch-landscape.svg',source:'public/findmypart/brand/launch-landscape.svg',type:'image/svg+xml',
   tokens:['FindMyPart']},
];
async function probe(spec){
 let expected='';
 try{expected=sha(fs.readFileSync(spec.source))}catch{return {route:spec.route,ok:false,reason:'source_file_not_available'}}
 try{
  const r=await fetch(ORIGIN+spec.route,{redirect:'error',signal:AbortSignal.timeout(11000),
    headers:{accept:spec.type}});
  const bytes=Buffer.from(await r.arrayBuffer());
  const body=bytes.toString('utf8');
  const ct=r.headers.get('content-type')||'';
  const noindex=(r.headers.get('x-robots-tag')||'').toLowerCase().includes('noindex');
  const nosniff=r.headers.get('x-content-type-options')==='nosniff';
  const source_sha256=sha(bytes);
  const copy_verified=spec.tokens.every(word=>body.includes(word))&&!/base44\.app/i.test(body);
  return {route:spec.route,ok:r.status===200&&ct.includes(spec.type)&&noindex&&nosniff&&
    copy_verified&&source_sha256===expected,status:r.status,content_type:ct,
    noindex,nosniff,copy_verified,exact_source_verified:source_sha256===expected,
    public_sha256:source_sha256,expected_source_sha256:expected};
 }catch(e){return {route:spec.route,ok:false,error:String(e?.name||'fetch_failed')}}
}
async function readiness(){
 try{
  const r=await fetch(ORIGIN+'/api/findmypart/readiness',{method:'GET',redirect:'error',
   signal:AbortSignal.timeout(11000),headers:{accept:'application/json'}});
  const x=await r.json().catch(()=>null);
  if(r.status!==200||x?.schema!=='evercraft.findmypart.intake-readiness.v1')
   return {ok:false,status:r.status,reason:'unexpected_readiness_contract'};
  return {ok:x.intake_available===true,status:r.status,
   intake_available:x.intake_available===true,
   payment_ready:false,payment_verified:false};
 }catch(e){return {ok:false,error:String(e?.name||'fetch_failed')}}
}
const [pages,intake]=await Promise.all([Promise.all(checks.map(probe)),readiness()]);
const public_brand_frontage_verified=pages.every(x=>x.ok);
const public_customer_intake_verified=public_brand_frontage_verified&&intake.ok===true;
const report={schema:'evercraft.findmypart.independent-public-release-proof.v2',
  observed_at_utc,origin:ORIGIN,read_only:true,
  public_brand_frontage_verified,public_customer_intake_verified,
  production_paid_checkout_verified:false,fulfillment_verified:false,
  statement:'Independent GET-only source readback. Never verifies a buyer transaction, payment, or delivery.',
  pages,intake};
console.log(JSON.stringify(report,null,2));
if(!public_customer_intake_verified)process.exitCode=1;
