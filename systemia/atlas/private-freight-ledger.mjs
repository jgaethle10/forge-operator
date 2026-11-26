// Systemia Atlas: private, locally durable freight intake prototype.
// This is NOT a public API, a carrier vetting service, or authority to dispatch.
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {EvercraftPassport} from '../passport/passport.mjs';
import {EvercraftIdentity} from '../identity/identity.mjs';
import {verifyEvercraftSession} from '../evercraft-home/identity.mjs';

export const ATLAS_PRIVATE_SCHEMA='evercraft.atlas.private-freight-ledger.v1';
export const ATLAS_RECEIPT_SCHEMA='evercraft.atlas.freight-event-receipt.v1';
const HASH_ZERO='sha256:'+'0'.repeat(64);
const ALLOWED=new Set(['shipper.created','carrier.registered','load.opened','load.quoted','exception.opened','exception.resolved']);
const waitBuffer=new Int32Array(new SharedArrayBuffer(4));

function sha(value){return 'sha256:'+createHash('sha256').update(value).digest('hex')}
function stable(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
}
function str(value,field,max=120){
 if(typeof value!=='string'||value.trim().length<1||value.trim().length>max||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw new Error(field+'_invalid');
 return value.trim();
}
function tenantId(raw){
 const id=str(raw,'tenant_id',64);
 if(!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(id))throw new Error('tenant_id_invalid');
 return id;
}
function reqId(raw,field='record_id'){
 const id=str(raw,field,80);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(id))throw new Error(field+'_invalid');
 return id;
}
function cents(raw,name){
 if(!Number.isSafeInteger(raw)||raw<1||raw>100_000_000)throw new Error(name+'_cents_invalid');
 return raw;
}
function privateDir(dir){
 if(fs.existsSync(dir)){
  const stat=fs.lstatSync(dir);
  if(!stat.isDirectory()||(stat.mode&0o077)!==0)throw new Error('atlas_private_directory_required');
  return;
 }
 fs.mkdirSync(dir,{mode:0o700});
}
function privateFile(file){
 if(!fs.existsSync(file))return;
 const st=fs.lstatSync(file);
 if(!st.isFile()||(st.mode&0o077)!==0)throw new Error('atlas_private_file_required');
 if(st.size>10_000_000)throw new Error('atlas_ledger_size_limit');
}
function empty(tenant){
 return {schema:ATLAS_PRIVATE_SCHEMA,tenant_id:tenant,revision:0,
  shippers:[],carriers:[],loads:[],exceptions:[],events:[],
  last_hash:HASH_ZERO,source_state:'operator_entered_unverified',
  dispatch_authorized:false,customer_service_enabled:false};
}
function apply(snapshot,event){
 const p=event.payload;
 switch(event.type){
  case 'shipper.created':
   if(snapshot.shippers.some(x=>x.id===p.id))throw new Error('atlas_duplicate_shipper');
   snapshot.shippers.push({...p});break;
  case 'carrier.registered':
   if(snapshot.carriers.some(x=>x.id===p.id))throw new Error('atlas_duplicate_carrier');
   snapshot.carriers.push({...p});break;
  case 'load.opened':
   if(snapshot.loads.some(x=>x.id===p.id))throw new Error('atlas_duplicate_load');
   if(!snapshot.shippers.some(x=>x.id===p.shipper_id))throw new Error('atlas_shipper_missing');
   if(p.carrier_id&&!snapshot.carriers.some(x=>x.id===p.carrier_id))throw new Error('atlas_carrier_missing');
   snapshot.loads.push({...p});break;
  case 'load.quoted':{
   const l=snapshot.loads.find(x=>x.id===p.load_id);
   if(!l||l.state!=='intake')throw new Error('atlas_load_not_quotable');
   l.state='quoted_proposal';l.quote={...p};break;
  }
  case 'exception.opened':
   if(!snapshot.loads.some(x=>x.id===p.load_id))throw new Error('atlas_load_missing');
   if(snapshot.exceptions.some(x=>x.id===p.id))throw new Error('atlas_duplicate_exception');
   snapshot.exceptions.push({...p,open:true});break;
  case 'exception.resolved':{
   const issue=snapshot.exceptions.find(x=>x.id===p.exception_id);
   if(!issue||!issue.open)throw new Error('atlas_exception_not_open');
   issue.open=false;issue.resolved_at=event.created_at;issue.resolution=p.resolution;break;
  }
  default:throw new Error('atlas_event_type_denied');
 }
 snapshot.revision=event.revision;snapshot.last_hash=event.hash;
 snapshot.events.push({event_id:event.event_id,revision:event.revision,type:event.type,
   created_at:event.created_at,actor_ref:event.actor_ref,hash:event.hash,previous_hash:event.previous_hash});
}
function readLedger(file,tenant){
 privateFile(file);
 const s=empty(tenant);
 if(!fs.existsSync(file))return {snapshot:s,raw:[]};
 const lines=fs.readFileSync(file,'utf8').split('\n');
 if(lines.at(-1)!=='')throw new Error('atlas_truncated_event_log');
 lines.pop();
 const raw=[];
 for(const line of lines){
  if(!line)throw new Error('atlas_empty_event');
  let event;try{event=JSON.parse(line)}catch{throw new Error('atlas_event_json_invalid')}
  if(event.schema!==ATLAS_RECEIPT_SCHEMA||event.tenant_id!==tenant||
    !ALLOWED.has(event.type)||event.revision!==s.revision+1||
    event.previous_hash!==s.last_hash||typeof event.hash!=='string')throw new Error('atlas_chain_invalid');
  const {hash,...unsigned}=event;
  if(hash!==sha(stable(unsigned)))throw new Error('atlas_hash_mismatch');
  apply(s,event);raw.push(event);
 }
 return {snapshot:s,raw};
}
function normalize(type,request,snapshot){
 if(!request||typeof request!=='object'||Array.isArray(request))throw new Error('atlas_payload_invalid');
 if(type==='shipper.created')return {id:'shipper:'+randomUUID(),name:str(request.name,'shipper_name'),
   region:request.region?str(request.region,'shipper_region'):null,verification_state:'unverified'};
 if(type==='carrier.registered')return {id:'carrier:'+randomUUID(),name:str(request.name,'carrier_name'),
   authority_state:'not_checked',insurance_state:'not_checked',source:'operator_entered'};
 if(type==='load.opened'){
  const shipperId=reqId(request.shipper_id,'shipper_id');
  if(!snapshot.shippers.some(s=>s.id===shipperId))throw new Error('atlas_shipper_missing');
  const carrierId=request.carrier_id?reqId(request.carrier_id,'carrier_id'):null;
  if(carrierId&&!snapshot.carriers.some(c=>c.id===carrierId))throw new Error('atlas_carrier_missing');
  const origin=str(request.origin,'origin'),destination=str(request.destination,'destination');
  if(origin.toLowerCase()===destination.toLowerCase())throw new Error('atlas_same_origin_destination');
  return {id:'load:'+randomUUID(),shipper_id:shipperId,carrier_id:carrierId,
   origin,destination,equipment:str(request.equipment,'equipment',60),
   state:'intake',route_verified:false,carrier_verified:false,dispatch_authorized:false,
   quote:null};
 }
 if(type==='load.quoted'){
  const loadId=reqId(request.load_id,'load_id');
  const customerRateCents=cents(request.customer_rate_cents,'customer_rate');
  const carrierCostCents=cents(request.carrier_cost_cents,'carrier_cost');
  if(!snapshot.loads.some(l=>l.id===loadId&&l.state==='intake'))throw new Error('atlas_load_not_quotable');
  return {load_id:loadId,customer_rate_cents:customerRateCents,
   carrier_cost_cents:carrierCostCents,currency:'USD',status:'draft_not_sent',
   accounting_verified:false,external_quote_sent:false};
 }
 if(type==='exception.opened'){
  const loadId=reqId(request.load_id,'load_id');
  if(!snapshot.loads.some(l=>l.id===loadId))throw new Error('atlas_load_missing');
  return {id:'exception:'+randomUUID(),load_id:loadId,reason:str(request.reason,'exception_reason',240),
    source_state:'operator_entered_unverified'};
 }
 if(type==='exception.resolved'){
  const exceptionId=reqId(request.exception_id,'exception_id');
  if(!snapshot.exceptions.some(e=>e.id===exceptionId&&e.open))throw new Error('atlas_exception_not_open');
  return {exception_id:exceptionId,resolution:str(request.resolution,'resolution',240)};
 }
 throw new Error('atlas_event_type_denied');
}

