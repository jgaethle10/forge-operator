import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildFindMyPartIntake } from '../mcp/findmypart-intake.mjs';

// Owned payment-adapter component. This is not itself a payment provider or an HTTP route.
// It never starts checkout, authorizes a charge, declares settlement, or releases work.
const PRICES=Object.freeze({
  'findmypart':['findmypart.quick_hunt_19.v1',1900],
  'part-quick':['findmypart.quick_hunt_19.v1',1900],
  'part-deep':['findmypart.deep_hunt_49.v1',4900],
  'part-rescue':['findmypart.rescue_hunt_99.v1',9900],
});
const fail=(code)=>Object.assign(new Error(code),{code});
const equal=(a,b)=>{
  const left=Buffer.from(String(a??''));const right=Buffer.from(String(b??''));
  return left.length===right.length&&timingSafeEqual(left,right);
};
const keyOf=(value)=>createHash('sha256').update(value).digest('hex');
const protectedRecord=(record,key)=>{
  const nonce=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,nonce);
  const body=Buffer.concat([cipher.update(JSON.stringify(record),'utf8'),cipher.final()]);
  return JSON.stringify({v:1,n:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),body:body.toString('base64')});
};
const unprotect=(payload,key)=>{
  try{
    const data=JSON.parse(payload);
    if(data.v!==1)throw Error('version');
    const nonce=Buffer.from(data.n,'base64'),tag=Buffer.from(data.tag,'base64');
    if(nonce.length!==12||tag.length!==16)throw Error('auth');
    const decipher=createDecipheriv('aes-256-gcm',key,nonce);
    decipher.setAuthTag(tag);
    const plaintext=Buffer.concat([decipher.update(Buffer.from(data.body,'base64')),decipher.final()]).toString('utf8');
    return JSON.parse(plaintext);
  }catch{throw fail('intake_record_integrity_failed')}
};

export async function createFindMyPartPrivateIntakeLedger({
  stateDir,
  key,
  now=()=>Date.now(),
  ttlMs=72*60*60*1000,
}={}){
  if(!path.isAbsolute(String(stateDir||'')))throw fail('private_storage_absolute_directory_required');
  const secret=Buffer.isBuffer(key)?Buffer.from(key):Buffer.from(String(key||''),'base64');
  if(secret.length!==32)throw fail('private_storage_32_byte_encryption_key_required');
  if(!Number.isSafeInteger(ttlMs)||ttlMs<60_000||ttlMs>30*86400_000)throw fail('private_storage_ttl_out_of_range');
  await fs.mkdir(stateDir,{recursive:true,mode:0o700});
  const root=await fs.realpath(stateDir);
  const target=(orderKey)=>path.join(root,keyOf(orderKey));
  async function read(orderKey){
    const folder=target(orderKey);
    try{
      // A completed ready marker is required; partial/crashed files are never purchase authority.
      await fs.access(path.join(folder,'ready'));
      const text=await fs.readFile(path.join(folder,'intake.enc'),'utf8');
      const record=unprotect(text,secret);
      if(record.order_key!==orderKey)throw fail('intake_record_integrity_failed');
      return record;
    }catch(e){
      if(e?.code==='ENOENT')throw fail('intake_not_persisted');
      throw e;
    }
  }
  function offer(slug,offer_key){
    const found=PRICES[slug];
    if(!found||found[0]!==offer_key)throw fail('findmypart_offer_mismatch');
    return found;
  }
  async function preflight(payload={}){
    const order_key=String(payload.order_key||'');
    if(!/^[a-zA-Z0-9_-]{12,160}$/.test(order_key))throw fail('findmypart_order_key_invalid');
    const customer_email=String(payload.customer_email||'').trim().toLowerCase();
    if(customer_email.length>200||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email))throw fail('findmypart_customer_email_invalid');
    const raw=payload.intake||{};
    const slug=String(raw.offer_slug||'');
    const [offer_key,amount_cents]=offer(slug,String(payload.offer_key||''));
    const normalize=buildFindMyPartIntake({...raw,scope_confirmed:raw.customer_scope_confirmed===true},{slug,customerEmail:customer_email});
    if(!normalize.ok||!equal(normalize.intake_digest,payload.intake_digest)||JSON.stringify(normalize.intake)!==JSON.stringify(raw))
      throw fail('findmypart_scope_invalid_or_changed');
    const newRecord={
      schema:'evercraft.findmypart.private-admission.v1',order_key,customer_email,
      offer_slug:slug,offer_key,amount_cents,currency:'usd',
      intake_digest:normalize.intake_digest,
      intake_ref:'fmp-intake-'+randomBytes(18).toString('hex'),
      intake:normalize.intake,
      created_at:Number(now()),expires_at:Number(now())+ttlMs,
      payment_state:'not_created',fulfillment_release:false,
    };
    const folder=target(order_key);
    try{
      await fs.mkdir(folder,{mode:0o700});
    }catch(e){
      if(e?.code!=='EEXIST')throw e;
      const old=await read(order_key);
      if(!equal(old.customer_email,customer_email)||old.offer_key!==offer_key||
         old.offer_slug!==slug||!equal(old.intake_digest,normalize.intake_digest)||old.expires_at<=Number(now()))
        throw fail('findmypart_order_scope_conflict');
      return {
        ok:true,schema:'raven.findmypart-context-preflight.v1',
        checkout_created:false,intake_persisted:true,intake_ref:old.intake_ref,intake_digest:old.intake_digest,
      };
    }
    const handle=await fs.open(path.join(folder,'intake.enc'),'wx',0o600);
    try{await handle.writeFile(protectedRecord(newRecord,secret));await handle.sync()}finally{await handle.close()}
    const ready=await fs.open(path.join(folder,'ready'),'wx',0o600);
    try{await ready.writeFile('1');await ready.sync()}finally{await ready.close()}
    return {
      ok:true,schema:'raven.findmypart-context-preflight.v1',
      checkout_created:false,intake_persisted:true,intake_ref:newRecord.intake_ref,intake_digest:newRecord.intake_digest,
    };
  }
  async function authorizeCheckout(payload={}){
    const order_key=String(payload.order_key||'');
    if(!/^[a-zA-Z0-9_-]{12,160}$/.test(order_key))throw fail('findmypart_order_key_invalid');
    const record=await read(order_key);
    const customer_email=String(payload.customer_email||'').trim().toLowerCase();
    const offer_key=String(payload.offer_key||'');
    const [expectedKey,expectedAmount]=offer(record.offer_slug,record.offer_key);
    if(record.expires_at<=Number(now()))throw fail('findmypart_intake_expired');
    if(!equal(record.customer_email,customer_email)||offer_key!==expectedKey||
       !equal(record.intake_digest,payload.intake_digest)||!equal(record.intake_ref,payload.intake_ref)||
       Number(payload.amount_cents)!==expectedAmount||String(payload.currency||'').toLowerCase()!=='usd')
      throw fail('findmypart_checkout_scope_mismatch');
    return {ok:true,context_persisted:true,intake_ref:record.intake_ref,
      intake_digest:record.intake_digest,offer_key:record.offer_key,
      amount_cents:record.amount_cents,currency:'usd',
      payment_state:'not_created',checkout_created:false,fulfillment_release:false};
  }
  return Object.freeze({preflight,authorizeCheckout});
}
