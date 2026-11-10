// FindMyPart operator-only scope and quote preparation. Never sends, charges,
// claims inventory, or allows a synthetic intake to become paid revenue.
import {publicPaymentOffer} from './public-payment-offers.mjs';

const TIERS=Object.freeze({
 quick:Object.freeze({tier:'Quick Hunt',offer_slug:'findmypart',offer_key:'findmypart.quick_hunt_19.v1',amount_cents:1900,
  work:'Research the stated part identity, exact/superseded references and initial credible sourcing routes.'}),
 deep:Object.freeze({tier:'Deep Hunt',offer_slug:'part-deep',offer_key:'findmypart.deep_hunt_49.v1',amount_cents:4900,
  work:'Expand research to cross-references, documentation, salvage/donor possibilities and clearly labeled alternatives.'}),
 rescue:Object.freeze({tier:'Rescue Hunt',offer_slug:'part-rescue',offer_key:'findmypart.rescue_hunt_99.v1',amount_cents:9900,
  work:'Investigate deeper recovery paths, including feasible repair or fabrication directions, with explicit safety and verification limits.'})
});
export const FINDMYPART_QUOTE_TIERS=TIERS;

export function prepareFindMyPartQuote(record,tierId){
 const tier=TIERS[String(tierId||'')];
 if(!tier)throw new Error('exact_hunt_tier_required');
 if(!record||record.schema!=='evercraft.findmypart.customer-inquiry.v1'||
  !/^FMP-[A-F0-9]{24}$/.test(String(record.reference||''))||
  record.consent!==true||record.state!=='NEW_HUMAN_REVIEW_REQUIRED'||
  record.payment_created!==false||record.agent_execution_authorized!==false)
  throw new Error('unreviewed_or_untrusted_inquiry');
 const email=String(record.email||'');
 const part=String(record.part_description||'').trim();
 const machine=String(record.equipment_context||'').trim();
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||part.length<10||machine.length<4)
  throw new Error('inquiry_fields_invalid');
 if(tier.offer_slug!=='findmypart'){
  const canonical=publicPaymentOffer(tier.offer_slug);
  if(!canonical||canonical.offer_key!==tier.offer_key||canonical.amount_cents!==tier.amount_cents)
   throw new Error('approved_hunt_catalog_mismatch');
 }
 const price='$'+(tier.amount_cents/100).toFixed(2);
 const body=[
  'Thanks for sending your FindMyPart request.',
  '',
  'Your case: '+record.reference,
  'Part problem: '+part,
  'Equipment: '+machine,
  '',
  'Proposed one-time research: '+tier.tier+' ('+price+').',
  'Research scope: '+tier.work,
  '',
  'This covers sourcing research, not the replacement component, shipping, installation, or fabrication.',
  'We will distinguish confirmed evidence from candidates. Availability, compatibility and a successful repair are not guaranteed.',
  '',
  'If this scope fits, please reply to approve it. We will then provide an authorized secure payment option when it is available.',
  'No payment, order, supplier purchase, or research execution has been started by this message.',
 ].join('\n');
 return Object.freeze({
  schema:'evercraft.findmypart.private-quote-draft.v1',reference:record.reference,
  recipient:email,subject:'FindMyPart | Research scope for '+record.reference,
  body,tier:tier.tier,offer_slug:tier.offer_slug,offer_key:tier.offer_key,
  amount_cents:tier.amount_cents,currency:'usd',billing:'one_time',
  quote_status:'DRAFT_NOT_SENT',checkout_created:false,
  payment_confirmed:false,fulfillment_authorized:false,
  customer_scope_approved:false,requires_manual_review:true,
 });
}
