#!/usr/bin/env node
// Unify existing Evercraft signals into one review queue. No send/payment authority.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {processEntries} from './penguin-revenue-desk.mjs';
import {rankClientSignals} from '../systemia/proof-first-sales/client-qualifier.mjs';

const read=(file,fallback)=>file&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;
const array=(data,field)=>Array.isArray(data)?data:Array.isArray(data?.[field])?data[field]:[];
export function createRevenueQueue({webProspects=[],clientSignals=[],suppressedBusinesses=[],now=new Date()}={}){
  const web=processEntries(webProspects);
  const ranked=rankClientSignals(clientSignals,now);
  const suppress=new Set(suppressedBusinesses.map(x=>String(x).trim().toLowerCase()).filter(Boolean));
  const ids=new Set();
  let suppressedCount=0;
  const queue=[];
  for(const lead of web.qualified){
    if(suppress.has(lead.company.toLowerCase())){suppressedCount++;continue}
    ids.add(lead.id);
    queue.push({source:'website_observation',id:lead.id,business:lead.company,
      stage:'review_evidence',evidence:lead.observed,offer:'Systemia Website Audit',
      draft:lead.draft,send_authorized:false,buyer_confirmed:false});
  }
  for(const lead of ranked){
    if(suppress.has(lead.business.toLowerCase())){suppressedCount++;continue}
    const id='client:'+lead.prospect_key;
    if(ids.has(id))continue;
    ids.add(id);
    queue.push({source:'client_signal',id,business:lead.business,stage:lead.disposition,
      evidence_refs:lead.evidence_refs,observed_at:lead.observed_at,
      matched_offers:lead.matched_offers,score:lead.score,next_action:lead.next_action,
      outreach_preflight:lead.outreach_preflight,send_authorized:false,
      buyer_confirmed:false});
  }
  const counts=queue.reduce((a,r)=>(a[r.stage]=(a[r.stage]||0)+1,a),{});
  return {schema:'evercraft.penguin.revenue-review-queue.v1',generated_at:now.toISOString(),
    summary:{total:queue.length,website: web.qualified.length,client_signals:ranked.length,
      rejected_website:web.rejected.length,suppressed:suppressedCount,by_stage:counts},queue,
    rejected:web.rejected,authority:{can_send:false,can_charge:false,
      interaction_ledger_and_passport_check_required:true,
      approved_exact_message_required:true,paid_receipt_required_for_revenue:true}};
}
export function main(args=process.argv.slice(2)){
  const get=(key)=>{const i=args.indexOf(key);return i<0?null:args[i+1]};
  if(!get('--out'))throw Error('Usage: node scripts/penguin-revenue-queue.mjs --out /private/queue.json [--web /private/prospects.json] [--signals /private/signals.json] [--suppress /private/suppressed.json]');
  const out=path.resolve(get('--out'));
  if(!out.startsWith(path.join(os.homedir(),'.local','state','evercraft')+path.sep))
    throw Error('output_must_be_in_private_evercraft_state');
  const inputFiles=[get('--web'),get('--signals'),get('--suppress')].filter(Boolean);
  for(const f of inputFiles){if(fs.statSync(f).size>1_000_000)throw Error('input_too_large')}
  const result=createRevenueQueue({webProspects:array(read(get('--web'),[]),'prospects'),
    clientSignals:array(read(get('--signals'),[]),'signals'),
    suppressedBusinesses:array(read(get('--suppress'),[]),'businesses')});
  fs.mkdirSync(path.dirname(out),{recursive:true,mode:0o700});
  const tmp=out+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
  fs.renameSync(tmp,out);
  console.log(JSON.stringify({out,summary:result.summary,send_authorized:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main()}catch(e){console.error(e.message);process.exitCode=1}
}
