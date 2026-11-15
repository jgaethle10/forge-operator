import assert from 'node:assert/strict';
import test from 'node:test';
import {createBluevineReceivable,recordOfficialInvoiceCreation,acknowledgeCustomerPaymentClaim} from './bluevine-receivables.mjs';

const good = {orderId:'EC-20261020-49',offerKey:'systemia.website_audit_quick_win_49.v1',
 amountCents:4900,ownerAttestedBusinessAccount:true};

test('founder-attested Evercraft LLC Bluevine route creates an unpaid order',()=>{
  const v=createBluevineReceivable(good);
  assert.equal(v.legal_payee,'Evercraft LLC');
  assert.equal(v.business_ownership_evidence,'founder_attested_only');
  assert.equal(v.bank_connection_state,'unverified');
  assert.equal(v.payment_state,'unpaid');
  assert.equal(v.invoice_issued,false);
  assert.equal(v.entitlement_authorized,false);
});

test('other payees and account attestations fail closed',()=>{
  assert.throws(()=>createBluevineReceivable({...good,recipientLegalName:'Someone Else'}),/founder/);
  assert.throws(()=>createBluevineReceivable({...good,ownerAttestedBusinessAccount:false}),/founder/);
  assert.throws(()=>createBluevineReceivable({...good,amountCents:0}),/positive/);
  assert.throws(()=>createBluevineReceivable({...good,orderId:'bad id'}),/canonical/);
});

test('invoice issuance requires manual Bluevine dashboard confirmation, but is not payment',()=>{
  const req=createBluevineReceivable(good);
  assert.throws(()=>recordOfficialInvoiceCreation(req,{invoiceReference:'BV-INV-20261020'}),/owner/);
  const issued=recordOfficialInvoiceCreation(req,{invoiceReference:'BV-INV-20261020',ownerConfirmsInDashboard:true});
  assert.equal(issued.external_invoice_reference,'BV-INV-20261020');
  assert.equal(issued.invoice_issued,true);
  assert.equal(issued.payment_state,'unpaid');
  assert.equal(issued.fulfillment_authorized,false);
});

test('customer screenshot or paid claim never authorizes fulfillment',()=>{
  const req=createBluevineReceivable(good);
  const claimed=acknowledgeCustomerPaymentClaim(req,{customerClaimsPaid:true,screenshot:'proof.png'});
  assert.equal(claimed.payment_state,'unpaid');
  assert.equal(claimed.fulfillment_authorized,false);
  assert.equal(claimed.entitlement_authorized,false);
  assert.match(claimed.reconciliation,/authoritative_bank_verification/);
});
