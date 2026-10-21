import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  newMerchantRailCandidates,nominateMerchantRail,assertRegistry,
  saveMerchantRailCandidates,readMerchantRailCandidates,
  publicMerchantRailReadiness,
} from './merchant-rail-readiness.mjs';

const sandbox=()=>fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-rail-readiness-'));

test('merchant rails default disabled; operator nomination is NOT business payment verification',()=>{
  const registry=newMerchantRailCandidates();
  assert.equal(assertRegistry(registry),true);
  for(const rail of ['cash','check','bank_transfer','zelle_business',
    'paypal_business','venmo_business','cash_app_business','card_processor']){
    const status=publicMerchantRailReadiness(registry,rail);
    assert.equal(status.available,false);
    assert.equal(status.payment_destination,null);
    assert.equal(status.fulfillment_authorized,false);
  }
  const proposed=nominateMerchantRail(registry,{
    rail:'bank_transfer',ownerConfirmed:true,reviewNote:'Review with business bank'
  });
  assert.equal(proposed.version,2);
  assert.equal(proposed.records.bank_transfer.status,'owner_nominated_requires_external_verification');
  assert.equal(proposed.records.bank_transfer.eligible_for_public_invoice,false);
  assert.equal(proposed.live_payment_instructions_authorized,false);
  const status=publicMerchantRailReadiness(proposed,'bank_transfer');
  assert.equal(status.nominated_by_operator,true);
  assert.equal(status.available,false);
  assert.equal(status.payment_instructions,null);
  assert.equal(status.reason,'requires_authenticated_merchant_rail_verification');
});

test('no buyer input or merchant preference alone can enable an external collection rail',()=>{
  const registry=newMerchantRailCandidates();
  assert.throws(()=>nominateMerchantRail(registry,{rail:'zelle_business'}),/operator_approval_required/);
  assert.throws(()=>nominateMerchantRail(registry,{rail:'card_processor',ownerConfirmed:true}),/not_supported/);
  assert.throws(()=>nominateMerchantRail(registry,{rail:'fake_rail',ownerConfirmed:true}),/not_supported/);
  assert.throws(()=>nominateMerchantRail(registry,{
    rail:'cash',ownerConfirmed:true,reviewNote:'<script>evil</script>'
  }),/review_note_invalid/);
  const proposed=nominateMerchantRail(registry,{rail:'cash',ownerConfirmed:true});
  assert.throws(()=>nominateMerchantRail(proposed,{rail:'cash',ownerConfirmed:true}),/already_nominated/);
  assert.throws(()=>assertRegistry({...proposed,live_payment_instructions_authorized:true}),/overauthorized/);
  assert.throws(()=>assertRegistry({...proposed,buyer_bank_account:'test'}),/unexpected_fields/);
  assert.throws(()=>assertRegistry({...proposed,records:{
    ...proposed.records,cash:{...proposed.records.cash,eligible_for_public_invoice:true}
  }}),/unverified_status_invalid/);
  assert.throws(()=>assertRegistry({...proposed,records:{
    ...proposed.records,cash:{...proposed.records.cash,provider_token:'fake'}
  }}),/credential_or_extra_fields/);
});

test('private registry can persist across operator processes but never becomes payment authority',()=>{
  const dir=sandbox();
  const parent=path.join(dir,'private');
  const file=path.join(parent,'rail.json');
  try{
    const initial=newMerchantRailCandidates();
    const receipt=saveMerchantRailCandidates(initial,{file});
    assert.equal(receipt.saved,true);
    assert.equal(receipt.public_payment_instructions_enabled,false);
    assert.equal(fs.statSync(parent).mode&0o077,0);
    assert.equal(fs.statSync(file).mode&0o077,0);
    const read=readMerchantRailCandidates({file});
    assert.deepEqual(read,initial);
    const nominated=nominateMerchantRail(read,{rail:'zelle_business',ownerConfirmed:true});
    const second=saveMerchantRailCandidates(nominated,{file});
    assert.equal(second.rails_nominated,1);
    assert.deepEqual(readMerchantRailCandidates({file}),nominated);
    const buyer=publicMerchantRailReadiness(readMerchantRailCandidates({file}),'zelle_business');
    assert.equal(buyer.available,false);
    assert.equal(buyer.payment_destination,null);
    assert.throws(()=>saveMerchantRailCandidates(initial,{file}),/revision_or_overwrite_rejected/);
    fs.chmodSync(file,0o644);
    assert.throws(()=>readMerchantRailCandidates({file}),/not_private/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('existing rails may not be edited or removed by silent overwrite',()=>{
  const dir=sandbox(),file=path.join(dir,'rail.json');
  try{
    const original=newMerchantRailCandidates();
    saveMerchantRailCandidates(original,{file});
    const first=nominateMerchantRail(original,{rail:'paypal_business',ownerConfirmed:true});
    saveMerchantRailCandidates(first,{file});
    const second=nominateMerchantRail(first,{rail:'bank_transfer',ownerConfirmed:true});
    const altered={...second,records:{
      ...second.records,paypal_business:{
        ...second.records.paypal_business,
        review_note:'changed without operator proof'
      }
    }};
    assert.throws(()=>saveMerchantRailCandidates(altered,{file}),/existing_nomination_modified/);
    const clean=saveMerchantRailCandidates(second,{file});
    assert.equal(clean.version,3);
    assert.equal(readMerchantRailCandidates({file}).version,3);
    assert.throws(()=>saveMerchantRailCandidates(second,{file}),/revision_or_overwrite_rejected/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('public interface never includes an actual payment destination or claimed settlement',()=>{
  const registry=nominateMerchantRail(newMerchantRailCandidates(),{
    rail:'venmo_business',ownerConfirmed:true
  });
  const view=publicMerchantRailReadiness(registry,'venmo_business');
  assert.deepEqual(view,{
    rail:'venmo_business',available:false,nominated_by_operator:true,
    reason:'requires_authenticated_merchant_rail_verification',
    payment_destination:null,payment_instructions:null,
    paid:false,fulfillment_authorized:false
  });
  assert.equal(publicMerchantRailReadiness(null,'bank_transfer').available,false);
  assert.equal(publicMerchantRailReadiness(null,'unknown').available,false);
});
