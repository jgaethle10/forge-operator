/**
 * First-party, offline-capable Evercraft payment orders.
 *
 * Customer claims, screenshots, transfer references and selected rails are
 * NOT authoritative settlement. This draft ledger has no "mark paid" method.
 * An authenticated reconciliation service must eventually bind the actual
 * bank/processor statement or witnessed cash receipt before any fulfillment.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {EVERCRAFT_PAYMENT_RAILS} from './payment-routing.mjs';

const SCHEMA='evercraft.payments.sovereign-order.v1';
const safeKey=value=>typeof value==='string'&&/^[a-zA-Z0-9._:-]{3,130}$/.test(value);
const cents=value=>Number.isSafeInteger(value)&&value>0&&value<=100000000000;
const ID=/^buyer-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const DEFAULT_ORDER_DIR=path.join(os.homedir(),'.local','state','evercraft','payments','orders');

export function createSovereignOrder({
  productKey,offerKey,amountCents,currency='USD',
  customerRef,orderId='buyer-'+randomUUID(),
}={}){
  if(!safeKey(productKey)||!safeKey(offerKey)||!safeKey(customerRef)||
    !cents(amountCents)||currency!=='USD'||!ID.test(orderId)){
    throw Error('sovereign_order_contract_invalid');
  }
  return {
    schema:SCHEMA,order_id:orderId,
    product_key:productKey,offer_key:offerKey,
    amount_cents:amountCents,currency,
    customer_ref:customerRef,
    order_owner:'evercraft_payments',provider_required:false,
    rail:null,adapter:null,
    payment_state:'unpaid',
    collection_state:'awaiting_payment_method',
    customer_claim_ref:null,
    settlement_receipt_ref:null,
    payout_verified:false,
    entitlement_state:'held',
    fulfillment_state:'held',
    version:1
  };
}
function assertOrder(order){
  if(order?.schema!==SCHEMA||!ID.test(String(order.order_id||''))||
     order.order_owner!=='evercraft_payments'||!cents(order.amount_cents)||
     order.currency!=='USD'||!safeKey(order.offer_key)||
     !safeKey(order.product_key)||!safeKey(order.customer_ref)||
     order.payment_state!=='unpaid'||order.settlement_receipt_ref!==null||
     order.payout_verified!==false||order.entitlement_state!=='held'||
     order.fulfillment_state!=='held'||!Number.isSafeInteger(order.version)||
     order.version<1)throw Error('sovereign_order_evidence_or_contract_invalid');
}
export function prepareExternalPaymentInstructions(order,{
  rail,merchantRailConfigured=false,buyerConfirmed=false
}={}){
  assertOrder(order);
  if(order.rail!==null||order.customer_claim_ref!==null)throw Error('order_payment_rail_already_selected');
  if(!EVERCRAFT_PAYMENT_RAILS[rail]||rail==='card_processor'){
    throw Error('external_payment_rail_not_supported');
  }
  if(merchantRailConfigured!==true||buyerConfirmed!==true){
    throw Error('merchant_rail_readiness_and_buyer_confirmation_required');
  }
  // Neither the business payment destination nor any financial account handle
  // is derived from buyer input, source code or an advertised checkout page.
  return {
    ...order,rail,collection_state:'instructions_ready_for_authenticated_merchant_delivery',
    version:order.version+1,
    payment_state:'unpaid',settlement_receipt_ref:null,
    fulfillment_state:'held'
  };
}
export function noteCustomerPaymentClaim(order,{claimRef}={}){
  assertOrder(order);
  if(!order.rail||order.rail==='card_processor'||
    order.collection_state!=='instructions_ready_for_authenticated_merchant_delivery'||
    !safeKey(claimRef)||order.customer_claim_ref!==null){
    throw Error('customer_payment_claim_ineligible');
  }
  return {
    ...order,customer_claim_ref:claimRef,
    collection_state:'customer_claim_unverified',
    payment_state:'unpaid',settlement_receipt_ref:null,
    entitlement_state:'held',fulfillment_state:'held',
    version:order.version+1
  };
}
function privateDirectory(dir){
  if(!path.isAbsolute(dir))throw Error('absolute_order_directory_required');
  // Existing ancestors must not be symlinks; do not follow an attacker-owned
  // directory into an unexpected root.
  let p=path.resolve(dir);
  const ancestors=[];
  while(p!==path.dirname(p)){ancestors.push(p);p=path.dirname(p);}
  for(const parent of ancestors.reverse()){
    if(fs.existsSync(parent)&&fs.lstatSync(parent).isSymbolicLink()){
      throw Error('order_store_symlink_ancestor');
    }
  }
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const st=fs.lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
     (typeof process.getuid==='function'&&st.uid!==process.getuid())){
    throw Error('order_store_not_owner_private');
  }
}
export function persistSovereignOrder(order,{dir=DEFAULT_ORDER_DIR}={}){
  assertOrder(order);
  if(order.version!==1)throw Error('only_new_orders_can_be_created');
  privateDirectory(dir);
  const file=path.join(dir,order.order_id+'.json');
  const flags=fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|
    (fs.constants.O_NOFOLLOW||0);
  let fd;
  try{
    fd=fs.openSync(file,flags,0o600);
    fs.writeFileSync(fd,JSON.stringify(order,null,2)+'\n','utf8');
    fs.fsyncSync(fd);
  }finally{if(fd!==undefined)fs.closeSync(fd);}
  return {
    created:true,order_id:order.order_id,amount_cents:order.amount_cents,
    currency:order.currency,payment_state:'unpaid',
    provider_required:false,fulfillment_state:'held'
  };
}
export function readSovereignOrder(orderId,{dir=DEFAULT_ORDER_DIR}={}){
  if(!ID.test(String(orderId||'')))throw Error('order_id_invalid');
  const dirStat=fs.lstatSync(dir);
  if(!dirStat.isDirectory()||dirStat.isSymbolicLink()||(dirStat.mode&0o077)!==0){
    throw Error('order_store_not_private');
  }
  const file=path.join(dir,orderId+'.json');
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||
     (typeof process.getuid==='function'&&st.uid!==process.getuid())){
    throw Error('order_record_not_private');
  }
  const order=JSON.parse(fs.readFileSync(file,'utf8'));
  assertOrder(order);
  if(order.order_id!==orderId)throw Error('order_record_identity_mismatch');
  return order;
}


/**
 * Serialize unpaid order state changes across independent Saban OS processes.
 * An exclusive lock prevents two concurrent writers from selecting different
 * rails or recording competing buyer claims. Missing/stale locks fail closed.
 * No operation can mark an order paid, settled, entitled or fulfilled.
 */
