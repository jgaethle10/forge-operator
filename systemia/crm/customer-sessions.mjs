import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';

const COOKIE='__Host-evercraft_rc';
const MAX_FILE=4*1024*1024;
const sha=x=>createHash('sha256').update(x).digest('hex');
const valid=x=>typeof x==='string'&&x.trim().length>0;
const req=(v,n)=>{if(!valid(v))throw Error(n+'_required');return v.trim();};
const parseDate=(v,n)=>{const x=Date.parse(req(v,n));if(!Number.isFinite(x))throw Error(n+'_invalid');return x;};
const pattern=/^tenant:[a-z0-9][a-z0-9_-]{1,62}$/;
const roles=new Set(['owner','operator','viewer']);
const tokenFormat=/^[a-f0-9]{64}$/;
function safeDir(dir){
 const stat=fs.lstatSync(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink()||
   (process.platform!=='win32'&&(stat.mode&0o077)!==0))throw Error('session_store_dir_unsafe');
}
function sessionsFile(dir){
 if(!valid(dir))throw Error('session_store_unconfigured');
 const root=path.resolve(dir);safeDir(root);
 return path.join(root,'customer-sessions.json');
}
function readState(file){
 try{
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try{
   const st=fs.fstatSync(fd);
   if(!st.isFile()||st.size>MAX_FILE||
     (process.platform!=='win32'&&(st.mode&0o077)!==0))throw Error('session_store_file_unsafe');
   const doc=JSON.parse(fs.readFileSync(fd,'utf8'));
   if(doc?.schema!=='evercraft.crm.customer-sessions.v1'||!Array.isArray(doc.sessions)||
      doc.sessions.length>5000)throw Error('session_store_invalid');
   const ids=new Set();
   for(const row of doc.sessions){
    if(typeof row.token_hash!=='string'||!/^[a-f0-9]{64}$/.test(row.token_hash)||
       ids.has(row.token_hash))throw Error('session_store_duplicate_or_invalid');
    ids.add(row.token_hash);
   }
   return doc;
  }finally{fs.closeSync(fd);}
 }catch(e){
  if(e.code==='ENOENT')return {schema:'evercraft.crm.customer-sessions.v1',sessions:[]};
  throw e;
 }
}
function writeState(file,doc){
 const temp=file+'.'+process.pid+'.'+randomBytes(5).toString('hex')+'.tmp';
 try{
  const fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
  try{fs.writeFileSync(fd,JSON.stringify(doc)+'\n');fs.fsyncSync(fd);}
  finally{fs.closeSync(fd);}
  fs.renameSync(temp,file);
  const d=fs.openSync(path.dirname(file),fs.constants.O_RDONLY);
  try{fs.fsyncSync(d);}finally{fs.closeSync(d);}
 }finally{try{fs.unlinkSync(temp);}catch{}}
}
function mutate(dir,fn){
 const file=sessionsFile(dir),lock=path.join(path.dirname(file),'.customer-session-lock');
 fs.mkdirSync(lock,{mode:0o700});
 try{
  const state=readState(file),result=fn(state);
  if(result.write)writeState(file,state);
  return result.value;
 }finally{fs.rmdirSync(lock);}
}
function scopedIdentity(identity,now){
 if(!identity||identity.verified!==true||
    !pattern.test(identity.tenant_id||'')||
    !roles.has(identity.role)||!valid(identity.actor_ref)||
    !Array.isArray(identity.division_ids)||identity.division_ids.length===0||
    identity.division_ids.length>40||!identity.division_ids.every(x=>/^[a-z][a-z0-9_.-]{1,62}$/.test(x))||
    new Set(identity.division_ids).size!==identity.division_ids.length||
    !valid(identity.identity_evidence_ref)||
    !Number.isFinite(now.getTime()))throw Error('session_identity_not_verified');
 return identity;
}
/**
 * Only an internal trusted operator calls this after independent identity
 * proof. It does not authenticate a password, enroll a tenant, or open HTTP.
 * The raw token is returned ONCE, never persisted in the private state file.
 */
