#!/usr/bin/env node
// Read-only public FindMyPart launch canary. Never charges, submits a form, or creates a customer.
import crypto from 'node:crypto';
const ORIGIN='https://fabric.systemiacommandcenters.com';
const observedAt=new Date().toISOString();
async function probe(path,kind){
 const target=ORIGIN+path;
 try{
  const res=await fetch(target,{method:'GET',redirect:'error',signal:AbortSignal.timeout(11000),headers:{accept:kind==='html'?'text/html':'image/svg+xml'}});
  const bytes=Buffer.from(await res.arrayBuffer());
  const text=bytes.toString('utf8');
  const titleGood=kind==='html'?text.includes('Missing part.')&&text.includes('Not the end.')&&
    ['Quick Hunt','Deep Hunt','Rescue Hunt','$19','$49','$99'].every(x=>text.includes(x))&&
    !/base44\.app/i.test(text):text.startsWith('<svg ')&&text.includes('FindMyPart');
  const ct=res.headers.get('content-type')||'';
  const typeGood=ct.includes(kind==='html'?'text/html':'image/svg+xml');
  const noindex=/noindex/i.test(res.headers.get('x-robots-tag')||'');
  const security=res.headers.get('x-content-type-options')==='nosniff';
  return {path,ok:res.status===200&&typeGood&&titleGood&&noindex&&security,status:res.status,
    content_type:ct,source_hash_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
    noindex,security,content_verified:titleGood};
 }catch(error){return {path,ok:false,error:String(error?.name||'network_error')}}
}
const results=await Promise.all([
 probe('/findmypart/','html'),
 probe('/findmypart/brand/mark.svg','svg'),
 probe('/findmypart/brand/launch-landscape.svg','svg'),
]);
const output={schema:'evercraft.findmypart.public-launch-canary.v1',observed_at_utc:observedAt,
 origin:ORIGIN,read_only:true,production_paid_checkout_verified:false,fulfillment_verified:false,
 statement:'Verifies branded public transport, headers and served content only. Does not establish payment settlement, buyer leads, or fulfillment.',
 public_brand_frontage_verified:results.every(x=>x.ok),results};
console.log(JSON.stringify(output,null,2));
if(!output.public_brand_frontage_verified)process.exitCode=1;
