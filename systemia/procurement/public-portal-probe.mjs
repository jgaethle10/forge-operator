#!/usr/bin/env node
/**
 * Actual first-party Evercraft Browser Worker GET-only probe against public WA state portals.
 * No login, form filling, external POST, state change or applicant data.
 * Run only through the existing owned loopback /v1/browse worker.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const ORIGIN=String(process.env.EVERCRAFT_BROWSER_LOCAL_URL||'http://127.0.0.1:18788').replace(/\/$/,'');
const TOKEN=String(process.env.EVERCRAFT_BROWSER_WORKER_TOKEN||'');
if(!TOKEN) throw new Error('owned_worker_token_required');
const OUTPUT=path.resolve(process.env.EVERCRAFT_GOVERNMENT_PROBE_OUTPUT||'artifacts/evercraft/government-portal');
fs.mkdirSync(OUTPUT,{recursive:true});
const sites=[
  {id:'dshs-hrsn-guidance',url:'https://www.dshs.wa.gov/information-potential-medicaid-contractors'},
  {id:'omwbe-pwsbe',url:'https://omwbe.wa.gov/certification/public-works-small-business-enterprise'},
  {id:'des-vendor-guidance',url:'https://des.wa.gov/do-business-state/how-work-state/register-bid-opportunities'},
];
const digest=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
async function callJson(uri,options={},timeoutMs=40000){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(uri,{...options,signal:controller.signal});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error('worker_http_'+response.status);
    return body;
  }finally{clearTimeout(timeout);}
}
const receipt={
  schema:'evercraft.procurement.owned-public-portal-canary.v1',
  mode:'public_get_only',
  runtime:'owned_browser_worker_on_ephemeral_github_ci',
  physical_evercraft_node_verified:false,
  authenticated_browser_session_created:false,
  applicant_data_collected:false,
  form_fields_filled:0,
  external_applications_submitted:0,
  legal_terms_accepted:false,
  payments_attempted:false,
  target_count:sites.length,
  pages:[],
  observed_at:new Date().toISOString(),
};
try{
  const health=await callJson(ORIGIN+'/healthz',{},5000);
  if(health.ok!==true||health.service!=='evercraft-owned-browser-worker')throw new Error('owned_worker_health_mismatch');
  receipt.worker_engine=health.engine;
  receipt.worker_health_verified=true;
  for(const site of sites){
    const row={id:site.id,origin:new URL(site.url).origin,state:'pending',http_status:null,title:null,body_sha256:null,receipt_sha256:null,screenshot_sha256:null,blocker:null};
    try{
      const result=await callJson(ORIGIN+'/v1/browse',{
        method:'POST',
        headers:{'content-type':'application/json',authorization:'Bearer '+TOKEN},
        body:JSON.stringify({url:site.url,timeout_ms:25000,max_text_chars:20000,actions:[],include_screenshot:true,include_screenshot_base64:false}),
      },40000);
      if(result.ok!==true||result.engine!=='evercraft-owned-browser-worker-v1')throw new Error('owned_browser_engine_mismatch');
      if(result.boundaries?.form_submit_action_supported!==false||
         result.boundaries?.arbitrary_click_action_supported!==false||
         (result.boundaries?.allowed_network_methods||[]).join(',')!=='GET,HEAD,OPTIONS')throw new Error('browser_side_effect_boundary_failed');
      if(!String(result.evidence_receipt_sha256||'').match(/^[a-f0-9]{64}$/))throw new Error('missing_evidence_digest');
      row.state='rendered_read_only';
      row.http_status=result.http_status;
      row.title=String(result.snapshot?.title||'').slice(0,160);
      row.body_sha256=result.text_sha256;
      row.receipt_sha256=result.evidence_receipt_sha256;
      row.screenshot_sha256=result.screenshot?.sha256||null;
    }catch(error){
      row.state='blocked';
      row.blocker=String(error?.message||error).slice(0,120);
    }
    receipt.pages.push(row);
    console.log(site.id+': '+row.state);
  }
}catch(error){
  receipt.worker_health_verified=false;
  receipt.worker_blocker=String(error?.message||error).slice(0,120);
}
receipt.rendered_count=receipt.pages.filter(p=>p.state==='rendered_read_only').length;
receipt.verification_state='public_page_read_only_only_no_agency_registration';
receipt.receipt_sha256=digest(JSON.stringify(receipt));
fs.writeFileSync(path.join(OUTPUT,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({schema:receipt.schema,rendered:receipt.rendered_count,targets:receipt.target_count,receipt_sha256:receipt.receipt_sha256,submitted:0}));
if(!receipt.worker_health_verified||receipt.rendered_count===0)process.exitCode=2;
