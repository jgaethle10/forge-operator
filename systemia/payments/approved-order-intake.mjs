/**
 * Private Evercraft Payments order intake for two already-reviewed offers.
 *
 * This is an OWNED, processor-independent order record, not a checkout or an
 * invoice delivery endpoint. Only an authenticated operator service may call
 * it; no public HTTP/MCP handler is registered here. All money states remain
 * unpaid and fulfillment remains held pending independent reconciliation.
 */
import {createHash} from 'node:crypto';
import {
  createSovereignOrder,persistSovereignOrder,readSovereignOrder,
  DEFAULT_ORDER_DIR,
} from './sovereign-order-ledger.mjs';

export const EVERCRAFT_APPROVED_ENTRY_OFFERS=Object.freeze({
  'website-audit':Object.freeze({
    product_key:'systemia',
    offer_key:'systemia.website_audit_quick_win_49.v1',
    amount_cents:4900,currency:'USD',
    name:'Website Quick Win Audit'
  }),
  findmypart:Object.freeze({
    product_key:'findmypart',
    offer_key:'findmypart.quick_hunt_19.v1',
    amount_cents:1900,currency:'USD',
    name:'FindMyPart Quick Hunt'
  }),
});
const KEY=/^[a-zA-Z0-9._:-]{16,128}$/;
const CUSTOMER=/^[a-zA-Z0-9._:-]{3,130}$/;
function orderIdForKey(key){
  const hash=createHash('sha256').update(
    'evercraft.payments.owned-first-sale.v1:'+key
  ).digest('hex');
  return 'buyer-'+[
    hash.slice(0,8),hash.slice(8,12),hash.slice(12,16),
    hash.slice(16,20),hash.slice(20,32)
  ].join('-');
}
export function createApprovedOwnedOrder(input={},{
  storeDir=DEFAULT_ORDER_DIR,
}={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).some(k=>!['offerSlug','customerRef','idempotencyKey'].includes(k))){
    throw Error('only_approved_order_fields_allowed');
  }
  const {offerSlug,customerRef,idempotencyKey}=input;
  const binding=EVERCRAFT_APPROVED_ENTRY_OFFERS[offerSlug];
  if(!binding||!CUSTOMER.test(String(customerRef||''))||
     !KEY.test(String(idempotencyKey||''))){
    throw Error('approved_offer_customer_and_idempotency_required');
  }
  const orderId=orderIdForKey(idempotencyKey);
  const candidate=createSovereignOrder({
    orderId,productKey:binding.product_key,offerKey:binding.offer_key,
    amountCents:binding.amount_cents,currency:binding.currency,
    customerRef,
  });
  let replayed=false;
  try{
    persistSovereignOrder(candidate,{dir:storeDir});
  }catch(e){
    if(e?.code!=='EEXIST')throw e;
    replayed=true;
  }
  const observed=readSovereignOrder(orderId,{dir:storeDir});
  if(observed.customer_ref!==customerRef||
     observed.product_key!==binding.product_key||
     observed.offer_key!==binding.offer_key||
     observed.amount_cents!==binding.amount_cents||
     observed.currency!==binding.currency){
    throw Error('idempotency_conflict_order_does_not_match');
  }
  return {
    schema:'evercraft.payments.approved-order-intake.v1',
    order_id:observed.order_id,
    offer_key:observed.offer_key,product_key:observed.product_key,
    amount_cents:observed.amount_cents,currency:observed.currency,
    version:observed.version,replayed,
    order_persisted:true,canonical_owner:'evercraft_payments',
    collection_state:observed.collection_state,
    merchant_payment_method_state:'requires_verified_business_rail',
    invoice_issued:false,payment_instructions_available:false,
    payment_state:'unpaid',payment_verified:false,
    settlement_receipt_ref:null,
    entitlement_granted:false,fulfillment_released:false,
    provider_required:false,
    next_gate:'merchant_verified_rail_and_buyer_approved_invoice',
  };
}
