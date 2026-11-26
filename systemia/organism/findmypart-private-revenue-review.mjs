// Reuse the canonical encrypted intake and exact quote catalog.
// No CRM write, contact, payment or fulfillment authority. Private references
// are available only to the existing owner inbox; company pulse sees counts.
import fs from 'node:fs';
import path from 'node:path';
import {readFindMyPartPrivateInquiry,validateFindMyPartInquiry} from '../mcp/findmypart-public-inquiry.mjs';
import {prepareFindMyPartQuote} from '../mcp/findmypart-private-quote.mjs';
import {reconcileGmailOutreach} from '../revenue-desk/gmail-reconciliation.mjs';
const flags={contains_buyer_pii:false,prior_contact_verified:false,buyers_qualified:0,outreach_authorized:false,payment_verified:false,fulfillment_authorized:false};
const base=()=>({schema:'evercraft.findmypart.inbound-revenue-review.v1',...flags,observed_inquiries:0,unique_case_candidates:0,duplicate_inquiries:0,invalid_inquiries:0,oldest_pending_ms:null});
function privateRoot(dir){
 if(!path.isAbsolute(dir)||fs.realpathSync(dir)!==dir)throw Error('private_inbox_path');
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('private_inbox_required');
}
const normal=x=>x.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
function readPrivate(file,limit){
 if(typeof file!=='string'||!path.isAbsolute(file)||fs.realpathSync(file)!==file)throw Error('private_history_path');
 privateRoot(path.dirname(file));
 const s=fs.lstatSync(file);
 if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>limit)throw Error('private_history_file');
 return fs.readFileSync(file);
}
// A positive contact observation is useful even on a bounded mailbox export.
// Absence is NEVER a clearance, even when a local export claims full history.
// No Gmail IDs, raw addresses, customer content or HMAC contact IDs leave here.
function observeContactHistory(records,{mailFile,hmacKeyFile,now}){
 const held=(state)=>({state,prior_outbound_observed:0,non_auto_inbound_observed:0,no_matching_mail_observed:0,contact_clearance_granted:false});
 if(!mailFile&&!hmacKeyFile)return {summary:held('not_bound'),byCase:new Map()};
 try{
  const snapshot=JSON.parse(readPrivate(mailFile,8*1024*1024).toString('utf8'));
  const secret=readPrivate(hmacKeyFile,4096).toString('utf8').trim();
  const age=+now-Date.parse(snapshot.observed_at);
  if(snapshot.schema!=='evercraft.systemia.gmail-owned-metadata-snapshot.v1'||snapshot.source!=='authenticated_gmail_readonly_api'||snapshot.provider_send_performed!==false||!Number.isFinite(age)||age<0||age>86400000||!Array.isArray(snapshot.messages)||snapshot.messages.length>20000||Buffer.byteLength(secret)<32)throw Error('history_unverified');
  const prospects=records.map(r=>({prospect_key:r.reference,business_email:r.email,stage:'researched',contact_state:'unknown'}));
  const report=reconcileGmailOutreach({messages:snapshot.messages,prospects,now:now.toISOString(),hmacKey:secret,historyComplete:false,providerDailyCap:null});
  if(report.record_coverage.invalid!==0||report.prospects.length!==prospects.length)throw Error('history_integrity');
  const summary=held('local_history_observed_not_authoritative'),byCase=new Map();
  for(let i=0;i<records.length;i++){
   const row=report.prospects[i],prior=row.prior_contact===true,inbound=Boolean(row.latest_inbound_ref);
   if(prior)summary.prior_outbound_observed++;
   if(inbound)summary.non_auto_inbound_observed++;
   if(!prior&&!inbound)summary.no_matching_mail_observed++;
   byCase.set(records[i].reference,{state:prior||inbound?'existing_contact_requires_thread_and_case_review':'no_match_in_available_snapshot_not_clearance',prior_outbound_observed:prior,non_auto_inbound_observed:inbound,contact_clearance_granted:false});
  }
  return {summary,byCase};
 }catch{return {summary:held('hold_history_binding_or_integrity'),byCase:new Map()};}
}
export function reviewFindMyPartInbound({storeDir,key,now=new Date(),enabled=false,mailFile=null,hmacKeyFile=null}={}){
 const out=base(),rows=[];
 if(!enabled)return {summary:{...out,state:'not_admitted'},rows};
 try{
  if(!storeDir||(Buffer.isBuffer(key)?key:Buffer.from(String(key||''),'base64')).length!==32||!Number.isFinite(+now))throw Error('missing_binding');
  privateRoot(storeDir);
  const names=fs.readdirSync(storeDir).filter(n=>/^FMP-[A-F0-9]{24}\.enc$/.test(n)).sort();
  // No partial dedup/coverage claim: above cap hold for an authorized paged
  // reader, not another independent inbox.
  if(names.length>500)return {summary:{...out,state:'hold_inbox_capacity'},rows};
  const records=[];
  for(const name of names){
   const reference=name.slice(0,-4);
   try{
    const s=fs.lstatSync(path.join(storeDir,name));
    if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>16384)throw Error('unsafe_record');
    const record=readFindMyPartPrivateInquiry({storeDir,key,reference});
    const checked=validateFindMyPartInquiry(record);
    const received=Date.parse(record.received_at);
    if(!checked.value||record.state!=='NEW_HUMAN_REVIEW_REQUIRED'||!Number.isFinite(received)||received>+now+60000)throw Error('invalid_inquiry');
    // Canonical quote builder validates consent, scope and offer catalog.
    const offers=['quick','deep','rescue'].map(tier=>{
     const q=prepareFindMyPartQuote(record,tier);
     return {tier,offer_key:q.offer_key,amount_cents:q.amount_cents};
    });
    const identity=JSON.stringify([normal(record.email),normal(record.part_description),normal(record.equipment_context)]);
    records.push({reference,received_at:record.received_at,received,identity,offers,email:record.email});
   }catch{out.invalid_inquiries++;}
  }
  out.observed_inquiries=names.length;
  // An unreadable entry may be a duplicate. Do not promote a partial scan.
  if(out.invalid_inquiries)return {summary:{...out,state:'hold_inbox_integrity'},rows};
  records.sort((a,b)=>a.received-b.received||a.reference.localeCompare(b.reference));
  const seen=new Set(),unique=[];
  for(const r of records){
   if(seen.has(r.identity)){out.duplicate_inquiries++;continue;}
   seen.add(r.identity);unique.push(r);
  }
  const history=observeContactHistory(unique,{mailFile,hmacKeyFile,now});
  out.contact_history=history.summary;
  for(const r of unique){
   const contact=history.byCase.get(r.reference)||{state:'history_unverified',contact_clearance_granted:false};
   rows.push({reference:r.reference,received_at:r.received_at,state:'consented_inquiry_requires_existing_revenue_desk_review',
    scope_options:r.offers,contact_history:contact,next_action:contact.state==='existing_contact_requires_thread_and_case_review'?'review_existing_thread_and_commitments_before_any_quote':'reconcile_existing_contact_and_case_history_then_select_exact_quote_scope',
    ...flags});
  }
  out.unique_case_candidates=rows.length;
  out.oldest_pending_ms=records.length?Math.max(0,+now-records[0].received):null;
  return {summary:{...out,state:rows.length?'consented_inquiries_require_review':'inbox_empty'},rows};
 }catch{return {summary:{...out,state:'hold_private_inbox_binding'},rows:[]};}
}
