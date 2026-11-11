#!/usr/bin/env node
// ONTHEGO-GROWTH-001 | Saban scheduler + Radar read-only website journey
// No accounts, reservations, form submissions, messages, advertising, or remote node execution.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createWorkState } from '../../systemia/saban/work-state.mjs';
import { runScheduler } from '../../systemia/saban/scheduler.mjs';
import { admitMultiplicationRequest } from '../../systemia/saban/admission.mjs';
import { emptyRadarState, ingestRadarObservation, compileRadarEdition } from '../../systemia/radar/core.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = path.resolve('artifacts/onthego-growth-001');
fs.mkdirSync(out, {recursive:true});
const at = new Date().toISOString();
const tasks = [
  {id:'home',url:'https://onthego.theengagency.com/'},
  {id:'services',url:'https://onthego.theengagency.com/services/'},
  {id:'schedule',url:'https://onthego.theengagency.com/schedule/'},
  {id:'contact',url:'https://onthego.theengagency.com/contact-us/'},
  {id:'about',url:'https://onthego.theengagency.com/about-us/'},
  {id:'how',url:'https://onthego.theengagency.com/how-it-works/'},
  {id:'brand-domain',url:'https://onthegomo.com/'},
  {id:'schedule-desktop',url:'https://onthego.theengagency.com/schedule/',desktop:true},
];
const contract={
  software_id:'onthego-public-journey-v1',
  adapter:'supervised/onthego-public-browser-probe',
  roles:['public_observer'],
  default_logical_agents:tasks.length,
  max_logical_agents:tasks.length,
  default_physical_workers:2,
  max_physical_workers:2,
  lease_seconds:90,
  side_effects:{
    default:'deny', network:'approved_public_GET_HEAD_only',
    submit_forms:false, create_reservations:false, send_messages:false,
    charge:false, public_publish:false, remote_node_execution:false
  }
};
const admission=admitMultiplicationRequest({
  contract,requestedLogicalAgents:tasks.length,requestedPhysicalWorkers:2,
  requestedWorkItems:tasks.length,requestedAttempts:1,
  budget:{max_logical_agents:tasks.length,max_physical_workers:2,
    max_work_items:tasks.length,max_attempts_per_job:1}
});
if(!admission.admitted)throw Error('SABAN_MISSION_DENIED '+admission.reason);
const assignments=tasks.map((task,i)=>({
  agent_id:'onthego-agent-'+String(i+1).padStart(2,'0'),
  idempotency_key:crypto.createHash('sha256').update('onthego-public-journey-v1:'+task.id).digest('hex'),
  role:'public_observer',work:{kind:'website_page',key:task.id},
  item:{raw:task}
}));
const state=createWorkState({softwareId:contract.software_id,assignments,
  leaseSeconds:90,maxAttempts:1});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let blockedMethods=0;
