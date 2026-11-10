import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateHumanFilterAuthority,installHumanFilterClipGrant} from './humanfilter-publish-authorize.mjs';

const authority=JSON.parse(fs.readFileSync('systemia/clip/authority/humanfilter-autopublish.json','utf8'));
const now=new Date('2026-10-31T01:00:00.000Z');
test('founder standing campaign authority has constrained brand, scope, time and frequency',()=>{
  const checked=validateHumanFilterAuthority(authority,now);
  assert.equal(checked.resource_refs[0],'brand:evercraft');
  assert.equal(checked.boundaries.paid_spend_usd,0);
  assert.equal(checked.boundaries.first_comment_provider_receipt_required,true);
  assert.equal(checked.boundaries.minimum_hours_between_posts_per_platform,72);
  assert.ok(checked.excluded_brand_keys.includes('christmaslightsusa'));
});
test('unrelated brand and expired authority are never passed into Passport',()=>{
  assert.throws(()=>validateHumanFilterAuthority({...authority,resource_refs:['brand:christmaslightsusa']},now),/scope_invalid/);
  assert.throws(()=>validateHumanFilterAuthority(authority,new Date('2028-01-01T00:00:00Z')),/not_current/);
  assert.throws(()=>validateHumanFilterAuthority({...authority,authorized:false},now),/not_valid/);
});
test('the existing Passport issuer receives a nondelegable grant, not social tokens',()=>{
  const calls=[];
  const passport={issueGrant:payload=>{
    calls.push(payload);
    return {state:'created',grant:{grant_id:payload.grant_id,authority_receipt_ref:payload.authority_receipt_ref}};
  }};
  const state=installHumanFilterClipGrant({passport,receipt:authority,now});
  assert.equal(state.status,'created');
  assert.equal(state.secret_material_returned,false);
  assert.equal(calls.length,1);
  assert.equal(calls[0].max_delegation_depth,0);
  assert.deepEqual(calls[0].scopes,['home.clip.publish']);
  assert.deepEqual(calls[0].resource_refs,['brand:evercraft']);
});
