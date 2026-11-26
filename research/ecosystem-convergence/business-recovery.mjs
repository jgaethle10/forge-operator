// Candidate cross-capability review packet only; not a new sales router or worker.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function route(review, doors) {
 const result={schema:'evercraft.ecosystem.business-recovery.review.v1',state:'HOLD',reason:null,candidates:[],existing_workflow:'legacy-rescue-opportunity-watch',execution_authorized:false,outreach_authorized:false,checkout_created:false,payment_verified:false,publication_authorized:false};
 const hold=reason=>({...result,reason});
 if(!review||review.schema!=='evercraft.ecosystem.business-recovery.input.v1'||!Array.isArray(review.findings)||review.findings.length===0||review.findings.length>25)return hold('invalid_review');
 if(review.private_access_authorized!==false||review.execution_authorized!==false||review.outreach_authorized!==false||review.payment_authorized!==false)return hold('authority_boundary');
 const known={
  public_site_performance:'audit-center-website-audit-machine-v1',
  public_site_conversion:'audit-center-website-audit-machine-v1',
  documented_broken_business_software:'legacy-rescue-lab-v1',
  documented_abandoned_application:'legacy-rescue-lab-v1',
  documented_ibmi_modernization_need:'ibmi-rescue-v1'
 };
 const expected={
  'audit-center-website-audit-machine-v1':[49,'payment_ready'],
  'legacy-rescue-lab-v1':[299,'human_handoff_ready'],
  'ibmi-rescue-v1':[250,'direct_checkout_ready']
 };
 const groups=new Map();
 for(const f of review.findings){
  if(!f||!Object.hasOwn(known,f.kind)||!['public_observation','owner_supplied_need'].includes(f.evidence_type)||typeof f.evidence_ref!=='string'||!/^sha256:[0-9a-f]{64}$/.test(f.evidence_ref)||f.buyer_intent_verified!==false&&f.buyer_intent_verified!==true)return hold('unsupported_or_unbound_finding');
  if(f.kind.startsWith('documented_')&&f.evidence_type!=='owner_supplied_need'&&!f.buyer_intent_verified)return hold('technology_presence_not_need');
  const id=known[f.kind];if(!groups.has(id))groups.set(id,new Set());groups.get(id).add(f.evidence_ref);
 }
 // One review packet may contain multiple capabilities, not multiple pitches.
 for(const [id,refs] of groups){
  const d=doors[id],e=expected[id];if(!d||d.public_id!==id||d.commercial_state!=='sell_now'||d.machine_state!==e[1]||d.entry_paid_offer?.price_usd_normalized!==e[0])return hold('registered_offer_changed_or_missing');
  result.candidates.push({capability_id:id,registered_entry_price_usd:e[0],source_machine_state:d.machine_state,evidence_refs:[...refs].sort(),next:'operator_review_existing_offer_and_buyer_fit',human_handoff_only:true,checkout_authorized:false});
 }
 result.candidates.sort((a,b)=>a.capability_id.localeCompare(b.capability_id));
 result.state='REVIEW_CANDIDATE';result.reason='source_contract_only_no_live_quote_or_buyer_contact';return result;
}
function tests(){
 const door=(id,price,state)=>({public_id:id,commercial_state:'sell_now',machine_state:state,entry_paid_offer:{price_usd_normalized:price}});
 const d={'audit-center-website-audit-machine-v1':door('audit-center-website-audit-machine-v1',49,'payment_ready'),'legacy-rescue-lab-v1':door('legacy-rescue-lab-v1',299,'human_handoff_ready'),'ibmi-rescue-v1':door('ibmi-rescue-v1',250,'direct_checkout_ready')};
 const f={kind:'public_site_conversion',evidence_type:'public_observation',evidence_ref:'sha256:'+'a'.repeat(64),buyer_intent_verified:false};
 const r={schema:'evercraft.ecosystem.business-recovery.input.v1',findings:[f,f],private_access_authorized:false,execution_authorized:false,outreach_authorized:false,payment_authorized:false};
 let n=0;const check=v=>{if(!v)throw Error('fixture_failed_'+n);n++};
 let a=route(r,d);check(a.state==='REVIEW_CANDIDATE'&&a.candidates.length===1&&a.candidates[0].evidence_refs.length===1);check(!a.execution_authorized&&!a.checkout_created&&!a.payment_verified);
 check(route({...r,outreach_authorized:true},d).state==='HOLD');
 check(route({...r,findings:[{...f,evidence_ref:'unbound'}]},d).state==='HOLD');
 check(route({...r,findings:[{...f,kind:'documented_ibmi_modernization_need'}]},d).reason==='technology_presence_not_need');
 a=route({...r,findings:[{...f,kind:'documented_ibmi_modernization_need',evidence_type:'owner_supplied_need'}]},d);check(a.candidates[0].registered_entry_price_usd===250);
 a=route({...r,findings:[{...f,kind:'documented_abandoned_application',evidence_type:'owner_supplied_need'}]},d);check(a.candidates[0].registered_entry_price_usd===299&&a.candidates[0].human_handoff_only);
 check(route(r,{}).state==='HOLD');
 check(route(r,{...d,'audit-center-website-audit-machine-v1':door('audit-center-website-audit-machine-v1',50,'payment_ready')}).state==='HOLD');
 check(route({...r,findings:[f,{...f,kind:'documented_abandoned_application',evidence_type:'owner_supplied_need'}]},d).candidates.length===2);
 return {state:'PASS',assertions:n,scope:'synthetic fixtures only'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 if(process.argv[2]==='--self-test')console.log(JSON.stringify(tests()));
 else if(process.argv[2]==='--review'&&process.argv[3]){
  const file=process.argv[3];if(fs.statSync(file).size>65536)throw Error('input_limit');
  const doors=Object.fromEntries(['audit-center-website-audit-machine-v1','legacy-rescue-lab-v1','ibmi-rescue-v1'].map(id=>[id,JSON.parse(fs.readFileSync(path.join(root,'public/chum/intents',id,'offer.json'),'utf8'))]));
  console.log(JSON.stringify(route(JSON.parse(fs.readFileSync(file,'utf8')),doors),null,2));
 }else throw Error('explicit_review_or_self_test_required');
}
