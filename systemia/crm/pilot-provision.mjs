import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const tenantFile=x=>createHash('sha256').update(x).digest('hex')+'.json';
const idPattern=/^tenant:[a-z0-9][a-z0-9_-]{1,62}$/;
const divPattern=/^[a-z][a-z0-9_.-]{1,62}$/;
const req=(x,n)=>{if(typeof x!=='string'||!x.trim())throw Error(n+'_required');return x.trim();};
function privateDir(dir){
 const st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||
    (process.platform!=='win32'&&(st.mode&0o077)!==0))throw Error('pilot_vault_directory_unsafe');
}
function audit(file,receipt){
 let fd;
 try{
  fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_CREAT|
    (fs.constants.O_NOFOLLOW||0),0o600);
  const st=fs.fstatSync(fd);
  if(!st.isFile()||(process.platform!=='win32'&&(st.mode&0o077)!==0))
    throw Error('pilot_audit_unsafe');
  fs.writeFileSync(fd,JSON.stringify(receipt)+'\n');
  fs.fsyncSync(fd);
 }finally{if(fd!==undefined)fs.closeSync(fd);}
}
/**
 * Operator-only setup for an empty private pilot namespace.
 * Does not create customer login, load contacts, bill or activate a tenant.
 * The approval callback must be held by a trusted operator backend, not HTTP.
 */
export function preparePrivatePilotTenant({
 vaultDir='',tenantId='',divisionIds=[],ownerActorRef='',
 verifyOwnerApproval=null,now=new Date()
}={}){
 const tenant=req(tenantId,'tenant_id'),owner=req(ownerActorRef,'owner_actor_ref');
 if(!idPattern.test(tenant))throw Error('pilot_tenant_id_invalid');
 if(!Array.isArray(divisionIds)||divisionIds.length===0||divisionIds.length>40||
    !divisionIds.every(x=>typeof x==='string'&&divPattern.test(x))||
    new Set(divisionIds).size!==divisionIds.length)
   throw Error('pilot_divisions_invalid');
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('pilot_clock_invalid');
 if(typeof verifyOwnerApproval!=='function')throw Error('pilot_owner_approval_missing');
 const args={tenant_id:tenant,owner_actor_ref:owner,
   division_ids:[...divisionIds].sort(),now};
 const decision=verifyOwnerApproval(args);
 if(decision?.then||decision?.approved!==true||
    decision?.tenant_id!==tenant||decision?.owner_actor_ref!==owner||
    JSON.stringify([...decision.division_ids||[]].sort())!==JSON.stringify(args.division_ids)||
    !req(decision.approval_ref,'pilot_approval_ref')||
    !Number.isFinite(Date.parse(decision.expires_at))||
    Date.parse(decision.expires_at)<=now.getTime())
   throw Error('pilot_owner_approval_invalid');
 const root=path.resolve(req(vaultDir,'pilot_vault_dir'));
 privateDir(root);
 const tenants=path.join(root,'tenants');
 try{fs.mkdirSync(tenants,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
 privateDir(tenants);
 const file=path.join(tenants,tenantFile(tenant));
 const doc={schema:'evercraft.crm.tenant-private-records.v1',
  tenant_id:tenant,records:[],
  metadata:{state:'pilot_prepared_not_activated',division_ids:args.division_ids,
    owner_actor_ref:owner,approval_ref:decision.approval_ref,
    observed_at:now.toISOString(),billing_verified:false,
    production_activated:false,contacts_imported:false}};
 let fd;
 try{
  fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|
    fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),0o600);
  fs.writeFileSync(fd,JSON.stringify(doc)+'\n');fs.fsyncSync(fd);
 }catch(e){if(e?.code==='EEXIST')throw Error('pilot_tenant_already_prepared');throw e;}
 finally{if(fd!==undefined)fs.closeSync(fd);}
 const dirFd=fs.openSync(tenants,fs.constants.O_RDONLY);
 try{fs.fsyncSync(dirFd);}finally{fs.closeSync(dirFd);}
 const receipt={schema:'evercraft.crm.pilot-provision-receipt.v1',
  state:'pilot_prepared_not_activated',
  tenant_digest:hash(tenant),approval_digest:hash(decision.approval_ref),
  actor_digest:hash(owner),division_count:divisionIds.length,
  prepared_at:now.toISOString(),billing_verified:false,
  customer_access_issued:false,contacts_imported:false};
 // If an audit write fails, the tenant stays unactivated and requires manual
 // reconciliation. Never retry with another identity or overwrite the file.
 audit(path.join(root,'pilot-provision-audit.jsonl'),receipt);
 return receipt;
}
