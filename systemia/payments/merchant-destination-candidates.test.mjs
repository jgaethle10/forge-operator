import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {
  buildMerchantDestinationCandidates,assertMerchantDestinationCandidates,
  readMerchantDestinationCandidates,writeMerchantDestinationCandidates,
  merchantCandidateStatus
} from './merchant-destination-candidates.mjs';

const fakeInput=()=>({
  cashAppUrl:'https://cash.app/$TESTMERCHANT123',
  venmoHandle:'@Test-Merchant-123',
  zelleQrSubmitted:true,paypalQrSubmitted:true,
  ownerApproved:true
});
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-private-merchant-test-'));
const script=fileURLToPath(new URL('../../scripts/evercraft-merchant-payment-candidates.mjs',import.meta.url));

test('candidate intake stores only two submitted handles and QR evidence without phone or QR payload',()=>{
  const r=buildMerchantDestinationCandidates(fakeInput());
  assert.equal(assertMerchantDestinationCandidates(r),true);
  assert.equal(r.methods.cash_app_business.value,'https://cash.app/$TESTMERCHANT123');
  assert.equal(r.methods.venmo_business.value,'@Test-Merchant-123');
  assert.equal(r.methods.zelle_business.value,null);
  assert.equal(r.methods.paypal_business.value,null);
  assert.equal(r.methods.zelle_business.source_detail,'qr_present_not_stored');
  for(const value of Object.values(r.methods)){
    assert.equal(value.business_use_eligible,false);
    assert.equal(value.customer_visible,false);
    assert.equal(value.destination_verified,false);
    assert.equal(value.settlement_verified,false);
  }
  assert.equal(r.live_invoice_routing_enabled,false);
  const visible=merchantCandidateStatus(r);
  assert.equal(visible.candidate_record_stored,true);
  assert.equal(visible.public_payment_instructions_enabled,false);
  assert.equal(visible.paid_receipt_verified,false);
  assert.equal(JSON.stringify(visible).includes('TESTMERCHANT123'),false);
  assert.equal(JSON.stringify(visible).includes('Test-Merchant-123'),false);
});
test('never accept identity, bank account, credentials or false merchant verification in candidate file',()=>{
  const base=buildMerchantDestinationCandidates(fakeInput());
  const bad={...base,methods:{...base.methods,zelle_business:{
    ...base.methods.zelle_business,value:'PRIVATE_PHONE'
  }}};
  assert.throws(()=>assertMerchantDestinationCandidates(bad),/qr_candidate_must_not_store_private_data/);
  assert.throws(()=>assertMerchantDestinationCandidates({
    ...base,live_invoice_routing_enabled:true
  }),/not_verified_or_schema_invalid/);
  assert.throws(()=>assertMerchantDestinationCandidates({
    ...base,methods:{...base.methods,cash_app_business:{
      ...base.methods.cash_app_business,customer_visible:true
    }}
  }),/unverified_destination_cannot_be_public/);
  assert.throws(()=>assertMerchantDestinationCandidates({
    ...base,bank_account:'TEST_ONLY'
  }),/not_verified_or_schema_invalid/);
  assert.throws(()=>buildMerchantDestinationCandidates({...fakeInput(),ownerApproved:false}),/operator_approval_required/);
  assert.throws(()=>buildMerchantDestinationCandidates({...fakeInput(),cashAppUrl:'javascript:alert(1)'}),/invalid/);
  assert.throws(()=>buildMerchantDestinationCandidates({...fakeInput(),venmoHandle:'@https://bad'}),/invalid/);
});
test('candidate file is owner-only on disk, cannot overwrite, and reader redacts',()=>{
  const dir=temp(),file=path.join(dir,'private','candidate.json');
  try{
    const data=buildMerchantDestinationCandidates(fakeInput());
    const result=writeMerchantDestinationCandidates(data,{file});
    assert.equal(result.candidate_record_stored,true);
    assert.equal(result.live_checkout_enabled,false);
    assert.equal(fs.statSync(path.dirname(file)).mode&0o077,0);
    assert.equal(fs.statSync(file).mode&0o077,0);
    assert.deepEqual(readMerchantDestinationCandidates({file}),data);
    assert.throws(()=>writeMerchantDestinationCandidates(data,{file}),/already_exist/);
    fs.chmodSync(file,0o644);
    assert.throws(()=>readMerchantDestinationCandidates({file}),/not_owner_private/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('symlink ancestor cannot redirect private payment candidates into another tree',()=>{
  const root=temp(),target=path.join(root,'target'),link=path.join(root,'link');
  try{
    fs.mkdirSync(target, {mode:0o700});
    fs.symlinkSync(target,link);
    assert.throws(()=>writeMerchantDestinationCandidates(
      buildMerchantDestinationCandidates(fakeInput()),
      {file:path.join(link,'private','candidate.json')}
    ),/symlink_ancestor_forbidden/);
    assert.equal(fs.existsSync(path.join(target,'private','candidate.json')),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('operator CLI stages fake merchant candidates privately and never prints handles',()=>{
  const root=temp();
  try{
    const payload=fakeInput();
    delete payload.ownerApproved;
    const env={...process.env,HOME:root};
    const input=JSON.stringify(payload);
    const staged=spawnSync(process.execPath,[script,'stage','--owner-approved'],{
      cwd:root,env,encoding:'utf8',input,timeout:5000
    });
    assert.equal(staged.status,0,staged.stderr);
    const v=JSON.parse(staged.stdout);
    assert.equal(v.candidate_record_stored,true);
    assert.equal(v.business_eligibility_verified,undefined);
    assert.equal(v.merchant_business_eligibility_verified,false);
    assert.equal(staged.stdout.includes(payload.cashAppUrl),false);
    assert.equal(staged.stdout.includes(payload.venmoHandle),false);
    const status=spawnSync(process.execPath,[script,'status'],{
      cwd:root,env,encoding:'utf8',timeout:5000
    });
    assert.equal(status.status,0,status.stderr);
    assert.equal(JSON.parse(status.stdout).candidate_methods.length,4);
    const duplicate=spawnSync(process.execPath,[script,'stage','--owner-approved'],{
      cwd:root,env,encoding:'utf8',input,timeout:5000
    });
    assert.notEqual(duplicate.status,0);
    assert.match(duplicate.stderr,/already_exist/);
    assert.equal(duplicate.stderr.includes(payload.cashAppUrl),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
