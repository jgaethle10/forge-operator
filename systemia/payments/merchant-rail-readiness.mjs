/**
 * Evercraft Payments merchant-rail readiness boundary.
 *
 * The merchant can nominate a payment method for review WITHOUT supplying
 * bank numbers or API credentials. Nomination does not certify business
 * eligibility, transfer settlement, or a usable buyer payment destination.
 *
 * The public invoice route must NOT equate "merchant wants this rail" with
 * "merchant is allowed/configured to accept real funds".
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EVERCRAFT_PAYMENT_RAILS} from './payment-routing.mjs';

export const RAIL_REGISTRY_SCHEMA='evercraft.payments.merchant-rail-candidates.v1';
export const DEFAULT_RAIL_REGISTRY=path.join(
  os.homedir(),'.local','state','evercraft','payments','private','merchant-rail-candidates.json'
);
const VALID=new Set(Object.keys(EVERCRAFT_PAYMENT_RAILS));
const safeId=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9._:-]{2,79}$/.test(x);
const today=()=>new Date().toISOString().slice(0,10);

export function newMerchantRailCandidates({merchantKey='evercraft'}={}){
  if(!safeId(merchantKey))throw Error('merchant_key_invalid');
  return {
    schema:RAIL_REGISTRY_SCHEMA,merchant_key:merchantKey,
    records:{},version:1,
    provider_authorization_verified:false,
    business_collection_eligibility_verified:false,
    buyer_destinations_configured:false,
    external_settlement_verified:false,
    live_payment_instructions_authorized:false,
  };
}

export function nominateMerchantRail(registry,{
  rail,ownerConfirmed=false,reviewNote='',
}={}){
  assertRegistry(registry);
  if(!VALID.has(rail)||rail==='card_processor'){
    throw Error('manual_or_business_rail_not_supported');
  }
  if(ownerConfirmed!==true)throw Error('operator_approval_required');
  if(registry.records[rail])throw Error('rail_already_nominated');
  if(typeof reviewNote!=='string'||reviewNote.length>250||
     /[\r\n<>]/.test(reviewNote))throw Error('review_note_invalid');
  return {
    ...registry,version:registry.version+1,
    records:{
      ...registry.records,
      [rail]:{
        rail,status:'owner_nominated_requires_external_verification',
        owner_confirmed_date:today(),
        review_note:reviewNote,
        eligible_for_public_invoice:false,
        public_payment_destination:null,
        payment_verified:false,
      },
    },
    live_payment_instructions_authorized:false,
  };
}

export function assertRegistry(data){
  if(data?.schema!==RAIL_REGISTRY_SCHEMA||
     !safeId(data.merchant_key)||
     !Number.isSafeInteger(data.version)||data.version<1||
     !data.records||Array.isArray(data.records)||typeof data.records!=='object'||
     data.provider_authorization_verified!==false||
     data.business_collection_eligibility_verified!==false||
     data.buyer_destinations_configured!==false||
     data.external_settlement_verified!==false||
     data.live_payment_instructions_authorized!==false){
    throw Error('merchant_rail_registry_invalid_or_overauthorized');
  }
  for(const [rail,entry] of Object.entries(data.records)){
    if(!VALID.has(rail)||rail==='card_processor'||
       !entry||entry.rail!==rail||
       entry.status!=='owner_nominated_requires_external_verification'||
       entry.eligible_for_public_invoice!==false||
       entry.public_payment_destination!==null||
       entry.payment_verified!==false||
       !/^\d{4}-\d{2}-\d{2}$/.test(entry.owner_confirmed_date||'')||
       typeof entry.review_note!=='string'||entry.review_note.length>250||
       /[\r\n<>]/.test(entry.review_note)){
      throw Error('merchant_rail_registry_unverified_status_invalid');
    }
  }
  // Reject any unexpected fields so a caller cannot smuggle routing numbers,
  // payment handles, API keys, fake receipts or account identity into storage.
  const fields=['schema','merchant_key','records','version',
    'provider_authorization_verified','business_collection_eligibility_verified',
    'buyer_destinations_configured','external_settlement_verified',
    'live_payment_instructions_authorized'];
  if(Object.keys(data).sort().join('|')!==fields.sort().join('|')){
    throw Error('merchant_rail_registry_unexpected_fields');
  }
  const entryFields=['rail','status','owner_confirmed_date','review_note',
    'eligible_for_public_invoice','public_payment_destination','payment_verified'];
  for(const entry of Object.values(data.records)){
    if(Object.keys(entry).sort().join('|')!==entryFields.sort().join('|')){
      throw Error('merchant_rail_registry_credential_or_extra_fields');
    }
  }
  return true;
}

function privateParent(dir){
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const stat=fs.lstatSync(dir);
  const uid=typeof process.getuid==='function'?process.getuid():null;
  if(!stat.isDirectory()||stat.isSymbolicLink()||
     (stat.mode&0o077)!==0||
     (uid!==null&&stat.uid!==uid)){
    throw Error('merchant_rail_directory_not_private');
  }
}
export function saveMerchantRailCandidates(registry,{
  file=DEFAULT_RAIL_REGISTRY,
}={}){
  assertRegistry(registry);
  if(!path.isAbsolute(file))throw Error('merchant_rail_path_not_absolute');
  const parent=path.dirname(file);
  privateParent(parent);
  if(fs.existsSync(file)){
    const prior=readMerchantRailCandidates({file});
    if(prior.version>=registry.version)throw Error('merchant_rail_revision_or_overwrite_rejected');
    const added=Object.keys(registry.records);
    for(const [rail,entry] of Object.entries(prior.records)){
      if(JSON.stringify(registry.records[rail])!==JSON.stringify(entry)){
        throw Error('merchant_rail_existing_nomination_modified');
      }
    }
    if(added.length!==Object.keys(prior.records).length+1){
      throw Error('merchant_rail_revision_must_add_exactly_one');
    }
  }else if(registry.version!==1||Object.keys(registry.records).length!==0){
    throw Error('merchant_rail_registry_must_begin_empty');
  }
  const candidate=file+'.new-'+process.pid;
  const flags=fs.constants.O_WRONLY|fs.constants.O_EXCL|fs.constants.O_CREAT|
    (fs.constants.O_NOFOLLOW||0);
  let fd;
  try{
    fd=fs.openSync(candidate,flags,0o600);
    fs.writeFileSync(fd,JSON.stringify(registry,null,2)+'\n','utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);fd=null;
    fs.renameSync(candidate,file);
    const dfd=fs.openSync(parent,fs.constants.O_RDONLY);
    try{fs.fsyncSync(dfd)}finally{fs.closeSync(dfd)}
  }finally{
    if(fd!==null&&fd!==undefined)fs.closeSync(fd);
    if(fs.existsSync(candidate))fs.unlinkSync(candidate);
  }
  return {saved:true,version:registry.version,rails_nominated:Object.keys(registry.records).length,
    public_payment_instructions_enabled:false};
}
export function readMerchantRailCandidates({file=DEFAULT_RAIL_REGISTRY}={}){
  if(!fs.existsSync(file))return null;
  const st=fs.lstatSync(file);
  const uid=typeof process.getuid==='function'?process.getuid():null;
  if(!st.isFile()||st.isSymbolicLink()||
     (st.mode&0o077)!==0||(uid!==null&&st.uid!==uid)||
     st.size>65536)throw Error('merchant_rail_registry_not_private');
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  assertRegistry(data);
  return data;
}
export function publicMerchantRailReadiness(registry,rail){
  if(registry!==null)assertRegistry(registry);
  if(!VALID.has(rail))return {rail,available:false,reason:'unsupported_rail'};
  const nominated=registry?.records?.[rail]?.status==='owner_nominated_requires_external_verification';
  return {
    rail,available:false,
    nominated_by_operator:nominated,
    reason:nominated?'requires_authenticated_merchant_rail_verification':'merchant_rail_not_configured',
    payment_destination:null,payment_instructions:null,
    paid:false,fulfillment_authorized:false,
  };
}
