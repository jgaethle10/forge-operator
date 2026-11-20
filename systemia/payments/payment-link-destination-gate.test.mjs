import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPaymentLinkDestinations} from './payment-link-destination-gate.mjs';
const accountId='acct_fixture123';
const link=(id,after_completion,active=true)=>({id:'plink_'+id,active,after_completion});
const hosted={type:'hosted_confirmation',hosted_confirmation:{}};
const redirect=url=>({type:'redirect',redirect:{url}});
const run=(links,over={})=>auditPaymentLinkDestinations({
 accountId,approvedAccountId:accountId,links,hasMore:false,...over
});
test('live active Base44 after-completion redirect held, not misreported as paid',()=>{
 const data=[
  link('LegacyFreight19',redirect('https://systemia-atlas-7c7bb042.base44.app/BilingualFreightPack?payment=success')),
  link('LegacyFreight29',redirect('https://systemia-atlas-7c7bb042.base44.app/StarterVault?payment=success')),
  link('SafeAudit49',hosted)
 ];
 const r=run(data);
 assert.equal(r.active,3);
 assert.equal(r.retired_runtime_redirects,2);
 assert.equal(r.held_count,2);
 assert.equal(r.hosted_confirmation,1);
 assert.equal(r.status,'owner_action_required');
 assert.equal(r.provider_mutations,0);
 assert.equal(r.received_payment_verified,false);
 assert.equal(r.fulfillment_verified,false);
 const serialized=JSON.stringify(r);
 assert.ok(!serialized.includes('base44.app'));
 assert.ok(!serialized.includes('plink_LegacyFreight19'));
});
test('unknown and malformed redirect targets are held; known owned path needs exact attestation',()=>{
 const r=run([
  link('OtherHost',redirect('https://other.example/pay-success')),
  link('Bad',redirect('http://owned.example/success')),
  link('Owned',redirect('https://evercraft.example/paid?session_id=123'))],
  {knownOwnedRedirects:['https://evercraft.example/paid']});
 assert.equal(r.held_count,2);
 assert.equal(r.other_unattested_holds,2);
 assert.equal(r.findings[2].state,'owned_destination_attested');
 assert.equal(r.findings[2].payment_received_verified,false);
});
test('nested and percent-encoded retired destination cannot evade by owned outer host',()=>{
 const nested='https://evercraft.example/complete?return='+encodeURIComponent('https://legacy.base44.app/after');
 const r=run([link('Nested',redirect(nested))],{knownOwnedRedirects:['https://evercraft.example/complete']});
 assert.equal(r.retired_runtime_redirects,1);
 assert.equal(r.findings[0].state,'hold_retired_runtime_redirect');
});
test('malformed provider records, duplicate IDs, unknown account and incomplete pagination fail closed',()=>{
 assert.throws(()=>run([link('A',hosted)],{hasMore:true}),/list_incomplete/);
 assert.throws(()=>run([link('A',hosted)],{approvedAccountId:'acct_wrong'}),/identity_unverified/);
 assert.throws(()=>run([link('A',hosted),link('A',hosted)]),/record_invalid/);
 assert.throws(()=>run([{id:'bad',active:true,after_completion:hosted}]),/record_invalid/);
 assert.throws(()=>run([link('A',hosted)],{knownOwnedRedirects:['https://legacy.base44.app/paid']}),/attestation/);
 assert.throws(()=>run([link('A',hosted)],{knownOwnedRedirects:['https://evercraft.example/paid?sid=1']}),/attestation/);
});
test('inactive historical links are counted but not treated as live exposure',()=>{
 const r=run([link('Old',redirect('https://legacy.base44.app/old'),false),link('Current',hosted)]);
 assert.equal(r.inactive,1);
 assert.equal(r.active,1);
 assert.equal(r.held_count,0);
 assert.equal(r.status,'no_destination_holds_in_provider_snapshot');
 assert.equal(r.fulfillment_verified,false);
});
