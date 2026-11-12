/**
 * Evercraft Payments -> existing Systemia Notification Fabric (Relay).
 * Consumes a locally validated private hosted-payments journal, produces
 * owner-only operational intents. No customer messages, entitlement or work.
 */
import crypto from 'node:crypto';
import {buildSystemiaPaymentReviewInbox} from './hosted-fulfillment-review.mjs';

const cleanPrincipal=(v)=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{3,160}$/.test(v);
const STATES=new Set([
  'payment_verified_scope_and_capacity_review_required',
  'payment_reversal_attention_required'
]);

export function planHostedPaymentRelayAlerts({journalText,approvedAccountId,offers,recipientId}={}){
  if(!cleanPrincipal(recipientId))throw Error('explicit_private_owner_principal_required');
  const inbox=buildSystemiaPaymentReviewInbox({journalText,approvedAccountId,offers});
  if(inbox.total>1000)throw Error('review_inbox_above_bounded_operator_limit');
  const intents=inbox.orders.map(order=>{
    if(!STATES.has(order.state)||order.operator_action_required!==true||
       order.entitlement_issued!==false||order.fulfillment_job_created!==false)
      throw Error('untrusted_payment_review_state');
    const reversal=order.state==='payment_reversal_attention_required';
    const fingerprint=crypto.createHash('sha256')
      .update(JSON.stringify([order.canonical_payment_order_key,order.state]))
      .digest('hex').slice(0,24);
    return {
      schema:'systemia.notification.intent.v2',
      id:'payment-review-'+fingerprint,
      product:'evercraft-payments',
      purpose:'operational',
      priority:reversal?'high':'normal',
      title:reversal?'Payment reversal requires review':'Verified payment needs scope review',
      body:reversal
        ?'A settled-order record now has refund or dispute evidence. Hold fulfillment and review the private Evercraft Payments inbox.'
        :'A provider-verified payment is awaiting scope, customer-intake and capacity review. No work has been dispatched.',
      recipient_ids:[recipientId],
      dedupe_key:'hosted-payment-review:'+fingerprint,
      dedupe_window_seconds:2592000,
      evidence_state:'provider_verified_private_journal',
      consent_basis:'service_relationship',
      data:{
        review_key:order.review_key,
        order_key:order.canonical_payment_order_key,
        offer_key:order.offer_key,
        review_state:order.state,
        fulfillment_released:false
      },
      url:null
    };
  });
  return {
    schema:'evercraft.payments.relay-review-plan.v1',
    destination:'existing_systemia_notification_fabric',
    scope:'owner_only_private_review',
    count:intents.length,
    paid_review_count:inbox.paid_pending_scope_review,
    reversal_review_count:inbox.reversal_attention,
    customer_messages_sent:0,
    fulfillment_jobs_created:0,
    intents
  };
}

export async function dispatchHostedPaymentRelayAlerts({plan,client,explicitOwnerApproval=false}={}){
  if(!explicitOwnerApproval)return {state:'held_owner_dispatch_not_approved',sent:0};
  if(!plan||plan.schema!=='evercraft.payments.relay-review-plan.v1'||
     !Array.isArray(plan.intents)||plan.intents.length>1000||typeof client?.notify!=='function')
    throw Error('verified_relay_plan_and_client_required');
  let accepted=0;
  for(const intent of plan.intents){
    if(intent.schema!=='systemia.notification.intent.v2'||intent.product!=='evercraft-payments'||
       intent.purpose!=='operational'||intent.recipient_ids?.length!==1||
       !cleanPrincipal(intent.recipient_ids[0])||!STATES.has(intent.data?.review_state))
      throw Error('invalid_private_relay_intent');
    const reply=await client.notify(intent);
    if(!reply||typeof reply!=='object')throw Error('relay_delivery_receipt_missing');
    accepted++;
  }
  return {state:'relay_intents_submitted_not_human_delivery_proven',submitted:accepted,
    customer_messages_sent:0,fulfillment_jobs_created:0};
}
