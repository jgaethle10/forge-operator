#!/usr/bin/env node
// Penguin Revenue Desk: turn independently observed public-site facts into human-reviewed offers.
// No prospect scraping, unsolicited sending, payment assertions, or invented findings.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const OFFER_URL='https://fabric.systemiacommandcenters.com/offers/website-audit';
const MAX_ITEMS=200;
const MAX_FILE_BYTES=500_000;
const MAX_TEXT=300;
const ALLOWED=new Set(['missing_contact_cta','unclear_primary_offer','mobile_layout_issue','broken_contact_link','unclear_service_area','slow_page_observed','other']);

function cleaned(v,max=MAX_TEXT){
  return typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
}
function safeSite(raw){
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
    const h=url.hostname.toLowerCase();
    if(!h.includes('.')||!(/^[a-z0-9.-]+$/).test(h)||h==='localhost'||h.endsWith('.local')||
      h.endsWith('.internal')||h.endsWith('.localhost')||/^\d+(\.\d+){3}$/.test(h))return null;
    url.hash='';url.search='';
    return url.toString();
  }catch{return null}
}
export function qualify(entry){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return {ok:false,reason:'invalid_entry'};
  const company=cleaned(entry.company,120);
  const site=safeSite(entry.site);
  if(!company||!site)return {ok:false,reason:'company_or_public_https_site_missing'};
  if(!Array.isArray(entry.observations)||entry.observations.length===0)return {ok:false,reason:'no_observations'};
  const facts=[];
  for(const item of entry.observations.slice(0,8)){
    if(!item||!ALLOWED.has(item.issue))continue;
    const evidence=cleaned(item.evidence);
    const source=safeSite(item.source);
    const checked_at=cleaned(item.checked_at,32);
    if(!evidence||!source||!/^\d{4}-\d{2}-\d{2}$/.test(checked_at))continue;
    if(new URL(source).hostname!==new URL(site).hostname)continue;
    if(Number.isNaN(Date.parse(checked_at+'T00:00:00Z')))continue;
    facts.push({issue:item.issue,evidence,source,checked_at});
  }
  if(!facts.length)return {ok:false,reason:'no_verifiable_first_party_observations'};
  const email=cleaned(entry.contact_email,200).toLowerCase();
  const contact_email=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)?email:null;
  const contact_name=cleaned(entry.contact_name,100)||null;
  const uid=crypto.createHash('sha256').update(site).digest('hex').slice(0,12);
  return {ok:true,record:{id:'EC-PROSPECT-'+uid,company,site,contact_name,contact_email,
    observed:facts,stage:'needs_human_review',payment_status:'not_checked',sent:false}};
}
export function draftOffer(record){
  const fact=record.observed[0];
  const greeting=record.contact_name?'Hi '+record.contact_name+',':'Hello,';
  // Evidence is quoted as an observation, not asserted as a verified defect.
  const subject='A specific website observation for '+record.company;
  const body=[greeting,'',
    'I was reviewing '+record.company+'\'s public website and noticed something worth checking:',
    'On '+fact.checked_at+', at '+fact.source+':',
    '“'+fact.evidence+'”','',
    'That may be affecting how visitors understand the next step. I haven\'t measured your conversion rate, so I wouldn\'t claim lost sales.',
    'Evercraft offers a $49 Quick Win Website Audit: a bounded homepage review and five prioritized improvements.',
    'Here is the offer page if it would be useful: '+OFFER_URL,
    '',
    'Would you like me to explain what the audit would cover for your site?','',
    'Evercraft'].join('\n');
  return {subject,body,review_required:true,send_authorized:false};
}
export function processEntries(entries){
  if(!Array.isArray(entries)||entries.length>MAX_ITEMS)throw Error('Expected up to 200 entries');
  const seen=new Set(),qualified=[],rejected=[];
  for(const entry of entries){
    const result=qualify(entry);
    if(!result.ok){rejected.push({company:cleaned(entry?.company,120),reason:result.reason});continue}
    if(seen.has(result.record.id)){rejected.push({company:result.record.company,reason:'duplicate_site'});continue}
    seen.add(result.record.id);
    qualified.push({...result.record,draft:draftOffer(result.record)});
  }
  return {schema:'evercraft.penguin.revenue-desk.v1',created_at:new Date().toISOString(),
    offer:OFFER_URL,qualified,rejected,notes:['Drafts require evidence verification and human review before sending.',
      'No email was sent, no payment was verified, and no revenue was booked.']};
}
export function runCli(args=process.argv.slice(2)){
  if(args.length!==2||args[0]!=='--input')throw Error('Usage: node scripts/penguin-revenue-desk.mjs --input /path/to/prospects.json');
  const stat=fs.statSync(args[1]);
  if(!stat.isFile()||stat.size>MAX_FILE_BYTES)throw Error('Input too large or not a file');
  const data=JSON.parse(fs.readFileSync(args[1],'utf8'));
  const result=processEntries(data);
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{runCli()}catch(error){console.error(error.message);process.exitCode=1}
}
