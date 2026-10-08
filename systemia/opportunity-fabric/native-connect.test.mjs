import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from '../lineage/core.mjs';
import {
  normalizeLegacyConnectCase, nativeProvider, planNativeConnect,
  reviewNativeConnectProposal, recordSafeNativeConnectTransaction
} from './native-connect.mjs';

const raw = () => ({
  id: 'legacy-sensitive-db-id',
  case_key: 'recovery-001',
  organization_label: 'Private Family Enterprise',
  problem_statement: 'SECRET FAMILY FINANCIAL STORY',
  private_notes: 'SECRET PRIVATE NOTES',
  source_ref: 'SECRET INTERNAL SOURCE',
  public_safe_summary: 'Established service business seeks an operating partner.',
  capability_needed: ['Operator', 'Capital'],
  evidence_state: 'Public',
  consent_state: 'Not requested',
  route_state: 'New',
  record_state: 'active'
});
const caseFor = (overrides = {}) => normalizeLegacyConnectCase({ ...raw(), ...overrides }, { ownerId: 'owner-1' });
const graph = () => [
  { id: 'node-1',kind:'connect_node',owner_id:'owner-1',label:'Trusted Operator',capabilities:['operator'],record_state:'active',relationship_state:'Warm',evidence_state:'observed',private_email:'SECRET EMAIL',private_notes:'SECRET NODE NOTES' },
  { id: 'member-1',kind:'fabric_member',owner_id:'member-owner',label:'Capital Provider',capabilities:['capital'],record_state:'active',availability:'Available',evidence_state:'self_reported',private_email:'SECRET MEMBER EMAIL' },
  { id: 'held',kind:'connect_node',owner_id:'owner-1',capabilities:['operator'],record_state:'hold',relationship_state:'Hold' },
  { id: 'dnc',kind:'connect_node',owner_id:'owner-1',capabilities:['capital'],record_state:'active',do_not_contact:true },
  { id: 'wrong',kind:'fabric_member',owner_id:'member-owner',capabilities:['distribution'],record_state:'active' }
];
const plan = (caseRecord = caseFor(), providers = graph(), sources) => planNativeConnect({ caseRecord, actorId:'owner-1', providers, sources });
const first = (result, capability) => result.packages.find(p=>p.capability===capability).candidates[0];

test('Base44 legacy shape normalizes into portable private model without granting rights', () => {
  const c=caseFor();
  assert.equal(c.schema,'evercraft.connect.private-case.v1');
  assert.equal(c.private.problem_statement,'SECRET FAMILY FINANCIAL STORY');
  assert.equal(c.consent_state,'not_requested');
  assert.deepEqual(c.capability_needed,['operator','capital']);
  assert.throws(()=>caseFor({capability_needed:[]}),/capabilities_required/);
  assert.throws(()=>caseFor({consent_state:'secretly_permitted'}),/invalid_consent_state/);
  assert.equal(caseFor({do_not_contact:true}).record_state,'hold');
});

test('safe owned routing matches only actual capabilities and has no action authority',()=>{
  const result=plan();
  assert.equal(result.ok,true);
  assert.equal(result.packages.length,2);
  assert.deepEqual(result.unmatched_capabilities,[]);
  assert.equal(first(result,'operator').provider_id,'node-1');
  assert.equal(first(result,'capital').provider_id,'member-1');
  assert.equal(result.outreach_created,false);
  assert.equal(result.payment_created,false);
  assert.equal(result.private_contact_information_returned,false);
  assert.equal(result.persistence,'none');
  const serialized=JSON.stringify(result);
  for(const s of ['SECRET FAMILY','SECRET PRIVATE','SECRET INTERNAL','SECRET EMAIL','SECRET MEMBER']) {
    assert.ok(!serialized.includes(s),'private data leaked into plan: '+s);
  }
});

test('user isolation and held cases fail closed',()=>{
  assert.equal(planNativeConnect({caseRecord:caseFor(),actorId:'intruder',providers:graph()}).status,403);
  assert.equal(plan(caseFor({do_not_contact:true})).ok,false);
  assert.equal(plan(caseFor({route_state:'Hold'})).reason,'case_on_hold_or_archived');
});

test('a provider must declare the needed capability, not simply share geography or a label',()=>{
  const result=plan(caseFor({capability_needed:['precision engineering']}),[
    {id:'same-location',kind:'fabric_member',owner_id:'another',label:'Precision Engineering Works',capabilities:['garden supplies'],record_state:'active'}
  ]);
  assert.deepEqual(result.unmatched_capabilities,['precision engineering']);
  assert.equal(result.packages[0].candidates.length,0);
});

