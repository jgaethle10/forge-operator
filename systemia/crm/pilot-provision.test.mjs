import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {preparePrivatePilotTenant} from './pilot-provision.mjs';
import {loadCustomerWorkspaceFromVault} from './customer-vault.mjs';
const NOW=new Date('2026-10-28T19:00:00Z');
const tenantId='tenant:pilot_blue';
const actor='owner:confirmed';
const divisions=['operations','sales'];
function approval({tenant_id,owner_actor_ref,division_ids}){
 return {approved:true,tenant_id,owner_actor_ref,division_ids,
   approval_ref:'owner:approved-pilot',expires_at:'2026-10-29T19:00:00Z'};
}
function yard(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crm-pilot-setup-'));fs.chmodSync(root,0o700);
 const run=(overrides={})=>preparePrivatePilotTenant({vaultDir:root,tenantId,
  divisionIds:divisions,ownerActorRef:actor,verifyOwnerApproval:approval,
  now:NOW,...overrides});
 return {root,run,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('owner-approved provision creates only empty private pilot, audited and inactive',()=>{
 const f=yard();try{
  const result=f.run();
  assert.equal(result.state,'pilot_prepared_not_activated');
  assert.equal(result.customer_access_issued,false);
  assert.equal(result.billing_verified,false);
  assert.equal(JSON.stringify(result).includes(tenantId),false);
  const file=path.join(f.root,'tenants',createHash('sha256').update(tenantId).digest('hex')+'.json');
  assert.equal(fs.statSync(file).mode&0o077,0);
  const doc=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.deepEqual(doc.records,[]);
  assert.equal(doc.metadata.state,'pilot_prepared_not_activated');
  assert.equal(doc.metadata.production_activated,false);
  assert.equal(doc.metadata.billing_verified,false);
  assert.equal(doc.metadata.contacts_imported,false);
  const audit=fs.readFileSync(path.join(f.root,'pilot-provision-audit.jsonl'),'utf8');
  assert.equal(audit.trim().split('\n').length,1);
  assert.equal(audit.includes('owner:confirmed'),false);
  assert.throws(f.run,/pilot_tenant_already_prepared/);
 }finally{f.cleanup();}
});
test('approved pilot is readable only with a separate authenticated customer scope',()=>{
 const f=yard();try{
  f.run();
  const result=loadCustomerWorkspaceFromVault({vaultDir:f.root,tenantId,
    access:{tenant_id:tenantId,actor_ref:actor,role:'owner',active:true,
     division_ids:divisions,expires_at:'2026-10-29T19:00:00Z'},now:NOW});
  assert.equal(result.entries.length,0);
  assert.equal(result.action_authority,'none');
 }finally{f.cleanup();}
});
test('forged approval, expired consent, extra division and bad tenant identifiers fail without provisioning',()=>{
 for(const input of [
  {verifyOwnerApproval:()=>({approved:true,tenant_id:tenantId,
    owner_actor_ref:actor,division_ids:['operations','sales','executive'],
    approval_ref:'forged',expires_at:'2026-10-29T19:00:00Z'})},
  {verifyOwnerApproval:()=>({approved:true,tenant_id:tenantId,
    owner_actor_ref:actor,division_ids:divisions,
    approval_ref:'expired',expires_at:'2026-10-27T19:00:00Z'})},
  {tenantId:'../../etc'},
  {divisionIds:['sales','sales']},
  {verifyOwnerApproval:null}
 ]){
  const f=yard();try{
   assert.throws(()=>f.run(input));
   assert.equal(fs.existsSync(path.join(f.root,'tenants',
     createHash('sha256').update(tenantId).digest('hex')+'.json')),false);
  }finally{f.cleanup();}
 }
});
test('unsafe vault root cannot create a tenant workspace',()=>{
 const f=yard();try{
  fs.chmodSync(f.root,0o755);
  assert.throws(f.run,/pilot_vault_directory_unsafe/);
 }finally{f.cleanup();}
});
