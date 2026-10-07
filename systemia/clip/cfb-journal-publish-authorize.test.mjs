import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EvercraftPassport } from '../passport/passport.mjs';
import { authorizeCfbJournalResident, authorizeCfbJournalResidentFromReceipt, validateCfbClipAuthorityReceipt } from './cfb-journal-publish-authorize.mjs';

test('authorization installer grants only CFB series publication scope',()=>{
  const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'cfb-publish-passport-'));
  try{
    const passport=new EvercraftPassport({stateDir});
    const receipt=authorizeCfbJournalResident({
      passport,
      authorityReceiptRef:'operator-receipt:cfb-autopublish-test',
      startsAt:'2026-10-07T05:00:00.000Z',
      endsAt:'2027-01-20T05:00:00.000Z',
    });
    assert.equal(receipt.state,'granted');
    assert.deepEqual(receipt.scopes,['home.clip.publish']);
    assert.deepEqual(receipt.resource_refs,['journal-series:cfb-power-rankings']);
    assert.equal(receipt.secret_material_returned,false);

    const allowed=passport.authorize({
      subject_ref:'system:cfb-clip-publisher',
      product:'evercraft-home',
      scope:'home.clip.publish',
      resource_ref:'journal-series:cfb-power-rankings',
      at:'2026-10-08T05:00:00.000Z',
    });
    assert.equal(allowed.decision,'allow');

    const denied=passport.authorize({
      subject_ref:'system:cfb-clip-publisher',
      product:'evercraft-home',
      scope:'home.clip.publish',
      resource_ref:'journal-series:nfl-power-rankings',
      at:'2026-10-08T05:00:00.000Z',
    });
    assert.equal(denied.decision,'deny');
  }finally{
    fs.rmSync(stateDir,{recursive:true,force:true});
  }
});

test('authorization installer refuses to mint authority without an operator receipt',()=>{
  const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'cfb-publish-passport-'));
  try{
    const passport=new EvercraftPassport({stateDir});
    assert.throws(()=>authorizeCfbJournalResident({
      passport,
      endsAt:'2027-01-20T05:00:00.000Z',
    }),/authority_receipt_ref_required/);
  }finally{
    fs.rmSync(stateDir,{recursive:true,force:true});
  }
});


function authorityReceipt(overrides={}){
  return {
    schema:'evercraft.clip.operator-authority.v1',
    authorized:true,
    authority_state:'manual_authorized',
    authority_receipt_ref:'operator-directive:test:cfb-power-rankings',
    issuer_ref:'authority:evercraft-operator',
    subject_ref:'system:cfb-clip-publisher',
    product:'evercraft-home',
    scopes:['home.clip.publish'],
    resource_refs:['journal-series:cfb-power-rankings'],
    excluded_brand_keys:['rnb-chicken-and-soul'],
    starts_at:'2026-10-07T06:20:00.000Z',
    ends_at:'2027-02-16T08:00:00.000Z',
    ...overrides,
  };
}

test('operator authority receipt can bootstrap the same bounded grant idempotently',()=>{
  const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'cfb-publish-passport-'));
  try{
    const passport=new EvercraftPassport({stateDir});
    const first=authorizeCfbJournalResidentFromReceipt({passport,receipt:authorityReceipt()});
    const second=authorizeCfbJournalResidentFromReceipt({passport,receipt:authorityReceipt()});
    assert.equal(first.state,'granted');
    assert.equal(second.state,'duplicate');
    const allowed=passport.authorize({
      subject_ref:'system:cfb-clip-publisher',
      product:'evercraft-home',
      scope:'home.clip.publish',
      resource_ref:'journal-series:cfb-power-rankings',
      at:'2026-10-08T05:00:00.000Z',
    });
    assert.equal(allowed.decision,'allow');
  }finally{
    fs.rmSync(stateDir,{recursive:true,force:true});
  }
});

test('operator authority receipt fails closed if it broadens scope or omits the R&B exclusion',()=>{
  assert.throws(
    ()=>validateCfbClipAuthorityReceipt(authorityReceipt({scopes:['home.clip.*']})),
    /scope_invalid/
  );
  assert.throws(
    ()=>validateCfbClipAuthorityReceipt(authorityReceipt({resource_refs:['journal-series:nfl-power-rankings']})),
    /resource_invalid/
  );
  assert.throws(
    ()=>validateCfbClipAuthorityReceipt(authorityReceipt({excluded_brand_keys:[]})),
    /rnb_exclusion_required/
  );
});
