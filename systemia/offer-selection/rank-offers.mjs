#!/usr/bin/env node
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=new URL('../../',import.meta.url);
export const evidence=JSON.parse(fs.readFileSync(new URL('./evidence-2026-10-07.json',import.meta.url),'utf8'));
export function rankOffers({catalog,evidencePack=evidence}={}){
 if(catalog?.schema!=='evercraft.machine-catalog.snapshot.v1'||!Array.isArray(catalog.offers))throw Error('canonical_catalog_required');
 if(evidencePack?.schema!=='evercraft.systemia.offer-selection-evidence.v1')throw Error('evidence_schema_invalid');
 const weights=evidencePack.weights||{},keys=Object.keys(weights),maxWeight=keys.reduce((n,k)=>n+Number(weights[k]),0);
 if(maxWeight!==100||keys.some(k=>!Number.isFinite(weights[k])||weights[k]<0))throw Error('invalid_weights');
 const byID=new Map(catalog.offers.map(o=>[o.public_id,o]));
 const rows=evidencePack.candidates.map(candidate=>{
  const published=byID.get(candidate.public_id);
  if(!published)throw Error('unknown_published_offer:'+candidate.public_id);
  const listed=published.offers?.find(o=>o.name===candidate.entry_offer);
  if(!listed)throw Error('canonical_entry_mismatch:'+candidate.public_id);
  const scoreBreakdown=keys.map(key=>{
   const raw=candidate.ratings?.[key];
   if(!Number.isInteger(raw)||raw<0||raw>5)throw Error('analyst_rating_invalid:'+key);
   return {dimension:key,analyst_rating:raw,max_rating:5,weight:weights[key],points:raw*weights[key]/5};
  });
  const score=scoreBreakdown.reduce((sum,x)=>sum+x.points,0);
  return {
   public_id:candidate.public_id,offer_name:published.name,entry_offer:candidate.entry_offer,
   entry_price_published:listed.price,entry_offer_key:candidate.offer_key||null,
   commercial_state:published.commercial_state,machine_state:published.machine_state,
   eligible:published.commercial_state==='sell_now',
   analyst_score:score,
   analyst_score_components:scoreBreakdown,
   reasoning:candidate.rationale,
   evidence_refs:(candidate.evidence_ids||[]).map(id=>evidencePack.sources.find(s=>s.id===id)?.url||null).filter(Boolean),
   first_party_order_evidence:candidate.first_party_order_evidence||'not_verified',
   critical_unknowns:candidate.critical_unknowns||[],
   buyer_channel_hypothesis:candidate.partner_channel||null,
   is_sales_proven:false,
  };
 });
 rows.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.analyst_score-a.analyst_score||a.public_id.localeCompare(b.public_id));
 const first=rows.find(x=>x.eligible)||null;
 return {
  schema:'evercraft.systemia.offer-priority-decision.v1',
  as_of:evidencePack.as_of,
  mission_key:evidencePack.mission_key,
  decision_state:'provisional_first_offer_selected_market_validation_required',
  evidence_type:'transparent_analyst_rubric_with_cited_public_market_signals_not_purchase_history',
  catalog_generated_at:catalog.generated_at||null,
  catalog_source_generated_at:catalog.source_generated_at||null,
  catalog_source_state:catalog.source_state||null,
  eligible_sell_now_offer_count:catalog.sell_now_count??null,
  first_offer:first,ranking:rows,alternatives_screened:rows.length,
  activation_gates:[
   'Systemia admit one narrowly-scoped 14-day validation mission',
   'Fresh external buyer route, live exact-price checkout and provider payment canary verified',
   'Named IBM i domain expert and capacity can deliver bounded inputs and 4 outputs after customer-authorized evidence',
   'Publish source-backed page and one real redacted/illustrative specimen without fabricated customer claims',
   'Run buyer discovery through user-group or partner relationships; proof-first permissions and Interaction Ledger govern contact',
   'First actual provider-settled non-synthetic order and verified delivered X-Ray with timestamped receipt',
   'Compare labor and settlement net of fees and refunds before repeating or scaling'
  ],
  no_external_action_authority:true,no_outreach_authority:true,no_purchase_authority:true,no_production_release_authority:true,
  note:'Ranking is an internal comparative hypothesis. It neither proves market demand nor identifies a verified buyer. Do not publicly present analyst score as customer evidence.'
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const catalog=JSON.parse(fs.readFileSync(new URL('../../public/.well-known/evercraft-machine-catalog.json',import.meta.url),'utf8'));
 process.stdout.write(JSON.stringify(rankOffers({catalog}),null,2)+'\n');
}
