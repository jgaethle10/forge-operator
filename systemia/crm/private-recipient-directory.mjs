import fs from 'node:fs';
import path from 'node:path';

const req=(x,n)=>{if(typeof x!=='string'||!x.trim())throw Error(n+'_invalid');return x.trim();};
const when=(x,n)=>{const t=Date.parse(req(x,n));if(!Number.isFinite(t))throw Error(n+'_invalid');return t;};
const emailPattern=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
function readPrivate(file){
 const p=path.resolve(req(file,'recipient_directory'));
 const root=fs.lstatSync(path.dirname(p));
 if(!root.isDirectory()||root.isSymbolicLink()||
    (process.platform!=='win32'&&(root.mode&0o077)!==0))
    throw Error('recipient_directory_parent_unsafe');
 const fd=fs.openSync(p,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
  const st=fs.fstatSync(fd);
  if(!st.isFile()||(process.platform!=='win32'&&(st.mode&0o077)!==0)||
     st.size>2*1024*1024)throw Error('recipient_directory_file_unsafe');
  return JSON.parse(fs.readFileSync(fd,'utf8'));
 }finally{fs.closeSync(fd);}
}
/**
 * This maps one private CRM party-and-division record to one independently
 * verified email address. It is identity evidence, never consent to outreach.
 */
export function resolvePrivateEmailRecipient({
 recipientDirectoryFile='',subjectRef='',divisionId='',now=new Date(),
 maxAgeDays=365
}={}){
 const doc=readPrivate(recipientDirectoryFile);
 if(doc?.schema!=='evercraft.crm.recipient-directory.v1'||
    doc.tenant_id!=='evercraft'||!Array.isArray(doc.links)||doc.links.length>10000)
   throw Error('recipient_directory_invalid');
 if(!Number.isInteger(maxAgeDays)||maxAgeDays<1||maxAgeDays>3650)
   throw Error('recipient_age_limit_invalid');
 const subject=req(subjectRef,'subject_ref'),division=req(divisionId,'division_id');
 const rows=doc.links.filter(x=>x?.subject_ref===subject&&x?.division_id===division&&x?.channel==='email');
 if(rows.length!==1)throw Error('recipient_missing_or_ambiguous');
 const row=rows[0];
 if(row.status!=='verified'||row.identity_confirmation!==true)
   throw Error('recipient_not_verified');
 const recipient=req(row.mailbox,'mailbox');
 if(!emailPattern.test(recipient)||recipient.length>254)throw Error('mailbox_invalid');
 const source=req(row.evidence_ref,'evidence_ref');
 if(!source)throw Error('source_missing');
 const verified=when(row.verified_at,'verified_at');
 if(verified>now.getTime()+120000||
    now.getTime()-verified>maxAgeDays*24*3600000)
    throw Error('recipient_verification_stale');
 if(row.expires_at&&when(row.expires_at,'expires_at')<=now.getTime())
    throw Error('recipient_mapping_expired');
 // A fresh source-bound, uniquely scoped mapping. Not permission to send.
 return {subject_ref:subject,mailbox:recipient,verified:true,evidence_ref:source};
}
export function createPrivateEmailRecipientResolver({recipientDirectoryFile='',now=new Date()}={}){
 return async ({subject_ref,division_id})=>resolvePrivateEmailRecipient({
  recipientDirectoryFile,subjectRef:subject_ref,divisionId:division_id,now
 });
}
