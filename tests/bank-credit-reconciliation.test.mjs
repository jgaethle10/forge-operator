import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractBankCreditReferences,
  inspectBankCreditMatches,
} from '../systemia/payments/bank-credit-reconciliation.mjs';

const accountKey='recv_'+'a'.repeat(48);
const secondAccount='recv_'+'b'.repeat(48);
const order={
 schema:'evercraft.payments.bank-credit-request.v1',
 request_id:'bpr_'+'1'.repeat(32),
 reference:'EC-ABCDEF012345',
 offer_key:'asset-diagnosis-149',amount_cents:14900,currency:'usd',
 receiving_account_key:accountKey,
 state:'awaiting_bank_transfer',
 payment_verified:false,fulfillment_release:false,
};
const credit={
 source_type:'merchant_bank_statement_observation',
 bank_transaction_id:'BANK-FIXTURE-123456',
 amount_cents:14900,currency:'usd',direction:'credit',
 bank_status:'posted',posted_at:'2026-11-11T16:00:00.000Z',
 receiving_account_key:accountKey,
 memo:'ACH deposit for invoice EC-ABCDEF012345',
};
const inspect=(orders=[order],observations=[credit])=>inspectBankCreditMatches({orders,observations});

test('exact posted statement match is a candidate, never a paid order or fulfillment',()=>{
 const result=inspect();
 assert.equal(result.checked_orders,1);
 assert.equal(result.checked_bank_observations,1);
 assert.equal(result.candidates,1);
 assert.equal(result.matches[0].match_state,'RECONCILIATION_CANDIDATE');
 assert.equal(result.matches[0].observed_amount_cents,14900);
 assert.equal(result.matches[0].bank_record_authenticated,false);
 assert.equal(result.matches[0].paid_verified,false);
 assert.equal(result.matches[0].fulfillment_release,false);
 assert.equal(result.paid_orders_confirmed,0);
 assert.equal(result.fulfillment_releases,0);
 assert.equal(result.bank_transfer_initiated,false);
 assert.doesNotMatch(JSON.stringify(result),/BANK-FIXTURE-123456|(?:account_number|routing_number)/);
});

test('unrelated, invalid and absent bank records cannot complete invoices',()=>{
 for(const [change,reason] of [
  [{amount_cents:1000},'PARTIAL_CREDIT'],
  [{amount_cents:15000},'AMOUNT_OVERPAYMENT'],
  [{receiving_account_key:secondAccount},'WRONG_RECEIVING_ACCOUNT'],
 ]){
  const r=inspect([order],[{...credit,...change}]);
  assert.equal(r.matches[0].match_state,'needs_manual_review');
  assert.equal(r.matches[0].reason,reason);
  assert.equal(r.candidates,0);
  assert.equal(r.paid_orders_confirmed,0);
 }
 const no=inspect([order],[]);
 assert.equal(no.matches[0].reason,'NO_UNIQUE_POSTED_CREDIT_OBSERVED');
 for(const fake of [
  {...credit,direction:'debit'},
  {...credit,bank_status:'pending'},
  {...credit,source_type:'buyer_uploaded_screenshot'},
  {...credit,currency:'cad'},
 ]){
  const r=inspect([order],[fake]);
  assert.equal(r.matches[0].reason,'NO_UNIQUE_POSTED_CREDIT_OBSERVED');
  assert.equal(r.unassigned[0].reason,'BANK_RECORD_UNSUPPORTED_OR_NOT_POSTED');
 }
});

test('bank IDs and reference anomalies cannot be used for duplicate payout',()=>{
 const duplicate=inspect([order],[credit,credit]);
 assert.equal(duplicate.candidates,0);
 assert.equal(duplicate.unassigned.length,2);
 assert.equal(duplicate.unassigned[0].reason,'DUPLICATE_BANK_TRANSACTION_ID');
 const extra={...credit,bank_transaction_id:'BANK-FIXTURE-SECOND-CREDIT'};
 const two=inspect([order],[credit,extra]);
 assert.equal(two.matches[0].reason,'MULTIPLE_CREDIT_OBSERVATIONS_FOR_ORDER');
 const multi=inspect([order],[{...credit,memo:'EC-ABCDEF012345 and EC-999999999999'}]);
 assert.equal(multi.unassigned[0].reason,'MULTIPLE_TRANSFER_REFERENCES');
 const wrong=inspect([order],[{...credit,memo:'not this EC-123456789ABC'}]);
 assert.equal(wrong.unassigned[0].reason,'UNRECOGNIZED_ORDER_REFERENCE');
 const missing=inspect([order],[{...credit,memo:'No invoice memo supplied'}]);
 assert.equal(missing.unassigned[0].reason,'TRANSFER_REFERENCE_MISSING');
 assert.deepEqual(extractBankCreditReferences('refs EC-ABCDEF012345 and EC-ABCDEF012345'),['EC-ABCDEF012345']);
});

test('ambiguous orders or forged order records fail closed',()=>{
 const second={...order,request_id:'bpr_'+'2'.repeat(32)};
 const ambig=inspect([order,second],[credit]);
 assert.equal(ambig.candidates,0);
 assert.equal(ambig.unassigned[0].reason,'AMBIGUOUS_ORDER_REFERENCE');
 assert.throws(()=>inspect([{...order,payment_verified:true}],[credit]),/bank_reconciliation_order_invalid/);
 assert.throws(()=>inspect([order,order],[credit]),/duplicate_payment_request_id/);
 assert.throws(()=>inspect([{...order,receiving_account_key:null}],[credit]),/bank_reconciliation_order_invalid/);
 assert.throws(()=>inspect('invalid',[]),/bank_reconciliation_input_invalid/);
 assert.throws(()=>inspectBankCreditMatches({orders:new Array(10001),observations:[]}),/bank_reconciliation_input_invalid/);
});
