import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadCustomerWorkspaceFromVault} from './customer-vault.mjs';
const now=new Date('2026-10-22T20:00:00Z');
const tenantId='tenant:harbor';
const access={tenant_id:tenantId,actor_ref:'private:owner-1',role:'owner',
 active:true,division_ids:['home'],expires_at:'2026-10-25T00:00:00Z'};
const rel={
 tenant_id:tenantId,relationship_ref:'relationship:test-1',subject_ref:'subject:private-1',
 division_id:'home',display_name:'Fictional Studio',kind:'partner',
 stage:'review_required',outbound_policy:'manual_review_only',
 source_ref:'private:fictional-source',observed_at:'2026-10-21T00:00:00Z',
 next_review_at:'2026-10-21T00:00:00Z',timeline:[{type:'note',
  occurred_at:'2026-10-21T00:00:00Z',evidence_ref:'private:synthetic',
  private_context:'Sample operator context'}]
};
function yard(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crm-customer-vault-'));
 fs.chmodSync(root,0o700);
 const tenants=path.join(root,'tenants');fs.mkdirSync(tenants,{mode:0o700});
 const file=path.join(tenants,createHash('sha256').update(tenantId).digest('hex')+'.json');
 function write(value){
  fs.writeFileSync(file,JSON.stringify(value),{mode:0o600});
 }
 write({schema:'evercraft.crm.tenant-private-records.v1',
  tenant_id:tenantId,records:[rel]});
 return {root,tenants,file,write,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('authorized owner reads only its own protected customer tenant file',()=>{
 const f=yard();try{
  const result=loadCustomerWorkspaceFromVault({vaultDir:f.root,tenantId,access,now});
  assert.equal(result.entries.length,1);
  assert.equal(result.entries[0].display_name,'Fictional Studio');
  assert.equal(result.counts.review_due,1);
  assert.equal(result.action_authority,'none');
 }finally{f.cleanup();}
});
test('cross-tenant access is rejected before opening tenant filesystem',()=>{
 const f=yard();try{
  assert.throws(()=>loadCustomerWorkspaceFromVault({
   vaultDir:f.root,tenantId:'tenant:unrelated',access,now
  }),/customer_vault_access_denied/);
  assert.throws(()=>loadCustomerWorkspaceFromVault({
   vaultDir:f.root,tenantId:'../../etc',access,now
  }),/customer_vault_access_denied/);
 }finally{f.cleanup();}
});
test('mixed-tenant private files fail closed instead of leaking any record',()=>{
 const f=yard();try{
  f.write({schema:'evercraft.crm.tenant-private-records.v1',tenant_id:tenantId,
   records:[rel,{...rel,tenant_id:'tenant:secret',relationship_ref:'relationship:secret'}]});
  assert.throws(()=>loadCustomerWorkspaceFromVault({
   vaultDir:f.root,tenantId,access,now
  }),/customer_vault_source_mismatch/);
 }finally{f.cleanup();}
});
test('insecure parent, file and symlink cannot be used as private customer source',()=>{
 const f=yard();try{
  const read=()=>loadCustomerWorkspaceFromVault({vaultDir:f.root,tenantId,access,now});
  fs.chmodSync(f.file,0o644);assert.throws(read,/customer_vault_file_unsafe/);
  fs.chmodSync(f.file,0o600);
  fs.chmodSync(f.tenants,0o755);assert.throws(read,/customer_vault_folder_unsafe/);
  fs.chmodSync(f.tenants,0o700);
  const target=f.file+'.target';
  fs.renameSync(f.file,target);fs.symlinkSync(target,f.file);
  assert.throws(read);
 }finally{f.cleanup();}
});
test('viewer role cannot see private context from an authorized tenant file',()=>{
 const f=yard();try{
  const result=loadCustomerWorkspaceFromVault({
   vaultDir:f.root,tenantId,access:{...access,role:'viewer'},now
  });
  assert.equal(result.entries[0].timeline[0].context,undefined);
  assert.equal(result.entries[0].timeline[0].evidence_ref,'private:synthetic');
 }finally{f.cleanup();}
});