test('booked, held, dnc and self-matching providers are excluded',()=>{
  const providers=graph().concat([
    {id:'self-member',kind:'fabric_member',owner_id:'owner-1',capabilities:['operator']},
    {id:'foreign-node',kind:'connect_node',owner_id:'other',capabilities:['operator']},
    {id:'booked-member',kind:'fabric_member',owner_id:'outside',capabilities:['operator'],availability:'Booked'}
  ]);
  const result=plan(caseFor(),providers);
  const ids=result.packages.flatMap(p=>p.candidates.map(c=>c.provider_id));
  assert.deepEqual(ids.sort(),['member-1','node-1']);
});

test('directory outage is not misreported as absence of partners',()=>{
  assert.equal(plan(caseFor(),graph(),{fabric_members:'error',private_graph:'available'}).status,503);
  assert.equal(plan(caseFor(),graph(),{fabric_members:'available',private_graph:'error'}).retryable,true);
  assert.equal(planNativeConnect({caseRecord:caseFor(),actorId:'owner-1'}).reason,'capability_sources_unavailable');
});

test('stable routing identity and explicit missing gaps',()=>{
  const x=plan();const y=plan();
  assert.equal(x.plan_id,y.plan_id);
  assert.equal(first(x,'operator').proposal_id,first(y,'operator').proposal_id);
  assert.deepEqual(plan(caseFor({capability_needed:['unavailable capability']})).unmatched_capabilities,['unavailable capability']);
});

test('approval is a human review state only; private consent is still required for any introduction',()=>{
  const c=caseFor();const result=plan(c);const p=first(result,'operator');
  const decision=reviewNativeConnectProposal({caseRecord:c,proposal:p,currentProvider:graph()[0],actorId:'owner-1',decision:'Approved'});
  assert.equal(decision.ok,true);
  assert.equal(decision.outreach_created,false);
  assert.equal(decision.protected_material_disclosed,false);
  assert.equal(decision.next_gate,'human_controlled_consent_check_and_connection_request');
});

test('stale approvals fail after changes in need, ownership, hold, capability, or availability',()=>{
  const c=caseFor(); const result=plan(c); const p=first(result,'operator');
  const args={caseRecord:c,proposal:p,currentProvider:graph()[0],actorId:'owner-1',decision:'Approved'};
  assert.equal(reviewNativeConnectProposal({...args,caseRecord:caseFor({capability_needed:['capital']})}).reason,'capability_no_longer_needed');
  assert.equal(reviewNativeConnectProposal({...args,caseRecord:caseFor({route_state:'Hold'})}).reason,'case_on_hold_or_archived');
  assert.equal(reviewNativeConnectProposal({...args,actorId:'intruder'}).status,403);
  assert.equal(reviewNativeConnectProposal({...args,currentProvider:{...graph()[0],capabilities:['sales']}}).reason,'provider_capability_no_longer_matches');
  assert.equal(reviewNativeConnectProposal({...args,currentProvider:{...graph()[0],availability:'Booked'}}).reason,'provider_on_hold_or_unavailable');
  assert.equal(reviewNativeConnectProposal({...args,currentProvider:{...graph()[0],do_not_contact:true}}).reason,'provider_on_hold_or_unavailable');
  assert.equal(reviewNativeConnectProposal({...args,currentProvider:null}).reason,'provider_unavailable');
  assert.equal(reviewNativeConnectProposal({...args,currentProvider:graph()[1]}).reason,'proposal_provider_mismatch');
});

test('reject unknown provider shape and prevent cross-owner private nodes',()=>{
  assert.throws(()=>nativeProvider({kind:'unknown',id:'a',owner_id:'b'}),/provider_kind_invalid/);
  const foreign={...graph()[0],owner_id:'foreign'};
  const p=first(plan(),'operator');
  assert.equal(reviewNativeConnectProposal({caseRecord:caseFor(),proposal:p,currentProvider:foreign,actorId:'owner-1',decision:'Approved'}).status,403);
});

test('Lineage transaction stores only sanitized routing evidence, never private business details',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'connect-native-'));
  try {
    const store=new LineageStore(dir); await store.init();
    const result=plan();
    const receipt=await recordSafeNativeConnectTransaction({lineageStore:store,actorId:'owner-1',plan:result});
    assert.ok(receipt.receipt_id);
    const tx=await store.readObject(receipt.transaction_id);
    const serialized=JSON.stringify(tx);
    assert.equal(tx.payload.kind,'evercraft.connect.plan.proposed.v1');
    assert.equal(tx.payload.authority.publish,false);
    assert.equal(tx.payload.authority.payment,false);
    assert.equal(tx.payload.authority.outreach,false);
    for(const secret of ['SECRET FAMILY','SECRET PRIVATE','SECRET INTERNAL','Private Family Enterprise','Established service business']) {
      assert.ok(!serialized.includes(secret),'private payload in Lineage transaction: '+secret);
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