let blockedNavigation=0;
const allowNav=new Set(['onthego.theengagency.com','onthegomo.com','www.onthegomo.com']);
const adapter={
  runAssignment:async ({assignment})=>{
    const task=assignment.item.raw;
    const context=await browser.newContext({
      viewport:task.desktop?{width:1280,height:800}:{width:390,height:844},
      deviceScaleFactor:1,
      userAgent:task.desktop?'Evercraft-SabanRadar-PublicQA/1.0':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ignoreHTTPSErrors:false,
      acceptDownloads:false
    });
    await context.route('**/*',async route=>{
      const request=route.request();
      if(!['GET','HEAD'].includes(request.method())){
        blockedMethods++;return route.abort('blockedbyclient');
      }
      if(request.isNavigationRequest()){
        try{
          const u=new URL(request.url());
          if(!allowNav.has(u.hostname)){blockedNavigation++;return route.abort('blockedbyclient');}
        }catch{blockedNavigation++;return route.abort('blockedbyclient');}
      }
      return route.continue();
    });
    const page=await context.newPage();
    const failures=[];
    page.on('pageerror',error=>failures.push(String(error.message).slice(0,260)));
    page.on('requestfailed',req=>{
      if(req.isNavigationRequest()) failures.push('navigation_failed:'+String(req.failure()?.errorText||'unknown').slice(0,160));
    });
    const started=Date.now();
    try{
      const response=await page.goto(task.url,{waitUntil:'domcontentloaded',timeout:19000});
      await page.waitForTimeout(3500);
      const snapshot=await page.evaluate(()=>{
        const text=(document.body?.innerText||'').replace(/\s+/g,' ').trim();
        const bodyHtml=(document.body?.innerHTML||'');
        const links=[...document.querySelectorAll('a[href]')].map(a=>({
          label:(a.innerText||a.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim().slice(0,65),
          href:a.href.slice(0,300)
        })).filter(x=>x.href);
        const candidates=[...document.querySelectorAll('[class*="calendar"],[id*="calendar"],[class*="booking"],[id*="booking"],[data-calendar],[class*="appointment"],[id*="appointment"]')];
        const visibleCount=candidates.filter(n=>{
          const r=n.getBoundingClientRect(),s=getComputedStyle(n);
          return r.width>8 && r.height>8 && s.visibility!=='hidden' && s.display!=='none';
        }).length;
        const visibleShortcode=/\[lc_calendar\b/i.test(text);
        return {
          title:document.title.slice(0,170),
          html_lang:document.documentElement.lang||'',
          canonical:document.querySelector('link[rel="canonical"]')?.href||null,
          visible_shortcode:visibleShortcode,
          shortcode_present_in_html:/\[lc_calendar\b/i.test(bodyHtml),
          visible_calendar_like_elements:visibleCount,
          calendar_candidate_count:candidates.length,
          visit_us_copy:/come and visit us today/i.test(text),
          mobile_service_copy:/we come to you|directly to you|doorstep|at your location|wherever you are/i.test(text),
          schedule_anchor_count:links.filter(a=>/schedul|book|appoint/i.test(a.label)).length,
          schedule_anchors:links.filter(a=>/schedul|book|appoint/i.test(a.label)).slice(0,12),
          form_count:document.querySelectorAll('form').length,
          input_count:document.querySelectorAll('input').length,
          service_starting_price_120_99:text.includes('$120.99'),
          has_contact_phone:text.includes('509-833-5025'),
          main_text_excerpt:text.slice(0,450),
          links_count:links.length
        };
      });
      const row={id:task.id,requested_url:task.url,final_url:page.url(),
        http_status:response?.status()||null,elapsed_ms:Date.now()-started,
        device:task.desktop?'desktop':'mobile',
        result:'observed',...snapshot,page_errors:failures.slice(0,10)};
      if(['schedule','home','services','schedule-desktop'].includes(task.id)){
        const png=path.join(out,'on-the-go-'+task.id+'.png');
        await page.screenshot({path:png,fullPage:false,animations:'disabled'});
        row.screenshot_file=path.basename(png);
        row.screenshot_sha256=crypto.createHash('sha256').update(fs.readFileSync(png)).digest('hex');
      }
      return row;
    }catch(error){
      return {id:task.id,requested_url:task.url,result:'unreachable_in_probe',
        error:String(error.message||error).slice(0,350),elapsed_ms:Date.now()-started,
        device:task.desktop?'desktop':'mobile',page_errors:failures.slice(0,8)};
    }finally{
      await context.close();
    }
  }
};
let scheduled;
try{
 scheduled=await runScheduler({
   state,adapter,physicalWorkers:2,
   plan:{software_id:contract.software_id,logical_agents:tasks.length,physical_workers:2,
     roles:contract.roles,execution_model:'saban_bounded_scheduled_workers'},
   contract
 });
}finally{await browser.close();}
const observations=Object.values(scheduled.state.jobs).map(j=>({
  id:j.work.key,agent_id:j.agent_id,attempts:j.attempts,worker:j.metrics?.worker_id,
  state:j.state,receipt:j.result||null,error:j.error||null
})).sort((a,b)=>a.id.localeCompare(b.id));
let radar=emptyRadarState();
const ingestReceipts=[];
for(const row of observations){
  const r=row.receipt;
  const observed=r?.result==='observed';
  const url=r?.final_url||r?.requested_url||'https://onthego.theengagency.com/';
  const concerns=[];
  if(observed&&r?.visible_shortcode)concerns.push('visible_calendar_shortcode');
  if(observed&&r?.visit_us_copy)concerns.push('visit_us_messaging_on_mobile_service_site');
  if(!observed)concerns.push('public_page_unreachable_during_probe');
  const finding={
    source_system:'onthego-growth-001-saban-ci',
    source_family:'browser-chromium-public-readonly',
    observed_at:at,
    region_key:'Yakima-WA',
    domains:['business_customer_journey','website_usability'],
    kind:'public_page_audit',
    evidence_state:'observed',
    reliability:observed?0.9:0.7,
    anomaly_score:concerns.length?0.8:0.18,
    summary:row.id+': '+(observed?'HTTP '+r.http_status:'unreachable in browser')+
      (concerns.length?'; '+concerns.join(', '):'; no flagged visible content issues'),
    provenance_refs:[url],
    correlation_keys:['onthego-page-'+row.id],
    facts:{subject_key:'onthego-page-'+row.id,subject:'On The Go public '+row.id,
      page_status:r?.http_status??null,concerns,
      booking_success_not_tested:true,customer_mutation:false}
  };
  const next=ingestRadarObservation(radar,finding,{now:at});
  radar=next.state;
  ingestReceipts.push({id:row.id,decision:next.decision});
}
const compiled=compileRadarEdition(radar,{now:at,materiality_threshold:0.0,max_signals:20});
const receipt={
 schema:'evercraft.onthego.growth-public-journey-audit.v1',
 mission_id:'ONTHEGO-GROWTH-001',
 observed_at:at,
 source_system:'actual Saban scheduler + Systemia Radar core',
 execution:'isolated GitHub CI; NOT Penguin or HP NodeSeed',
 permitted:'public GET/HEAD only; passive browser UI inspection',
 prohibited:'POST, customer submissions, checkout, appointments, publishing, private access',
 authorization:'founder-requested-public-read-only',
 admission,
 saban:{software_id:scheduled.summary?.software_id,worker_count:scheduled.worker_count,
   summary:scheduled.summary},
 blocked_methods:blockedMethods,blocked_navigation:blockedNavigation,
 pages:observations,
 radar:{status:compiled.edition.status,signal_count:compiled.edition.signal_count,
   change_wall:compiled.edition.change_wall,
   publication_authority:false},
 caveats:['Browser probe does not verify ability to complete a booking.',
   'Browser probe blocks POST, which can also block dynamic calendar loading.',
   'Published site may not be Juan primary canonical domain; confirm before edits.',
   'No sales, leads, traffic lift or customer acquisition claimed.']
};
fs.writeFileSync(path.join(out,'mission-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
fs.writeFileSync(path.join(out,'radar-private-qa.json'),JSON.stringify({ingestReceipts,
  radarState:radar,edition:compiled.edition},null,2)+'\n');
console.log(JSON.stringify({mission_id:receipt.mission_id,admitted:admission.admitted,
  summary:scheduled.summary,blocked_methods:blockedMethods,blocked_navigation:blockedNavigation,
  pages:observations.map(p=>({
    id:p.id,status:p.receipt?.http_status||null,result:p.receipt?.result||p.state,
    visible_shortcode:p.receipt?.visible_shortcode||false,
    visible_calendar_like_elements:p.receipt?.visible_calendar_like_elements||0,
    visit_us_copy:p.receipt?.visit_us_copy||false,
    url:p.receipt?.final_url||p.receipt?.requested_url||null
  })),
  radar:receipt.radar},null,2));
