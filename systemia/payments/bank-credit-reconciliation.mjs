/**
 * Evercraft Payments | ACH credit bank-statement reconciliation workbench.
 *
 * Accepts PRIVATE, read-only merchant-bank ledger observations and order
 * records. This is a comparison engine, not a bank-data authenticator:
 * a caller-provided statement row NEVER certifies a deposit, marks paid,
 * initiates a transfer, or releases fulfillment.
 */
import crypto from 'node:crypto';

const REF=/\bEC-[A-F0-9]{12}\b/g;
const ID=/^bpr_[0-9a-f]{32}$/;
const ACCOUNT_KEY=/^recv_[0-9a-f]{40,64}$/;
const safeString=(v,max=200)=>typeof v==='string'&&v.length>0&&v.length<=max;
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');

function publicHold(reason,extra={}){
 return {match_state:'needs_manual_review',reason,paid_verified:false,
  fulfillment_release:false,bank_record_authenticated:false,...extra};
}
function eligibleOrder(order){
 return order?.schema==='evercraft.payments.bank-credit-request.v1'&&
   ID.test(order.request_id||'')&&/^EC-[0-9A-F]{12}$/.test(order.reference||'')&&
   safeString(order.offer_key,120)&&Number.isSafeInteger(order.amount_cents)&&
   order.amount_cents>=100&&order.currency==='usd'&&
   ACCOUNT_KEY.test(order.receiving_account_key||'')&&
   order.state==='awaiting_bank_transfer'&&order.payment_verified===false&&
   order.fulfillment_release===false;
}
function validCredit(credit){
 return safeString(credit?.bank_transaction_id,160)&&
   ACCOUNT_KEY.test(credit?.receiving_account_key||'')&&
   Number.isSafeInteger(credit?.amount_cents)&&credit.amount_cents>0&&
   credit.currency==='usd'&&credit.direction==='credit'&&
   credit.bank_status==='posted'&&
   safeString(credit.memo,1000)&&
   Number.isFinite(Date.parse(credit.posted_at||''))&&
   credit.source_type==='merchant_bank_statement_observation';
}
/** Make exact memo token matches, not substrings of another invoice. */
export function extractBankCreditReferences(memo){
 if(typeof memo!=='string')return [];
 return [...new Set(memo.toUpperCase().match(REF)||[])];
}
/**
 * Only outputs RECONCILIATION_CANDIDATE. Even a perfectly matched row needs
 * authenticated bank access, a confirmed posted credit and operator review.
 */
export function inspectBankCreditMatches({orders=[],observations=[]}={}){
 if(!Array.isArray(orders)||!Array.isArray(observations)||orders.length>10000||
    observations.length>10000)throw Error('bank_reconciliation_input_invalid');
 const orderIds=new Set(),ordersByRef=new Map();
 for(const order of orders){
   if(!eligibleOrder(order))throw Error('bank_reconciliation_order_invalid');
   if(orderIds.has(order.request_id))throw Error('duplicate_payment_request_id');
   orderIds.add(order.request_id);
   const group=ordersByRef.get(order.reference)||[];
   group.push(order);ordersByRef.set(order.reference,group);
 }
 const ids=new Map();
 for(const o of observations){
   if(!safeString(o?.bank_transaction_id,160))continue;
   ids.set(o.bank_transaction_id,(ids.get(o.bank_transaction_id)||0)+1);
 }
 const byOrder=new Map(orders.map(o=>[o.request_id,[]]));
 const unassigned=[];
 for(const credit of observations){
  if(!validCredit(credit)){
   unassigned.push(publicHold('BANK_RECORD_UNSUPPORTED_OR_NOT_POSTED'));
   continue;
  }
  if(ids.get(credit.bank_transaction_id)!==1){
   unassigned.push(publicHold('DUPLICATE_BANK_TRANSACTION_ID',
     {bank_transaction_fingerprint:hash(credit.bank_transaction_id).slice(0,20)}));
   continue;
  }
  const refs=extractBankCreditReferences(credit.memo);
  if(refs.length!==1){
   unassigned.push(publicHold(refs.length?'MULTIPLE_TRANSFER_REFERENCES':'TRANSFER_REFERENCE_MISSING'));
   continue;
  }
  const matchedOrders=ordersByRef.get(refs[0])||[];
  if(matchedOrders.length!==1){
   unassigned.push(publicHold(matchedOrders.length?'AMBIGUOUS_ORDER_REFERENCE':'UNRECOGNIZED_ORDER_REFERENCE'));
   continue;
  }
  byOrder.get(matchedOrders[0].request_id).push(credit);
 }
 const matches=[];
 for(const order of orders){
  const candidates=byOrder.get(order.request_id);
  let result;
  if(candidates.length===0)result=publicHold('NO_UNIQUE_POSTED_CREDIT_OBSERVED');
  else if(candidates.length!==1)result=publicHold('MULTIPLE_CREDIT_OBSERVATIONS_FOR_ORDER');
  else{
   const credit=candidates[0];
   let reason=null;
   if(credit.receiving_account_key!==order.receiving_account_key)
     reason='WRONG_RECEIVING_ACCOUNT';
   else if(credit.amount_cents!==order.amount_cents)
     reason=credit.amount_cents<order.amount_cents?'PARTIAL_CREDIT':'AMOUNT_OVERPAYMENT';
   if(reason)result=publicHold(reason,{observed_amount_cents:credit.amount_cents});
   else result={
     match_state:'RECONCILIATION_CANDIDATE',
     reason:'EXACT_AMOUNT_REFERENCE_AND_RECEIVING_ACCOUNT_OBSERVED',
     observed_amount_cents:credit.amount_cents,bank_posted_at:credit.posted_at,
     bank_transaction_fingerprint:hash(credit.bank_transaction_id).slice(0,20),
     bank_record_authenticated:false,paid_verified:false,
     fulfillment_release:false,
     next_step:'Independently confirm the source bank record with authorized access, match its transaction ID and account, and apply the separate approved Evercraft Payments paid-order gate.',
   };
  }
  matches.push({request_id:order.request_id,offer_key:order.offer_key,
   reference:order.reference,amount_cents:order.amount_cents,
   currency:'usd',...result});
 }
 return {
  schema:'evercraft.payments.bank-credit-reconciliation-workbench.v1',
  checked_orders:orders.length,checked_bank_observations:observations.length,
  candidates:matches.filter(m=>m.match_state==='RECONCILIATION_CANDIDATE').length,
  matches,unassigned,
  payment_authority:'Evercraft Payments',
  bank_data_authenticated:false,paid_orders_confirmed:0,
  fulfillment_releases:0,bank_transfer_initiated:false,
  rule:'This is a comparison of supplied observations, never independent bank confirmation or authorization to mark paid.',
 };
}