export function transitionSovereignOrder(orderId,{
  expectedVersion,action,rail,merchantRailConfigured=false,
  buyerConfirmed=false,claimRef=null,
}={}, {dir=DEFAULT_ORDER_DIR}={}){
  if(!ID.test(String(orderId||'')))throw Error('order_id_invalid');
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1){
    throw Error('expected_version_required');
  }
  if(!['select_external_rail','note_unverified_claim'].includes(action)){
    throw Error('unsupported_or_money_mutating_action');
  }
  const lock=path.join(dir,orderId+'.lock');
  let fd;
  const flags=fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|
    (fs.constants.O_NOFOLLOW||0);
  try{
    fd=fs.openSync(lock,flags,0o600);
    const original=readSovereignOrder(orderId,{dir});
    if(original.version!==expectedVersion)throw Error('order_version_conflict');
    const next=action==='select_external_rail'
      ?prepareExternalPaymentInstructions(original,{rail,merchantRailConfigured,buyerConfirmed})
      :noteCustomerPaymentClaim(original,{claimRef});
    assertOrder(next);
    if(next.version!==original.version+1)throw Error('order_transition_version_invalid');
    const file=path.join(dir,orderId+'.json');
    const temp=path.join(dir,orderId+'.next-'+randomUUID()+'.tmp');
    let nextFd;
    try{
      nextFd=fs.openSync(temp,flags,0o600);
      fs.writeFileSync(nextFd,JSON.stringify(next,null,2)+'\n','utf8');
      fs.fsyncSync(nextFd);
      fs.closeSync(nextFd);nextFd=undefined;
      fs.renameSync(temp,file);
      const dirFd=fs.openSync(dir,fs.constants.O_RDONLY);
      try{fs.fsyncSync(dirFd);}finally{fs.closeSync(dirFd);}
    }finally{
      if(nextFd!==undefined)fs.closeSync(nextFd);
      if(fs.existsSync(temp))fs.unlinkSync(temp);
    }
    return {
      changed:true,order_id:orderId,version:next.version,
      rail:next.rail,collection_state:next.collection_state,
      payment_state:'unpaid',fulfillment_state:'held',
      receipt_verified:false
    };
  }finally{
    if(fd!==undefined){
      fs.closeSync(fd);
      fs.unlinkSync(lock);
    }
  }
}