export function issuePrivateCustomerSession({
 storeDir='',identity=null,verifyEnrollment=null,now=new Date(),ttlSeconds=3600
}={}){
 const who=scopedIdentity(identity,now);
 if(!Number.isInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>12*3600)
  throw Error('session_duration_invalid');
 if(typeof verifyEnrollment!=='function')throw Error('session_enrollment_authority_required');
 const approval=verifyEnrollment({
  tenant_id:who.tenant_id,actor_ref:who.actor_ref,role:who.role,
  division_ids:[...who.division_ids],identity_evidence_ref:who.identity_evidence_ref,now
 });
 if(approval?.then||approval?.approved!==true||approval?.tenant_id!==who.tenant_id||
    approval?.actor_ref!==who.actor_ref||!valid(approval?.approval_ref)||
    !valid(approval?.expires_at)||parseDate(approval.expires_at,'approval_expires_at')<=now.getTime())
  throw Error('session_enrollment_not_approved');
 const token=randomBytes(32).toString('hex');
 const row={token_hash:sha(token),tenant_id:who.tenant_id,
  actor_ref:who.actor_ref,role:who.role,
  division_ids:[...who.division_ids],identity_evidence_ref:who.identity_evidence_ref,
  approval_ref:approval.approval_ref,issued_at:now.toISOString(),
  expires_at:new Date(Math.min(now.getTime()+ttlSeconds*1000,parseDate(approval.expires_at,'approval_expires_at'))).toISOString(),
  revoked_at:null
 };
 mutate(storeDir,doc=>{
  if(doc.sessions.length>=5000)throw Error('session_store_full');
  doc.sessions.push(row);
  return {write:true,value:true};
 });
 return {schema:'evercraft.crm.session-issue-receipt.v1',
  state:'issued',session_token:token,
  cookie:COOKIE+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict',
  expires_at:row.expires_at,tenant_id:who.tenant_id,actor_ref:who.actor_ref,
  access_from_private_registry:true};
}
function cookieToken(req){
 const header=req?.headers?.cookie;
 if(typeof header!=='string'||header.length>4096)return null;
 const matches=header.split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
 if(matches.length!==1)return null;
 const raw=matches[0].slice(COOKIE.length+1);
 return tokenFormat.test(raw)?raw:null;
}
/**
 * Private cookie validation re-reads revocations each request.
 * Never read x-tenant, x-role or user-provided request-body claims.
 */
export function createPrivateCustomerAuthenticator({storeDir='',clock=()=>new Date()}={}){
 sessionsFile(storeDir);
 if(typeof clock!=='function')throw Error('session_clock_invalid');
 return async function authenticate(req){
  const token=cookieToken(req);
  if(!token)return {verified:false};
  const now=clock();
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))return {verified:false};
  try{
   const doc=readState(sessionsFile(storeDir));
   const digest=sha(token);
   const row=doc.sessions.find(r=>r.token_hash===digest);
   if(!row||row.revoked_at||!pattern.test(row.tenant_id)||!roles.has(row.role)||
      !valid(row.actor_ref)||!Array.isArray(row.division_ids)||
      row.division_ids.length===0||new Set(row.division_ids).size!==row.division_ids.length||
      !row.division_ids.every(x=>/^[a-z][a-z0-9_.-]{1,62}$/.test(x))||
      parseDate(row.issued_at,'issued_at')>now.getTime()+120000||
      parseDate(row.expires_at,'expires_at')<=now.getTime())return {verified:false};
   return {verified:true,tenant_id:row.tenant_id,
    access:{tenant_id:row.tenant_id,actor_ref:row.actor_ref,role:row.role,
     division_ids:[...row.division_ids],active:true,expires_at:row.expires_at}};
  }catch{return {verified:false};}
 };
}
/**
 * Operator-only revocation, keyed by the digest of an issued secret.
 * Never accepts a cookie from an arbitrary public route.
 */
export function revokePrivateCustomerSession({
 storeDir='',tokenHash='',operatorApproval=null,now=new Date()
}={}){
 if(!/^[a-f0-9]{64}$/.test(tokenHash))throw Error('session_digest_invalid');
 if(operatorApproval?.approved!==true||!valid(operatorApproval.approval_ref))
  throw Error('session_revocation_approval_required');
 return mutate(storeDir,doc=>{
  const row=doc.sessions.find(x=>x.token_hash===tokenHash);
  if(!row)return {write:false,value:{state:'missing'}};
  if(row.revoked_at)return {write:false,value:{state:'already_revoked'}};
  row.revoked_at=now.toISOString();
  row.revocation_approval_ref=operatorApproval.approval_ref;
  return {write:true,value:{state:'revoked',session_hash:tokenHash}};
 });
}
