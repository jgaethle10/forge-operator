// Reuse the canonical encrypted intake and exact quote catalog.
// No CRM write, contact, payment or fulfillment authority. Private references
// are available only to the existing owner inbox; company pulse sees counts.
import fs from 'node:fs';
import path from 'node:path';
import {readFindMyPartPrivateInquiry,validateFindMyPartInquiry} from '../mcp/findmypart-public-inquiry.mjs';
import {prepareFindMyPartQuote} from '../mcp/findmypart-private-quote.mjs';
const flags={contains_buyer_pii:false,prior_contact_verified:false,buyers_qualified:0,outreach_authorized:false,payment_verified:false,fulfillment_authorized:false};
const base=()=>({schema:'evercraft.findmypart.inbound-revenue-review.v1',...flags,observed_inquiries:0,unique_case_candidates:0,duplicate_inquiries:0,invalid_inquiries:0,oldest_pending_ms:null});
function privateRoot(dir){
 if(!path.isAbsolute(dir)||fs.realpathSync(dir)!==dir)throw Error('private_inbox_path');
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('private_inbox_required');
}
const normal=x=>x.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export function reviewFindMyPartInbound({storeDir,key,now=new Date(),enabled=false}={}){
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
    records.push({reference,received_at:record.received_at,received,identity,offers});
   }catch{out.invalid_inquiries++;}
  }
  out.observed_inquiries=names.length;
  // An unreadable entry may be a duplicate. Do not promote a partial scan.
  if(out.invalid_inquiries)return {summary:{...out,state:'hold_inbox_integrity'},rows};
  records.sort((a,b)=>a.received-b.received||a.reference.localeCompare(b.reference));
  const seen=new Set();
  for(const r of records){
   if(seen.has(r.identity)){out.duplicate_inquiries++;continue;}
   seen.add(r.identity);
   rows.push({reference:r.reference,received_at:r.received_at,state:'consented_inquiry_requires_existing_revenue_desk_review',
    scope_options:r.offers,next_action:'reconcile_existing_contact_and_case_history_then_select_exact_quote_scope',
    ...flags});
  }
  out.unique_case_candidates=rows.length;
  out.oldest_pending_ms=records.length?Math.max(0,+now-records[0].received):null;
  return {summary:{...out,state:rows.length?'consented_inquiries_require_review':'inbox_empty'},rows};
 }catch{return {summary:{...out,state:'hold_private_inbox_binding'},rows:[]};}
}
