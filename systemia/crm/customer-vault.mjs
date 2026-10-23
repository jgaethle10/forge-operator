import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildCustomerRelationshipWorkspace} from './customer-workspace.mjs';

const hex=v=>createHash('sha256').update(v).digest('hex');
function privateFolder(folder){
 const st=fs.lstatSync(folder);
 if(!st.isDirectory()||st.isSymbolicLink()||
   (process.platform!=='win32'&&(st.mode&0o077)!==0))
   throw Error('customer_vault_folder_unsafe');
}
function checkIdentity(tenantId,access){
 if(typeof tenantId!=='string'||!/^tenant:[a-z0-9][a-z0-9_-]{1,62}$/.test(tenantId)||
    access?.tenant_id!==tenantId||access?.active!==true)
   throw Error('customer_vault_access_denied');
}
function privateJsonFile(filename){
 const fd=fs.openSync(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
   const st=fs.fstatSync(fd);
   if(!st.isFile()||st.size>8*1024*1024||
      (process.platform!=='win32'&&(st.mode&0o077)!==0))
     throw Error('customer_vault_file_unsafe');
   return JSON.parse(fs.readFileSync(fd,'utf8'));
 }finally{fs.closeSync(fd);}
}
/**
 * Private, read-only tenant file boundary. A trusted session provider must
 * authenticate the access record; callers cannot supply browser role claims.
 * Raw business records never cross the static preview/public directory.
 */
export function loadCustomerWorkspaceFromVault({
 vaultDir='',tenantId='',access=null,now=new Date()
}={}){
 // Prevent the existence/timing of another tenant's directory being probed.
 checkIdentity(tenantId,access);
 if(typeof vaultDir!=='string'||!vaultDir.trim())throw Error('customer_vault_unconfigured');
 const root=path.resolve(vaultDir);
 privateFolder(root);
 const tenants=path.join(root,'tenants');
 privateFolder(tenants);
 const file=path.join(tenants,hex(tenantId)+'.json');
 const doc=privateJsonFile(file);
 if(doc?.schema!=='evercraft.crm.tenant-private-records.v1'||doc.tenant_id!==tenantId||
    !Array.isArray(doc.records)||doc.records.some(r=>r?.tenant_id!==tenantId))
   throw Error('customer_vault_source_mismatch');
 return buildCustomerRelationshipWorkspace({
   tenantId,access,records:doc.records,now
 });
}
