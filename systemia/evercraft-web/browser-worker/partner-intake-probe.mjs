#!/usr/bin/env node
/**
 * Real Evercraft Browser Worker public-page probe for B2B partner intake.
 * Uses the owned Playwright/Chromium worker via its loopback API.
 * DO NOT submit forms, authenticate, accept terms, pay, or export private records.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ORIGIN = String(process.env.EVERCRAFT_BROWSER_LOCAL_URL || 'http://127.0.0.1:18787').replace(/\/$/, '');
const TOKEN = String(process.env.EVERCRAFT_BROWSER_WORKER_TOKEN || '');
if (!TOKEN) throw new Error('evercraft_browser_worker_token_required');
const OUT = path.resolve(process.env.EVERCRAFT_PARTNER_PROBE_OUTPUT || 'artifacts/evercraft/partner-intake');
fs.mkdirSync(OUT, {recursive:true});
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const sites = [
  {id:'defined-ai',url:'https://defined.ai/partnership-programs',intake:'AI Service Supplier / Data Partner; Jira login required'},
  {id:'scale-ai',url:'https://scale.com/data-partnership',intake:'Book an intro; founder fit review required'},
  {id:'handshake-ai',url:'https://joinhandshake.com/ai/dp-redesign/',intake:'Talk to our team; founder fit review required'},
  {id:'opentrain-ai',url:'https://www.opentrain.ai/',intake:'Data labeling companies: find clients and recruit talent; account review required'},
  {id:'datatoorder',url:'https://datatoorder.com/sell-ai-training-data/',intake:'Supplier-capacity intake; commercial buyer match not guaranteed'}
];
function cleanUrl(value) {
  try {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol)) return null;
    u.username='';u.password='';u.search='';u.hash='';
    return u.toString();
  } catch {return null;}
}
async function jsonAt(url,options={},ms=46000) {
  const c=new AbortController();
  const timer=setTimeout(()=>c.abort(),ms);
  try {
    const r=await fetch(url,{...options,signal:c.signal});
    const body=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error('browser_http_'+r.status+':'+String(body.error||'unknown').slice(0,160));
    return body;
  } finally {clearTimeout(timer);}
}
const receipt={
  schema:'evercraft.browser.partner-intake.public-get-proof.v1',
  observed_at:new Date().toISOString(),
  execution:'owned_browser_worker_on_ephemeral_github_runner',
  not_an_owned_physical_node_attestation:true,
  action:'browser_read_only',
  external_forms_submitted:0,
  accounts_created:0,
  legal_terms_accepted:false,
  credentials_provided:false,
  payments_attempted:false,
  sites:[]
};
try {
  const health=await jsonAt(ORIGIN+'/healthz',{},6000);
  if(health.ok!==true||health.service!=='evercraft-owned-browser-worker')
    throw new Error('owned_browser_worker_health_contract_failed');
  receipt.worker_engine=health.engine;
  receipt.worker_health_verified=true;
  for(const site of sites){
    const row={
      id:site.id,
      requested_url:site.url,
      intake_note:site.intake,
      state:'pending',
      submitted:false,
      pages_rendered:0,
      title:null,
      http_status:null,
      screenshot_path:null,
      screenshot_sha256:null,
      page_text_sha256:null,
      candidate_links:[],
      page_clues:[],
      anonymous_form_shapes:[],
      blocker:null
    };
    try {
      const result=await jsonAt(ORIGIN+'/v1/browse',{
        method:'POST',
        headers:{'content-type':'application/json','authorization':'Bearer '+TOKEN},
        body:JSON.stringify({
          url:site.url,
          timeout_ms:25000,
          max_text_chars:25000,
          include_screenshot:true,
          include_screenshot_base64:true,
          actions:[{type:'scroll',x:0,y:400}]
        })
      },45000);
      if(result.ok!==true||result.engine!=='evercraft-owned-browser-worker-v1')
        throw new Error('wrong_browser_engine');
      if(result.boundaries?.form_submit_action_supported!==false ||
         result.boundaries?.arbitrary_click_action_supported!==false ||
         (result.boundaries?.allowed_network_methods||[]).join(',')!=='GET,HEAD,OPTIONS')
        throw new Error('worker_side_effect_boundary_regression');
      const snap=result.snapshot||{};
      row.state='public_page_rendered';
      row.pages_rendered=1;
      row.title=String(snap.title||'').slice(0,180);
      row.http_status=result.http_status;
      row.final_url=cleanUrl(result.final_url);
      row.page_text_sha256=result.text_sha256;
      row.evidence_receipt_sha256=result.evidence_receipt_sha256;
      row.candidate_links=(snap.links||[])
        .filter(l=>/partner|apply|contact|talk|intro|start|register|join|signup|sign up|supplier|data/i.test(l.text||''))
        .slice(0,12).map(l=>({label:String(l.text||'').slice(0,90),url:cleanUrl(l.href)}))
        .filter(l=>l.url);
      // Only structural input metadata from a fresh unauthenticated context.
      // Explicitly omit values, placeholders, hidden fields and sensitive tokens.
      row.anonymous_form_shapes=(snap.forms||[]).slice(0,8).map(form=>({
        method:form.method,
        action_origin:form.action_origin,
        fields:(form.fields||[]).filter(f=>f.type!=='hidden'&&!/token|csrf|secret|password/i.test(f.name||''))
          .slice(0,25).map(f=>({tag:f.tag,type:f.type,name:f.name,required:f.required}))
      }));
      const text=String(snap.text||'');
      for(const kw of ['AI Service Supplier','Data Partner','coding','Book an intro','Talk to our team','40+','login','Jira']){
        const k=text.toLowerCase().indexOf(kw.toLowerCase());
        if(k>=0)row.page_clues.push({term:kw,context:text.slice(Math.max(0,k-60),Math.min(text.length,k+130)).slice(0,190)});
      }
      if(result.screenshot?.base64){
        const bytes=Buffer.from(result.screenshot.base64,'base64');
        if(hash(bytes)!==result.screenshot.sha256) throw new Error('screenshot_hash_mismatch');
        const shot=path.join(OUT,site.id+'.png');
        fs.writeFileSync(shot,bytes);
        row.screenshot_path=path.relative(process.cwd(),shot);
        row.screenshot_sha256=result.screenshot.sha256;
      } else if(result.screenshot?.sha256){
        row.screenshot_sha256=result.screenshot.sha256;
      }
    }catch(error){
      row.state='public_probe_blocked';
      row.blocker=String(error?.message||error).slice(0,250);
    }
    receipt.sites.push(row);
    console.log(site.id+': '+row.state+(row.blocker?' ('+row.blocker+')':''));
  }
}catch(error){
  receipt.worker_health_verified=false;
  receipt.worker_blocker=String(error?.message||error).slice(0,250);
}
receipt.public_pages_rendered=receipt.sites.filter(s=>s.pages_rendered===1).length;
receipt.total_sites=sites.length;
receipt.confirmed_applications=0;
receipt.next_gate='Human-reviewed supplier eligibility, ephemeral authorized Control Room, manual final submit, independent confirmation.';
receipt.receipt_sha256='sha256:'+hash(JSON.stringify(receipt));
const file=path.join(OUT,'receipt.json');
fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n');
console.log('EVERCRAFT_PARTNER_INTAKE_RECEIPT '+JSON.stringify({
  observed_at:receipt.observed_at,
  worker_health_verified:receipt.worker_health_verified,
  public_pages_rendered:receipt.public_pages_rendered,
  total_sites:receipt.total_sites,
  confirmed_applications:0,
  receipt_sha256:receipt.receipt_sha256
}));
if(receipt.worker_health_verified!==true||receipt.public_pages_rendered===0)process.exitCode=2;
