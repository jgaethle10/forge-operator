import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewListing, publicListing, matchPartnerCandidates, previewFundingTotals, contributionGate } from './lift-core.mjs';

const approved = () => ({
  id:'TEST-001', status:'approved', category:'utilities', goal_cents:80000, assistance_kind:'bill_payment',
  verification:{identity:'verified', need:'verified'},
  consent:{public_listing:true, data_processing:true},
  disbursement:{state:'approved', destination:'verified_provider_or_partner'},
  public:{title:'Help with heating', region:'Central Washington', summary:'Heating assistance needed'},
  private:{full_name:'Never Show', home_address:'Never Show', bill_image:'Never Show', bank_account:'Never Show'}
});

test('approved and consented cases can be listed with strict public allowlist', () => {
  const item = publicListing(approved());
  assert.equal(reviewListing(approved()).publishable, true);
  assert.deepEqual(Object.keys(item).sort(), ['assistance_kind','category','goal_cents','id','payments_available','region','summary','title','verification_label']);
  assert.ok(!JSON.stringify(item).includes('Never Show'));
  assert.equal(item.payments_available, false);
});

test('missing consent, verification, approved payee or sensible goal blocks listing', () => {
  const changes = [
    x=>x.consent.public_listing=false, x=>x.verification.need='pending',
    x=>x.verification.identity='pending',x=>x.disbursement.destination='beneficiary',
    x=>x.disbursement.state='pending',x=>x.goal_cents=0,x=>x.status='draft'
  ];
  for (const update of changes) {
    const item=approved(); update(item);
    assert.equal(reviewListing(item).publishable,false);
    assert.throws(()=>publicListing(item),/blocked/);
  }
});

test('partner directory produces unconfirmed candidates, never a guarantee', () => {
  const partners = [
    {id:'org-1',public_name:'Community Relief',active:true,categories:['utilities'],regions:['Central Washington'],assistance_kinds:['bill_payment']},
    {id:'org-2',public_name:'Elsewhere',active:true,categories:['utilities'],regions:['Other'],assistance_kinds:['bill_payment']},
    {id:'org-3',public_name:'Inactive',active:false,categories:['utilities'],regions:['*'],assistance_kinds:['bill_payment']}
  ];
  assert.deepEqual(matchPartnerCandidates(publicListing(approved()),partners),[{partner_id:'org-1',name:'Community Relief',status:'possible_match_unconfirmed'}]);
});

test('funding preview ignores unverified events, invalid amounts, and duplicate receipts',()=>{
  const result=previewFundingTotals([
    {type:'settled',receipt_id:'r1',amount_cents:10000,authoritative_receipt_verified:true},
    {type:'settled',receipt_id:'r1',amount_cents:10000,authoritative_receipt_verified:true},
    {type:'settled',receipt_id:'r2',amount_cents:99999,authoritative_receipt_verified:false},
    {type:'reversed',receipt_id:'r3',amount_cents:2000,authoritative_receipt_verified:true},
    {type:'settled',receipt_id:'r4',amount_cents:-100,authoritative_receipt_verified:true}
  ]);
  assert.deepEqual(result,{verified_net_cents:8000,estimated_only:true});
});

test('all contributions and direct payouts are disabled',()=>{
  assert.equal(contributionGate().allowed,false);
  assert.equal(contributionGate().checkout_enabled,false);
  assert.equal(contributionGate().direct_beneficiary_payouts_enabled,false);
});
