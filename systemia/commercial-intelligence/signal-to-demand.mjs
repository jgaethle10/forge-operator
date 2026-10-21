import crypto from 'node:crypto';
const SOURCES=new Set(['rockies','radar','systemia_radar','faie','website_audit','systemia_website_audit']);
const MARKET_RANGES=new Set(['housing_construction','economy_labor','telecom','ai_models','public_policy_regulation']);
const MARKET_DOMAINS=new Set(['housing','construction','economy','labor','telecom','ai','public_policy','regulation','small_business']);
const DISALLOWED=new Set(['public_health','disaster','earth_hazards','emergency','politics','wildfire_smoke']);
const trim=(x,n=240)=>String(x??'').trim().slice(0,n);
const hash=(x)=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,20);
const validTime=(x)=>{const d=new Date(x);return Number.isFinite(d.valueOf())?d:null;};
function publicHttps(x){try{const u=new URL(trim(x,1600));return u.protocol==='https:'&&u.hostname.includes('.')&&!u.username&&!u.password?u.toString():null;}catch{return null;}}
function common(obs){
 return {
  schema:'evercraft.systemia.commercial-research-candidate.v1',
  id:'commercial-research:'+hash([obs.source_system,obs.observation_id]),
  source_system:trim(obs.source_system,80).toLowerCase(),
  observation_id:trim(obs.observation_id,250),
  observed_at:new Date(obs.observed_at).toISOString(),
  evidence_state:trim(obs.evidence_state||'unknown',80).toLowerCase(),
  source_families:[trim(obs.source_family,100)].filter(Boolean),
  provenance_refs:[...new Set(obs.provenance_refs.map(publicHttps).filter(Boolean))].slice(0,5),
  offer_key:'website-audit-quick-win',
  outreach_authority:false,
  publication_authority:false,
  payment_authority:false,
  content_is_instruction:false,
  source_authority_inherited:false
 };
}
export function translateObservation(obs,{now=new Date()}={}){
 const at=validTime(now);if(!at)throw new Error('invalid_now');
 let reason=null;
 if(obs?.schema!=='evercraft.context.observation.v1')reason='unsupported_schema';
 else if(!SOURCES.has(trim(obs.source_system).toLowerCase()))reason='unsupported_source';
 else if(!trim(obs.observation_id))reason='missing_observation_id';
 else if(['private','restricted','confidential'].includes(trim(obs.visibility).toLowerCase())||obs.private_customer_data===true||obs.contains_personal_data===true)reason='private_or_personal_data';
 else if(!validTime(obs.observed_at))reason='invalid_timestamp';
 else if(validTime(obs.observed_at)>new Date(at.getTime()+5*60*1000))reason='future_timestamp';
 else if(at.getTime()-new Date(obs.observed_at).getTime()>30*86400000)reason='stale_evidence';
 else if(!Array.isArray(obs.provenance_refs)||!obs.provenance_refs.some(publicHttps))reason='public_provenance_missing';
 if(reason)return {schema:'evercraft.systemia.commercial-research-hold.v1',source_system:trim(obs?.source_system)||null,observation_id:trim(obs?.observation_id)||null,state:'held',reason,external_action_authority:false};
 const base=common(obs);
 const source=base.source_system;
 const domains=new Set((Array.isArray(obs.domains)?obs.domains:[]).map(x=>trim(x).toLowerCase()));
 const isWebsite=['website_audit','systemia_website_audit'].includes(source);
 if(isWebsite&&['website_public_issue','web_customer_path_issue','website_conversion_observation'].includes(trim(obs.kind).toLowerCase())){
  const site=publicHttps(obs.site_url);
  if(!site)return {...base,state:'held',reason:'public_site_url_missing'};
  if(!['observed','verified'].includes(base.evidence_state))return {...base,state:'held',reason:'website_issue_unverified'};
  if(!trim(obs.issue_category))return {...base,state:'held',reason:'issue_category_missing'};
  return {...base,state:'candidate',lane:'evidence_first_proof_candidate',public_site_url:site,issue_category:trim(obs.issue_category,100),
   buyer_intent_state:'unknown',next_gate:'Systemia evidence review, current public validation, Proof-First Sales and Interaction Ledger contact preflight',
   proposed_work:'Prepare a private, truthful five-fix preview grounded in observed public evidence; do not infer revenue loss or contact permission.'};
 }
 const hazard=[...domains].some(x=>DISALLOWED.has(x));
 const range=trim(obs.rockies_range||obs.range).toLowerCase();
 const relevant=MARKET_RANGES.has(range)||[...domains].some(x=>MARKET_DOMAINS.has(x));
 if(['rockies','faie','radar','systemia_radar'].includes(source)&&relevant&&!hazard){
  return {...base,state:'candidate',lane:'market_research_question',topic:MARKET_RANGES.has(range)?range:[...domains].find(x=>MARKET_DOMAINS.has(x)),
   buyer_intent_state:'unknown',next_gate:'Systemia market hypothesis review and independent corroboration before marketing claims',
   proposed_work:'Research whether this public change affects website buying priorities; validate with direct buyer evidence before adjusting creative or targeting.'};
 }
 return {...base,state:'held',reason:'no_website_audit_commercial_fit'};
}
export function buildCommercialResearchQueue(observations=[],{now=new Date()}={}){
 if(!Array.isArray(observations))throw new Error('observations_array_required');
 const seen=new Set(),candidates=[],held=[];
 for(const obs of observations.slice(0,500)){
  const result=translateObservation(obs,{now});
  const key=result.id||'hold:'+hash([result.observation_id,result.source_system,result.reason]);
  if(seen.has(key))continue;
  seen.add(key);(result.state==='candidate'?candidates:held).push(result);
 }
 return {schema:'evercraft.systemia.commercial-research-queue.v1',mission_key:'website-audit-first-closed-distribution-loop-2026-10-07',
  candidate_count:candidates.length,held_count:held.length,candidates,held,
  routed_through:'Systemia_required_not_yet_admitted',execution_authority:false,outreach_authority:false,publication_authority:false,
  status:'staged_research_only_not_resident_or_live',
  next_integrations:['Passport-scoped Context Fabric observation reader','CHUM Money Radar demand cohort join','Proof-First Sales outreach preflight','Graphics Command/Clip after editorial gate','Evercraft Payments settled and Shipping delivered outcome reconciliation']};
}
