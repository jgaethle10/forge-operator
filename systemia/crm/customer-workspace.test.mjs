import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCustomerRelationshipWorkspace} from './customer-workspace.mjs';
const now=new Date('2026-10-22T20:00:00Z');
const access={tenant_id:'tenant:harbor',actor_ref:'operator:1',active:true,role:'operator',
 division_ids:['home'],expires_at:'2026-10-23T20:00:00Z'};
function row(data={}){
 return {tenant_id:'tenant:harbor',relationship_ref:'rel:1',subject_ref:'person:1',
  division_id:'home',display_name:'Northwind Historical Center',kind:'partner',
  stage:'meeting_discussed',source_ref:'provider:message-101',
  observed_at:'2026-10-21T00:00:00Z',evidence_state:'verified',
  outbound_policy:'manual_review_only',next_review_at:'2026-10-20T00:00:00Z',
  next_action_state:'open',timeline:[{type:'contact_window_acknowledged',
   occurred_at:'2026-10-10T00:00:00Z',evidence_ref:'message:101',
   private_context:'Please check back after our annual event.'}],...data};
}
const build=(change={})=>buildCustomerRelationshipWorkspace({
 tenantId:'tenant:harbor',access,records:[row()],now,...change});
test('authenticated workspace presents evidence, due work and review-only contact status',()=>{
 const result=build();
 assert.equal(result.counts.relationships,1);
 assert.equal(result.counts.review_due,1);
 assert.equal(result.counts.contact_held,1);
 assert.equal(result.entries[0].contact_state,'human_review_required');
 assert.match(result.entries[0].timeline[0].context,/annual event/);
 assert.equal(result.action_authority,'none');
});
test('cross-tenant records are invisible, even when names match',()=>{
 const other=row({tenant_id:'tenant:other',relationship_ref:'other:1',
   display_name:'SECRET FROM OTHER CUSTOMER',timeline:[{type:'note',
   occurred_at:'2026-10-20T00:00:00Z',evidence_ref:'secret:ref',private_context:'SECRET_NOT_VISIBLE'}]});
 const result=build({records:[row(),other]});
 assert.equal(result.counts.relationships,1);
 assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
test('division-scope is strict even for records belonging to same tenant',()=>{
 const other=row({relationship_ref:'rel:2',subject_ref:'person:2',
   division_id:'unassigned',display_name:'HIDDEN INTERNAL RECORD'});
 const result=build({records:[row(),other]});
 assert.equal(result.entries.length,1);
 assert.equal(JSON.stringify(result).includes('HIDDEN INTERNAL RECORD'),false);
});
test('tenant-wide no-contact request holds across business divisions',()=>{
 const r2=row({relationship_ref:'rel:2',division_id:'another',
   timeline:[{type:'no_contact_requested',occurred_at:'2026-10-20T00:00:00Z',evidence_ref:'message:optout'}]});
 const result=build({records:[row({outbound_policy:'preflight_eligible'}),r2]});
 assert.equal(result.entries.length,1);
 assert.equal(result.entries[0].contact_state,'no_contact_hold');
});
test('viewer may inspect evidence metadata but not private notes',()=>{
 const result=build({access:{...access,role:'viewer'}});
 assert.equal(result.entries[0].timeline[0].context,undefined);
 assert.equal(result.entries[0].timeline[0].evidence_ref,'message:101');
});
test('forged tenant, expired login, inactive actor and missing scope all deny',()=>{
 for(const forged of [
  {...access,tenant_id:'tenant:other'},
  {...access,expires_at:'2026-10-21T00:00:00Z'},
  {...access,active:false},
  {...access,division_ids:[]},
  {...access,role:'root'}
 ])assert.throws(()=>build({access:forged}),/workspace_access_(denied|expired)/);
});
test('duplicate relationship identity in one tenant fails closed',()=>{
 assert.throws(()=>build({records:[row(),row()]}),/workspace_relationship_duplicate/);
});
test('only independently authorized preflight can consider outreach',()=>{
 const result=build({records:[row({outbound_policy:'preflight_eligible'})]});
 assert.equal(result.entries[0].contact_state,'independent_preflight_required');
 assert.equal(result.action_authority,'none');
});
test('completed follow-ups do not remain due',()=>{
 const result=build({records:[row({next_action_state:'completed',
  next_action_evidence_ref:'review:123',next_action_decided_at:'2026-10-21T00:00:00Z'})]});
 assert.equal(result.counts.review_due,0);
});
