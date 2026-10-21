/**
 * One explicit Evercraft-owned native buyer door, reconciled independently of
 * the remote Machine Commerce catalog snapshot. This is a public discovery
 * bridge, not a settlement, fulfillment, or deploy attestation.
 *
 * The fixed-price contract is canonical in public-payment-offers.mjs. If that
 * contract changes, regeneration fails closed instead of publishing a stale
 * offer. Future Machine Commerce onboarding should eliminate this overlay.
 */
import { publicPaymentOffer } from '../mcp/public-payment-offers.mjs';

const ID='workflow-foundry-xray-v1';
const SLUG='workflow-xray';
const OFFER_KEY='workflow_foundry.xray_250.v1';
const BUYER_URL='https://fabric.systemiacommandcenters.com/offers/workflow-xray';
const AMOUNT_CENTS=25000;

const USE_WHEN=[
  'my business loses customer inquiries between quoting approval and follow-up',
  'our leads get missed between intake, estimate, scheduling and follow-up',
  'I need a fixed-price one-time operations workflow audit',
  'map workflow bottlenecks and ownership gaps',
  'decide whether to automate a recurring business process',
  'find why our approvals and customer handoffs fall through the cracks',
  'diagnose repetitive admin work without replacing all our software',
  'get a workflow diagnosis before buying a big automation platform',
  'one bounded diagnostic for a slow quoting and follow-up workflow',
  'assess one business process with practical acceptance tests',
];

export function withOwnedNativeWorkflowXray(input){
  if(!Array.isArray(input)) throw new Error('native_offer_overlay_requires_catalog_array');
  const contract=publicPaymentOffer(SLUG);
  // Removal of the fixed-priced owned offer removes this discovery overlay.
  if(!contract) return input.filter(x=>x?.public_id!==ID);
  if(contract.offer_key!==OFFER_KEY||contract.amount_cents!==AMOUNT_CENTS||
     contract.currency!=='usd'||contract.title!=='Evercraft Workflow X-Ray'){
    throw new Error('workflow_xray_owned_buyer_contract_mismatch');
  }

  const existing=input.find(x=>x?.public_id===ID);
  if(existing){
    const priceRows=Array.isArray(existing.offers)?existing.offers:[];
    const matched=priceRows.some(x=>
      x?.offer_key===OFFER_KEY&&Number(x?.price_usd)===250);
    if(existing.commercial_state!=='sell_now'||
       existing.public_url!==BUYER_URL||!matched){
      throw new Error('workflow_xray_upstream_offer_conflict');
    }
    return input;
  }

  return [...input,{
    public_id:ID,
    name:'Evercraft Workflow X-Ray',
    intent_terms:USE_WHEN,
    problem:'A business has missed customer follow-ups, delayed estimates or approvals, unclear handoffs, broken intake-to-delivery workflow, or repetitive tasks. Diagnose one process before buying an automation build.',
    inputs:'One customer-authorized workflow description, handoff steps, and optional non-sensitive evidence. No production credentials or access required.',
    outputs:'Bounded current-state workflow map, bottlenecks, human decision/automation boundaries, baseline metrics, one responsible fix recommendation and acceptance tests.',
    commercial_state:'sell_now',
    machine_state:'human_handoff_ready',
    pricing:'$250 USD one-time for a scoped workflow diagnostic. No subscription, production access, automatic implementation, or promised revenue result.',
    offers:[{
      offer_key:OFFER_KEY,
      name:'Workflow X-Ray',
      price:'$250',
      price_usd:250,
      billing:'one_time',
      checkout:'human_confirmed_provider_verified',
    }],
    human_ui_required:true,
    confirmation:'Exact offer and price require separate buyer confirmation. Opening an offer or preparing checkout is not payment; deliver only after an authoritative provider-paid receipt.',
    public_url:BUYER_URL,
    human_start_url:BUYER_URL,
    human_start_url_state:'public_https_verified',
    payment_authority:'Evercraft Payments; customer-selected, operator-verified settlement method required',
    invocation_status:'Owned offer page discovery only. No currently verified merchant payment rail, paid receipt, or fulfillment authority is implied by this record.',
    catalog_version:'2026-10-16.native-owned-v1',
  }];
}
