import fs from 'node:fs';
import path from 'node:path';
import {createHmac,timingSafeEqual} from 'node:crypto';

const S='evercraft.crm.private-approvals.v1';
const R='evercraft.crm.approval.v1';
const req=(v,name)=>{if(typeof v!=='string'||!v.trim())throw Error(name+'_required');return v.trim();};
const clock=(v,name)=>{const n=Date.parse(req(v,name));if(!Number.isFinite(n))throw Error(name+'_invalid');return n;};
function privateRead(filename,maxBytes) {
  const dir=path.dirname(path.resolve(req(filename,'approval_path')));
  const d=fs.lstatSync(dir);
  if(!d.isDirectory()||d.isSymbolicLink()||
     (process.platform!=='win32'&&(d.mode&0o077)!==0))throw Error('approval_directory_unsafe');
  const fd=fs.openSync(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try{
    const st=fs.fstatSync(fd);
    if(!st.isFile()||(process.platform!=='win32'&&(st.mode&0o077)!==0))
      throw Error('approval_file_unsafe');
    if(st.size>maxBytes)throw Error('approval_file_oversize');
    return fs.readFileSync(fd);
  }finally{fs.closeSync(fd);}
}
function signature(grant,key) {
 const {signature:ignored,...body}=grant;
 return 'hmac-sha256:'+createHmac('sha256',key).update(JSON.stringify(body)).digest('hex');
}
function ledgerSignature(doc,key){
 const {ledger_signature:ignored,...body}=doc;
 return 'hmac-sha256:'+createHmac('sha256',key).update(JSON.stringify(body)).digest('hex');
}
function equalSignature(actual,expected){
 if(typeof actual!=='string'||!/^hmac-sha256:[0-9a-f]{64}$/.test(actual))return false;
 const a=Buffer.from(actual.slice(12),'hex'),b=Buffer.from(expected.slice(12),'hex');
 return a.length===b.length&&timingSafeEqual(a,b);
}
function currentGrant({approvalFile,keyFile,approvalRef,now}) {
 const key=privateRead(keyFile,4096);
 if(key.length<32||key.length>256)throw Error('approval_key_invalid');
 const doc=JSON.parse(privateRead(approvalFile,2*1024*1024).toString('utf8'));
 if(doc?.schema!==S||doc?.tenant_id!=='evercraft'||
    !Array.isArray(doc.grants)||doc.grants.length>5000||
    !Array.isArray(doc.revocations)||doc.revocations.length>5000)
    throw Error('approval_ledger_invalid');
 if(!equalSignature(doc.ledger_signature,ledgerSignature(doc,key)))throw Error('approval_ledger_signature_invalid');
 const unique=new Set();
 for(const row of doc.grants){
  const ref=req(row?.approval_ref,'approval_ref');
  if(unique.has(ref))throw Error('approval_duplicate');
  unique.add(ref);
 }
 const grant=doc.grants.find(g=>g.approval_ref===approvalRef);
 if(!grant||grant.schema!==R||grant.approved!==true)return null;
 if(clock(grant.issued_at,'issued_at')>now.getTime()+120000||
    clock(grant.expires_at,'expires_at')<=now.getTime()||
    clock(grant.expires_at,'expires_at')<=clock(grant.issued_at,'issued_at'))return null;
 if(!equalSignature(grant.signature,signature(grant,key)))return null;
 if(doc.revocations.some(r=>r.approval_ref===approvalRef&&
    clock(r.revoked_at,'revoked_at')<=now.getTime()))return null;
 return grant;
}
/**
 * The operator-controlled filesystem and HMAC key are separate from agent
 * requests. Never log the key, raw approval or private relationship data.
 * Reloaded for every preflight: revocation takes effect immediately.
 */
export function createPrivateApprovalVerifiers({approvalFile='',keyFile=''}={}) {
 req(approvalFile,'approval_file');req(keyFile,'key_file');
 return {
  outreach({approval_ref,action_type,action_fingerprint,target_ref,now=new Date()}) {
   try{
    const r=currentGrant({approvalFile,keyFile,approvalRef:approval_ref,now});
    if(!r||r.kind!=='outreach'||r.action_type!==action_type||
       r.action_fingerprint!==action_fingerprint||
       r.target_ref!==target_ref)return {approved:false};
    return {approved:true,approval_ref:r.approval_ref,
      action_fingerprint:r.action_fingerprint,expires_at:r.expires_at};
   }catch{return {approved:false};}
  },
  decision({approval_ref,actor_ref,decision_fingerprint,now=new Date()}) {
   try{
    const r=currentGrant({approvalFile,keyFile,approvalRef:approval_ref,now});
    if(!r||r.kind!=='relationship_decision'||r.actor_ref!==actor_ref||
       r.decision_fingerprint!==decision_fingerprint)return {approved:false};
    return {approved:true,approval_ref:r.approval_ref,
      decision_fingerprint:r.decision_fingerprint,expires_at:r.expires_at};
   }catch{return {approved:false};}
  }
 };
}
/** Safe backend entrypoint. No caller-supplied "approved" callback accepted. */
export async function prepareContactWithPrivateAuthority({
 action,relationshipLedgerFile,interactionLedger,approvalFile,keyFile,now=new Date()
}={}) {
 const {prepareGovernedContactPermit}=await import('./outreach-gate.mjs');
 let verifier;
 try{verifier=createPrivateApprovalVerifiers({approvalFile,keyFile}).outreach;}
 catch{return {schema:'evercraft.crm.outreach-gate.v1',decision:'deny',
   reasons:['private_approval_unavailable'],send_performed:false,permit_minted:false};}
 return prepareGovernedContactPermit({
  action,relationshipLedgerFile,interactionLedger,approvalVerifier:verifier,now
 });
}
