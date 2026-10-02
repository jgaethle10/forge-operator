#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function present(value){
  return String(value??'').trim().length>0;
}
function list(value){
  return Array.isArray(value)?value.filter(Boolean):[];
}
function inspectProduct(raw={}){
  const actions=[];
  if(!present(raw.canonical_url)) actions.push({type:'repair_canonical_url'});
  if(list(raw.intents).length<3) actions.push({type:'expand_natural_language_intents'});
  if(!present(raw.authority)) actions.push({type:'declare_public_authority'});
  if(list(raw.boundaries).length===0) actions.push({type:'declare_public_boundaries'});
  return actions;
}
function inspectOffer(raw={}){
  const actions=[];
  if(!present(raw.public_url)) actions.push({type:'repair_public_offer_url'});
  if(list(raw.intent_terms).length<3) actions.push({type:'expand_offer_intent_terms'});
  if(!present(raw.problem)) actions.push({type:'clarify_problem_statement'});
  if(!present(raw.inputs)) actions.push({type:'declare_offer_inputs'});
  if(!present(raw.outputs)) actions.push({type:'declare_offer_outputs'});
  if(raw.commercial_state==='sell_now'&&!present(raw.pricing)){
    actions.push({type:'repair_sell_now_pricing'});
  }
  return actions;
}
function inspectPain(raw={}){
  const actions=[];
  if(list(raw.pain_phrases).length<3&&list(raw.intent_terms).length<3){
    actions.push({type:'expand_pain_language_coverage'});
  }
  return actions;
}
function inspectDiscoveryRepair(raw={}){
  const actions=[];
  if(!present(raw.product_key)) actions.push({type:'repair_item_missing_product_key'});
  if(Number(raw.miss_count||0)>0){
    actions.push({
      type:'expand_concept_coverage_from_receipt_backed_miss',
      concepts:list(raw.concepts).slice(0,16),
    });
    actions.push({type:'add_brand_blind_regression_case'});
    actions.push({type:'rebuild_observed_answer_door'});
    actions.push({type:'rerun_provider_probe_after_surface_change'});
  }
  return actions;
}
function roleActions(role,item){
  const raw=item?.raw||{};
  const actions=
    item?.kind==='product'?inspectProduct(raw):
    item?.kind==='offer'?inspectOffer(raw):
    item?.kind==='pain'?inspectPain(raw):
    item?.kind==='discovery_repair'?inspectDiscoveryRepair(raw):
    item?.kind==='external_inventory'?[{type:'candidate_requires_admission_review'}]:
    [];
  switch(role){
    case 'portfolio_archaeologist':
      if(item?.kind==='external_inventory') actions.push({type:'compare_candidate_to_public_directory'});
      break;
    case 'surface_auditor':
      actions.push({type:'verify_llms_and_structured_discovery_surfaces'});
      break;
    case 'intent_cartographer':
      actions.push({type:'map_buyer_language_to_smallest_truthful_capability'});
      break;
    case 'answer_door_planner':
      actions.push({type:'ensure_answer_door_exists_for_supported_intent'});
      break;
    case 'commerce_path_auditor':
      actions.push({type:'verify_human_confirmed_conversion_path'});
      break;
    case 'crawl_pressure_planner':
      actions.push({type:'queue_safe_crawl_freshness_signal'});
      break;
    case 'conformance_guard':
      actions.push({type:'preserve_public_private_boundary'});
      break;
    case 'reconciliation_scout':
      actions.push({type:'dedupe_findings_before_global_rebuild'});
      break;
  }
  return actions;
}

export async function runPortableChumAssignment(payload={}){
  if(payload?.schema!=='evercraft.saban.portable-assignment.v1'){
    throw new Error('portable_assignment_schema_invalid');
  }
  if(payload.software!=='chum') throw new Error('portable_worker_software_mismatch');
  const assignment=payload.assignment;
  if(!assignment?.agent_id||!assignment?.role||!assignment?.work){
    throw new Error('portable_assignment_missing_required_fields');
  }
  const actions=roleActions(assignment.role,assignment.item);
  const result={
    status:actions.length?'finding':'clean',
    agent_id:assignment.agent_id,
    role:assignment.role,
    work:assignment.work,
    actions,
    boundaries:{
      no_unsolicited_human_outreach:true,
      no_automatic_checkout:true,
      no_unverified_provider_claims:true,
      private_topology_stays_private:true,
    },
  };
  const body={
    schema:'evercraft.saban.portable-worker-receipt.v1',
    portable_worker_id:'chum-portable-v1',
    software_id:'chum',
    agent_id:assignment.agent_id,
    idempotency_key:assignment.idempotency_key||null,
    result,
    checkpoint:{step:1,state:'portable_assignment_completed'},
  };
  return {...body,receipt_hash:sha(body)};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const inputPath=process.argv[2];
  if(!inputPath) throw new Error('portable_input_path_required');
  const payload=JSON.parse(fs.readFileSync(inputPath,'utf8'));
  const receipt=await runPortableChumAssignment(payload);
  process.stdout.write(JSON.stringify(receipt));
}