export class AtlasPrivateFreightLedger {
 constructor({stateDir,identityStateDir,passportStateDir,sessionKeyring}={}){
  if(!stateDir||!identityStateDir||!passportStateDir)throw new Error('atlas_private_state_directories_required');
  if(!sessionKeyring||typeof sessionKeyring!=='object'||Array.isArray(sessionKeyring))
   throw new Error('atlas_session_keyring_required');
  this.stateDir=path.resolve(stateDir);
  this.identity=new EvercraftIdentity({stateDir:identityStateDir});
  this.passport=new EvercraftPassport({stateDir:passportStateDir});
  this.sessionKeyring=sessionKeyring;
 }
 #access(token,tenant,scope){
  const session=verifyEvercraftSession(token,this.sessionKeyring);
  this.identity.assertSessionActive(session);
  const at=new Date().toISOString(),resource='tenant:'+tenant;
  const decision=this.passport.authorize({subject_ref:session.subject_ref,
    product:'systemia-atlas',scope,resource_ref:resource,at});
  if(decision.decision!=='allow')throw new Error('atlas_access_denied');
  const grant=this.passport.getGrantState(decision.grant_id,{at});
  // Passport supports broad resource-less grants. Atlas deliberately rejects them:
  // every freight tenant requires an explicit, narrow resource grant.
  if(!grant.active||!grant.resource_refs.includes(resource))throw new Error('atlas_explicit_tenant_grant_required');
  return {actor_ref:session.subject_ref,session_id:session.session_id,
    passport_grant_id:decision.grant_id};
 }
 #file(tenant,create=false){
  const hash=createHash('sha256').update(tenant).digest('hex');
  const sub=path.join(this.stateDir,hash.slice(0,2),hash);
  if(create){
   privateDir(this.stateDir);
   privateDir(path.dirname(sub));
   privateDir(sub);
  }
  return {file:path.join(sub,'events.jsonl'),dir:sub};
 }
 #locked(dir,run){
  const lock=path.join(dir,'.lock');const deadline=Date.now()+1500;
  while(true){
   try{fs.mkdirSync(lock,{mode:0o700});break}
   catch(error){
    if(error?.code!=='EEXIST')throw error;
    if(Date.now()>=deadline)throw new Error('atlas_mutation_lock_busy');
    Atomics.wait(waitBuffer,0,0,15);
   }
  }
  try{return run()}finally{fs.rmdirSync(lock)}
 }
 read({sessionToken,tenant}={}){
  const id=tenantId(tenant);const actor=this.#access(sessionToken,id,'atlas.read');
  const {file}=this.#file(id,false);
  const {snapshot}=readLedger(file,id);
  return {...snapshot,actor_ref:actor.actor_ref,read_only:true};
 }
 // Resolve a previously acknowledged mutation after restart. Same actor,
 // exact tenant read grant and matching event hash are mandatory.
 readMutationReceipt({sessionToken,tenant,idempotencyKey,eventHash}={}){
  const id=tenantId(tenant),key=reqId(idempotencyKey,'idempotency_key');
  const actor=this.#access(sessionToken,id,'atlas.read');
  if(typeof eventHash!=='string'||!/^sha256:[a-f0-9]{64}$/.test(eventHash))
   throw Error('atlas_receipt_hash_required');
  const {file}=this.#file(id,false);
  const {raw}=readLedger(file,id);
  const event=raw.find(e=>e.idempotency_key===key);
  if(!event||event.actor_ref!==actor.actor_ref||event.hash!==eventHash)
   throw Error('atlas_receipt_unavailable');
  return {state:'recorded',revision:event.revision,event_id:event.event_id,
   event_hash:event.hash,type:event.type,record:event.payload,
   dispatch_allowed:false,external_action_performed:false};
 }
 mutate({sessionToken,tenant,type,payload,idempotencyKey,expectedRevision}={}){
  const id=tenantId(tenant),key=reqId(idempotencyKey,'idempotency_key');
  if(!ALLOWED.has(type))throw new Error('atlas_event_type_denied');
  const actor=this.#access(sessionToken,id,'atlas.write');
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('atlas_expected_revision_required');
  const {file,dir}=this.#file(id,true);
  return this.#locked(dir,()=>{
   // Re-check authority after taking the lock in case Passport access changed.
   this.#access(sessionToken,id,'atlas.write');
   const {snapshot,raw}=readLedger(file,id);
   const intentHash=sha(stable({type,payload,actor_ref:actor.actor_ref}));
   const existing=raw.find(ev=>ev.idempotency_key===key);
   if(existing){
    if(existing.intent_hash!==intentHash)throw new Error('atlas_idempotency_conflict');
    return {state:'duplicate',revision:existing.revision,event_id:existing.event_id,
      event_hash:existing.hash,dispatch_allowed:false};
   }
   if(expectedRevision!==snapshot.revision)throw new Error('atlas_revision_conflict');
   const normalized=normalize(type,payload,snapshot),issuedAt=new Date().toISOString();
   const unsigned={
    schema:ATLAS_RECEIPT_SCHEMA,tenant_id:id,revision:snapshot.revision+1,
    event_id:'evt:'+randomUUID(),idempotency_key:key,intent_hash:intentHash,type,
    payload:normalized,actor_ref:actor.actor_ref,session_id:actor.session_id,
    passport_grant_id:actor.passport_grant_id,created_at:issuedAt,previous_hash:snapshot.last_hash,
    source:'authenticated_operator_input',external_action_performed:false,
   };
   const event={...unsigned,hash:sha(stable(unsigned))};
   apply(snapshot,event); // refuse an inconsistent mutation BEFORE appending
   privateFile(file);
   const fd=fs.openSync(file,'a',0o600);
   try{
    const buf=Buffer.from(JSON.stringify(event)+'\n');
    // Sync append + fsync reduces risk of acknowledging unwritten evidence.
    let offset=0;while(offset<buf.length){const n=fs.writeSync(fd,buf,offset,buf.length-offset);if(n<=0)throw new Error('atlas_disk_write_failed');offset+=n}
    fs.fsyncSync(fd);
   }finally{fs.closeSync(fd)}
   return {state:'recorded',revision:event.revision,event_id:event.event_id,event_hash:event.hash,
     record:normalized,dispatch_allowed:false,external_action_performed:false};
  });
 }
}

export const ATLAS_PRIVATE_SCOPES=Object.freeze({
 read:'atlas.read',write:'atlas.write',resourcePrefix:'tenant:',
 authority_ceiling:'private_intake_and_draft_quote_only',
});
