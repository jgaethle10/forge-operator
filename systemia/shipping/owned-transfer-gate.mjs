// Evercraft Shipping owned transfer gateway v0.1: local-only candidate, NOT production.
// Explicit authorization, encrypted-at-rest bytes, short-lived bearer grant, revoke and receipts.
// No outbound email, payment, public exposure, or assertion of recipient identity.
import { randomBytes, createHash, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';

const MAX_BYTES=512*1024*1024, MAX_TTL=7*24*60*60*1000;
const HASH=/^[0-9a-f]{64}$/, ID=/^[0-9a-f]{32}$/;
const hex=buffer=>createHash('sha256').update(buffer).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&HASH.test(a)&&HASH.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
function requireValue(s,limit=180){return typeof s==='string'&&s.trim().length>0&&s.length<=limit&&!/[\x00-\x1f\x7f]/.test(s);}
function fail(s){throw new Error('evercraft_ship_transfer:'+s);}
function metadataSafe(m){
 return m&&ID.test(m.id||'')&&HASH.test(m.original_sha256||'')&&
 Number.isSafeInteger(m.original_size)&&m.original_size>0&&m.original_size<=MAX_BYTES &&
 requireValue(m.recipient_ref)&&requireValue(m.authorization_ref);
}
async function writeAtomic(file,obj) {
 const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
 try{await fs.writeFile(tmp,JSON.stringify(obj)+'\n',{mode:0o600,flag:'wx'});await fs.rename(tmp,file);}
 catch(e){await fs.rm(tmp,{force:true}).catch(()=>{});throw e;}
}
export class OwnedShipTransferGate {
 constructor({root,operatorSecret,encryptionKey,now=()=>Date.now()}={}){
  if(!requireValue(root,4096)||!requireValue(operatorSecret,4096)||!Buffer.isBuffer(encryptionKey)||encryptionKey.length!==32)fail('configuration_required');
  this.root=path.resolve(root);this.secretHash=hex(operatorSecret);this.key=Buffer.from(encryptionKey);
  this.now=now;this.busy=new Set();
 }
 async init(){
  await fs.mkdir(this.root,{recursive:true,mode:0o700});
  const st=await fs.lstat(this.root);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)fail('unsafe_vault_directory');
  return this;
 }
 requireOperator(value){if(!equal(hex(String(value||'')),this.secretHash))fail('operator_not_authorized');}
 metaPath(id){if(!ID.test(id||''))fail('invalid_transfer_id');return path.join(this.root,id+'.json');}
 bytesPath(id){if(!ID.test(id||''))fail('invalid_transfer_id');return path.join(this.root,id+'.enc');}
 async read(id) {
  let m;try{m=JSON.parse(await fs.readFile(this.metaPath(id),'utf8'));}catch{fail('unknown_transfer');}
  if(!metadataSafe(m)||m.id!==id)fail('invalid_transfer_record');
  return m;
 }
 async persist(m){await writeAtomic(this.metaPath(m.id),m);}
 async create({original_size,original_sha256,recipient_ref,authorization_ref,ttl_ms=24*60*60*1000}={}){
  if(!Number.isSafeInteger(original_size)||original_size<=0||original_size>MAX_BYTES||!HASH.test(original_sha256||'')||
   !requireValue(recipient_ref)||!requireValue(authorization_ref)||!Number.isInteger(ttl_ms)||ttl_ms<60000||ttl_ms>MAX_TTL)
   fail('invalid_transfer_request');
  const id=randomBytes(16).toString('hex');
  const m={schema:'evercraft.shipping.owned-transfer.v1',id,original_size,original_sha256,
   recipient_ref,authorization_ref,created_at_ms:this.now(),expires_at_ms:this.now()+ttl_ms,
   state:'reserved',revoked:false,grant_hash:null,iv:null,auth_tag:null,
   downloaded_responses:0,proof:{source_verified:false,provider_delivery:false,recipient_identity_verified:false}};
  await this.persist(m);return {id,state:m.state,expires_at_ms:m.expires_at_ms,recipient_ref};
 }
 async upload(id,iterable){
  if(this.busy.has(id))fail('transfer_busy');
  this.busy.add(id);
  const temp=this.bytesPath(id)+'.'+randomBytes(8).toString('hex')+'.tmp';
  let file;
  try{
   const m=await this.read(id);
   if(m.revoked||this.now()>=m.expires_at_ms||m.state!=='reserved')fail('transfer_not_eligible');
   const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);
   const hash=createHash('sha256');let total=0;
   file=await fs.open(temp,'wx',0o600);
   for await(const part of iterable){
    const b=Buffer.from(part);
    total+=b.length;
    if(total>m.original_size)fail('upload_exceeds_reserved_size');
    hash.update(b);await file.writeFile(cipher.update(b));
   }
   await file.writeFile(cipher.final());await file.sync();await file.close();file=null;
   if(total!==m.original_size||hash.digest('hex')!==m.original_sha256)fail('source_digest_mismatch');
   const auth_tag=cipher.getAuthTag().toString('hex');
   await fs.rename(temp,this.bytesPath(id));
   m.iv=iv.toString('hex');m.auth_tag=auth_tag;m.state='source_verified';m.proof.source_verified=true;
   await this.persist(m);
   return {id,state:m.state,original_size:total,original_sha256:m.original_sha256,
    encrypted_storage:true,recipient_identity_verified:false,provider_delivery:false};
  }catch(e){if(file)await file.close().catch(()=>{});await fs.rm(temp,{force:true}).catch(()=>{});throw e;}
  finally{this.busy.delete(id);}
 }
 async issue(id,authorization_ref){
  const m=await this.read(id);
  if(m.revoked||this.now()>=m.expires_at_ms||m.state!=='source_verified'||m.authorization_ref!==authorization_ref)
   fail('grant_not_authorized');
  const token=randomBytes(32).toString('hex');
  m.grant_hash=hex(token);m.state='grant_issued';await this.persist(m);
  return {id,recipient_ref:m.recipient_ref,expires_at_ms:m.expires_at_ms,
   access_token:token,token_type:'bearer',delivery_state:'not_sent',identity_verified:false};
 }
 async revoke(id,authorization_ref){
  const m=await this.read(id);if(m.authorization_ref!==authorization_ref)fail('revoke_not_authorized');
  m.revoked=true;m.grant_hash=null;m.state='revoked';await this.persist(m);
  return {id,state:'revoked',future_access_blocked:true,in_flight_downloads_not_recalled:true};
 }
 async authorize(id,token){
  const m=await this.read(id);
  if(m.revoked||m.state!=='grant_issued'||this.now()>=m.expires_at_ms||
   !equal(hex(String(token||'')),m.grant_hash))fail('recipient_access_denied');
  if(!/^[0-9a-f]{24}$/.test(m.iv||'')||!/^[0-9a-f]{32}$/.test(m.auth_tag||''))fail('missing_encryption_metadata');
  return m;
 }
 async decryptVerify(m,consume){
  const dec=createDecipheriv('aes-256-gcm',this.key,Buffer.from(m.iv,'hex'));
  dec.setAuthTag(Buffer.from(m.auth_tag,'hex'));
  const hash=createHash('sha256');let size=0;
  const stream=createReadStream(this.bytesPath(m.id),{highWaterMark:1024*1024});
  for await(const ciphertext of stream){
   const plain=dec.update(ciphertext);size+=plain.length;
   if(size>m.original_size)fail('ciphertext_overflow');hash.update(plain);
   if(consume && plain.length)await consume(plain);
  }
  const tail=dec.final();size+=tail.length;hash.update(tail);
  if(consume && tail.length)await consume(tail);
  if(size!==m.original_size||hash.digest('hex')!==m.original_sha256)fail('stored_byte_integrity_failure');
 }
 async download(id,token,{write,finish}={}){
  if(typeof write!=='function'||typeof finish!=='function')fail('stream_callbacks_required');
  const m=await this.authorize(id,token);
  // First pass authenticates encrypted bytes BEFORE any plaintext is exposed.
  await this.decryptVerify(m);
  // An active transfer may finish after revocation; future transfers are denied.
  await this.decryptVerify(m,write);
  await finish();
  // The receipt means server response completed, not that a person opened the file.
  const latest=await this.read(id);
  if(!latest.revoked){latest.downloaded_responses+=1;latest.last_response_completed_ms=this.now();await this.persist(latest);}
  return {id,download_response_completed:true,recipient_identity_verified:false,
   sender_delivery_proven:false,source_sha256:m.original_sha256};
 }
 async status(id){
  const m=await this.read(id);
  return {id,state:m.state,recipient_ref:m.recipient_ref,expires_at_ms:m.expires_at_ms,
   source_verified:m.proof.source_verified,grant_issued:!!m.grant_hash,
   revoked:m.revoked,download_responses_completed:m.downloaded_responses,
   recipient_identity_verified:false,provider_delivery_verified:false};
 }
}
