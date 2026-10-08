#!/usr/bin/env node
/**
 * Systemia First Offer command. Read-only planning/evidence reconciliation.
 * Caller-supplied receipts are claims, never self-authenticating authority.
 * Authoritative validation remains with Lineage, Payments, Yard, Passport,
 * Interaction Ledger, Shipping and the live external probe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { admitMission, assertControlPlane } from '../control-plane/control-plane.mjs';
import { verifyIBMiFulfillmentAuthority } from './ibmi-rescue-fulfillment.mjs';

export const OFFER_ONE = Object.freeze({
  mission_key: 'systemia-first-commercial-offer-2026-10-07',
  public_id: 'ibmi-rescue-v1',
  product_key: 'ibmi-rescue',
  title: 'IBM i 7.4 Deadline X-Ray',
  offer_key: 'ibmi_74_deadline_xray_250',
  amount_cents: 25000,
  currency: 'usd',
  validation_days: 14,
});

export const WORK = Object.freeze([
  { key:'evidence', type:'research', title:'Source-grounded IBM i 7.4 buyer pain and first-offer hypothesis', team:'Systemia Research / Saban', depends:[] },
  { key:'specialist', type:'commercial', title:'Verify IBM i qualified reviewer, workload capacity and $250 economics', team:'Opportunity Fabric / Saban', depends:['evidence'] },
  { key:'lineage', type:'release', title:'Prove Lineage release identity, Git mirror, CI, rollback and source provenance', team:'Lineage / Yard / Compute', depends:['evidence'] },
  { key:'public_page', type:'deploy', title:'Publish and independently prove owned HTTPS offer and sample page', team:'Yard / Compute / CHUM', depends:['lineage'] },
  { key:'commerce', type:'commercial', title:'Verify exact SKU, USD $250 checkout and provider handoff', team:'Evercraft Payments / Raven', depends:['public_page'] },
  { key:'distribution', type:'publish', impact:'external_message', title:'Publish permitted educational proof through Clip / CHUM', team:'Evercraft Clip / CHUM', depends:['public_page','specialist','commerce'], human_gate_required:true },
  { key:'contact', type:'external_message', title:'Preflight any individual outreach through Interaction Ledger and authorized sender', team:'Proof-First Sales / Interaction Ledger', depends:['public_page','specialist'], human_gate_required:true },
  { key:'buyer', type:'commercial', title:'Record owner-confirmed customer pain and an explicitly scoped agreement', team:'Evercraft Connect / Opportunity Fabric', depends:['evidence'] },
  { key:'settlement', type:'payment', title:'Independently verify non-synthetic settled customer payment', team:'Evercraft Payments', depends:['specialist','commerce','buyer'], human_gate_required:true },
  { key:'intake', type:'intake', title:'Obtain customer-authorized bounded IBM i evidence only after payment', team:'Passport / Legacy Rescue', depends:['settlement'], human_gate_required:true },
  { key:'qa', type:'qa', title:'Have qualified reviewer verify dependency/risk/test/rollback deliverables', team:'IBM i specialist / Saban', depends:['intake'] },
  { key:'delivery', type:'artifact_delivery', title:'Ship approved package and verify recipient acknowledgment', team:'Shipping Department', depends:['qa'] },
  { key:'economics', type:'analyze', title:'Reconcile provider fees, labor, refunds, margin and feedback', team:'Meter / Payments / Context Fabric', depends:['delivery'] },
]);

const GATES = Object.freeze([
  { key:'specialist', producer:'qualified_specialist_review', max_hours:168, requires:['reviewer_ref','capacity_receipt_ref','unit_economics_receipt_ref'] },
  { key:'lineage', producer:'evercraft_lineage', max_hours:168, requires:['commit_id','integrity_receipt_ref','mirror_receipt_ref'] },
  { key:'public_page', producer:'external_https_probe', max_hours:24, requires:['url','release_ref','http_status'] },
  { key:'commerce', producer:'evercraft_payments', max_hours:24, requires:['offer_key','amount_cents','currency','checkout_ready'] },
  { key:'distribution', producer:'evercraft_clip', max_hours:72, requires:['published_url','publication_authorization_ref'] },
  { key:'contact', producer:'interaction_ledger', max_hours:168, requires:['contact_preflight_ref','message_authorization_ref'] },
  { key:'buyer', producer:'customer_confirmation', max_hours:720, requires:['customer_ref','pain_confirmed','scope_ref'] },
  { key:'settlement', producer:'evercraft_payments', max_hours:168, requires:['order','receipt'] },
  { key:'intake', producer:'customer_evidence_authorization', max_hours:720, requires:['consent_ref','scope_ref'] },
  { key:'qa', producer:'specialist_qa', max_hours:720, requires:['reviewer_ref','qa_receipt_ref','deliverables_ref'] },
  { key:'delivery', producer:'evercraft_shipping', max_hours:720, requires:['shipping_receipt_ref','recipient_acknowledgment_ref'] },
  { key:'economics', producer:'evercraft_meter', max_hours:720, requires:['cost_receipt_ref','net_margin_receipt_ref'] },
]);

const clean = v => String(v ?? '').trim();
// A plausible-looking URL is never evidence of an Evercraft-owned deployment.
// Keep the approved origin explicit. A new production host requires source review.
const APPROVED_OFFER_HOSTNAMES = new Set(['fabric.systemiacommandcenters.com']);
const urlIsOwnedOffer = value => {
  try{
    const url = new URL(clean(value));
    return url.protocol === 'https:' && !url.username && !url.password &&
      url.port === '' && APPROVED_OFFER_HOSTNAMES.has(url.hostname) &&
      url.pathname === '/offers/ibmi-74-deadline-xray';
  }catch{return false;}
};
const finiteTime = value => Number.isFinite(Date.parse(clean(value))) ? Date.parse(clean(value)) : null;

export function firstOfferMission({rootDir=process.cwd(),now=new Date()}={}){
  const mission=admitMission({
    rootDir,
    now,
    request:{
      mission_key:OFFER_ONE.mission_key,
      goal_key:'offer-1-company-wide-activation',
      objective:'Make one customer-authorized, expert-reviewed IBM i 7.4 X-Ray sale and delivery with provider-verified settlement and measured economics.',
      success_condition:'Verified non-synthetic settled order, authorized evidence, reviewed delivery, shipping acknowledgment and net-margin receipt; no fabricated buyer or live-route claims.',
      context_refs:['registry:ibmi-rescue-v1','source:ibmi_74_deadline_xray_250'],
      tasks:WORK.map(w=>({
        work_key:w.key,title:w.title,work_type:w.type,impact:w.impact,
        dependency_keys:w.depends,assigned_agents:[w.team],
        human_gate_required:w.human_gate_required===true,
      })),
    },
  });
  assertControlPlane(mission);
  return mission;
}

function gateEvidence(gate, value, nowMs){
  const reasons=[];
  if (!value || typeof value !== 'object')return {key:gate.key,state:'missing',reasons:['no_current_evidence'],receipt_ref:null};
  if (value.synthetic === true || value.demo === true || value.fixture === true || value.test_mode === true) reasons.push('synthetic_or_test_evidence');
  if (value.producer !== gate.producer)reasons.push('wrong_producer');
  if (!clean(value.receipt_ref))reasons.push('receipt_ref_missing');
  const at=finiteTime(value.observed_at);
  if (at==null)reasons.push('observation_timestamp_invalid');
  else if (at>nowMs+5*60_000)reasons.push('observation_from_future');
  else if (at<nowMs-gate.max_hours*3600_000)reasons.push('evidence_stale');
  for(const key of gate.requires){
    if(value[key]===undefined||value[key]===null||value[key]==='')reasons.push('missing_'+key);
  }
  if(gate.key==='public_page' && (!urlIsOwnedOffer(value.url) || Number(value.http_status)!==200)) reasons.push('independent_owned_https_offer_unproved');
  if(gate.key==='commerce' && (
    value.offer_key!==OFFER_ONE.offer_key ||
    Number(value.amount_cents)!==OFFER_ONE.amount_cents ||
    clean(value.currency).toLowerCase()!==OFFER_ONE.currency ||
    value.checkout_ready!==true
  ))reasons.push('exact_checkout_contract_mismatch');
  if(gate.key==='buyer' && value.pain_confirmed!==true)reasons.push('buyer_pain_not_confirmed');
  if(gate.key==='settlement'){
    const payment=verifyIBMiFulfillmentAuthority({order:value.order,receipt:value.receipt});
    if(!payment.authorized)reasons.push(...payment.reasons.map(r=>'payment_'+r));
    if(clean(value.order?.offer_key)!==OFFER_ONE.offer_key)reasons.push('payment_wrong_offer');
    if(clean(value.order?.currency).toLowerCase()!==OFFER_ONE.currency)reasons.push('payment_wrong_currency');
  }
  return {
    key:gate.key,
    // Contract-valid assertions are NOT verified externally by this offline reader.
    state:reasons.length?'held':'source_asserted_requires_authoritative_recheck',
    reasons:[...new Set(reasons)],
    receipt_ref:clean(value.receipt_ref)||null,
    observed_at:at==null?null:new Date(at).toISOString(),
    upstream_producer:gate.producer,
    independently_authenticated:false,
  };
}

export function firstOfferReadiness({evidence={},now=new Date()}={}){
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if(!Number.isFinite(nowMs))throw new Error('valid now required');
  const rows=GATES.map(g=>gateEvidence(g,evidence[g.key],nowMs));
  const byKey=Object.fromEntries(rows.map(x=>[x.key,x]));
  const holds=rows.filter(x=>x.state!=='source_asserted_requires_authoritative_recheck');
  const launchGates=['specialist','lineage','public_page','commerce'];
  const launchEvidenceSubmitted=launchGates.every(k=>byKey[k].state==='source_asserted_requires_authoritative_recheck');
  // Work dependencies are authority boundaries, not just scheduling hints.
  // This reader cannot promote submitted assertions to authenticated receipts.
  const knownGateKeys=new Set(GATES.map(g=>g.key));
  const gateDependencies=Object.fromEntries(WORK.filter(w=>knownGateKeys.has(w.key)).map(w=>[
    w.key,w.depends.filter(key=>knownGateKeys.has(key))
  ]));
  const dependencyReadiness=rows.map(row=>{
    const prerequisite_gates=gateDependencies[row.key]||[];
    const missing_or_held_prerequisites=prerequisite_gates.filter(key=>
      byKey[key].state!=='source_asserted_requires_authoritative_recheck');
    const unverified_prerequisites=prerequisite_gates.filter(key=>
      byKey[key].state==='source_asserted_requires_authoritative_recheck');
    const stage_state=row.state!=='source_asserted_requires_authoritative_recheck'
      ? 'evidence_blocked'
      : missing_or_held_prerequisites.length
        ? 'upstream_evidence_blocked'
        : unverified_prerequisites.length
          ? 'upstream_authentication_required'
          : 'self_authentication_required';
    return {
      gate:row.key,claim_state:row.state,prerequisite_gates,
      missing_or_held_prerequisites,unverified_prerequisites,
      stage_state,execution_authorized:false,
    };
  });
  const verificationQueue=rows.filter(row=>row.state==='source_asserted_requires_authoritative_recheck')
    .map(row=>({
      gate:row.key,producer:row.upstream_producer,receipt_ref:row.receipt_ref,
      priority:launchGates.includes(row.key)?'launch':'downstream',
      action:'independently_recheck_receipt_at_authoritative_producer',
      independently_authenticated:false,execution_authority_granted:false,
    }));
  const priorityNextActions=launchGates.map(key=>({
    gate:key,
    action:byKey[key].state==='source_asserted_requires_authoritative_recheck'
      ? 'independently_recheck_receipt_at_authoritative_producer'
      : 'acquire_fresh_authoritative_receipt_and_verify_at_source',
    missing:byKey[key].reasons,
    prerequisite_gates:gateDependencies[key]||[],
    execution_authority_granted:false,
  }));
  return {
    schema:'evercraft.systemia.offer-one-readiness.v1',
    mission_key:OFFER_ONE.mission_key,
    evaluated_at:new Date(nowMs).toISOString(),
    offer:OFFER_ONE,
    launch_state:launchEvidenceSubmitted?'pending_independent_authority_recheck':'blocked_prelaunch_evidence',
    declared_external_live:false,
    declared_settled_orders:0,
    declared_revenue_cents:0,
    no_automated_outreach_authority:true,
    no_external_publish_authority:true,
    no_payment_or_fulfillment_authority:true,
    // The event supply is not the producing services' signed or authenticated truth.
    source_assertions_are_not_proof:true,
    required_gates:rows,
    held_count:holds.length,
    held_gates:holds.map(x=>({key:x.key,reasons:x.reasons})),
    dependency_readiness:dependencyReadiness,
    verification_queue:verificationQueue,
    priority_next_actions:priorityNextActions,
    operational_dependencies:WORK.map(w=>({work_key:w.key,team:w.team,depends_on:w.depends})),
  };
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const evidencePath=process.argv[2]||null;
  const evidence=evidencePath?JSON.parse(fs.readFileSync(evidencePath,'utf8')):{};
  const now=new Date();
  const mission=firstOfferMission({now});
  const readiness=firstOfferReadiness({evidence,now});
  process.stdout.write(JSON.stringify({
    ...readiness,
    systemia_admission:{
      admitted:mission.receipt.admitted,
      receipt_hash:mission.receipt.receipt_hash,
      mission_authority:mission.receipt.authority,
      hard_holds:mission.receipt.hard_holds,
      human_holds:mission.receipt.human_holds,
      execution_authority_granted:false,
      persisted_to_production:false,
    },
  },null,2)+'\n');
}
