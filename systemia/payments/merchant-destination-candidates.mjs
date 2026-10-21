/**
 * Evercraft Payments: private merchant-supplied destination candidates.
 *
 * This is NOT live merchant enrollment, ownership proof or payment authority.
 * Intentionally holds only two operator-supplied public handles in private
 * storage. Zelle and PayPal QR artifacts are represented as "present" only;
 * no private phone, decoded QR URL or image bytes enter this registry.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const CANDIDATE_SCHEMA='evercraft.payments.private-destination-candidates.v1';
export const DEFAULT_CANDIDATE_FILE=path.join(
  os.homedir(),'.local','state','evercraft','payments','private',
  'merchant-destination-candidates.json'
);
const CASHAPP=/^https:\/\/cash\.app\/\$[A-Za-z0-9]{3,28}$/;
const VENMO=/^@[A-Za-z0-9][A-Za-z0-9-]{1,39}$/;
const METHODS=['cash_app_business','venmo_business','zelle_business','paypal_business'];
const K=['schema','record_type','owner_approval','methods','all_destinations_private',
  'business_eligibility_verified','provider_identity_verified','live_invoice_routing_enabled',
  'authoritative_payment_receipt_verified','settlement_verified','version'];
const M=['rail','source','source_detail','value','business_use_eligible',
  'destination_verified','customer_visible','settlement_verified','state'];

function plainObject(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)}
function sameKeys(x,keys){
  return plainObject(x)&&Object.keys(x).sort().join('|')===keys.slice().sort().join('|');
}
export function buildMerchantDestinationCandidates({
  cashAppUrl,venmoHandle,zelleQrSubmitted=false,paypalQrSubmitted=false,
  ownerApproved=false
}={}){
  if(ownerApproved!==true)throw Error('operator_approval_required');
  if(typeof cashAppUrl!=='string'||!CASHAPP.test(cashAppUrl)||
     typeof venmoHandle!=='string'||!VENMO.test(venmoHandle)||
     zelleQrSubmitted!==true||paypalQrSubmitted!==true){
    throw Error('merchant_destination_input_incomplete_or_invalid');
  }
  const values={
    cash_app_business:{source:'user_supplied_link',source_detail:'cash_app_url',
      value:cashAppUrl},
    venmo_business:{source:'user_supplied_handle',source_detail:'venmo_handle',
      value:venmoHandle},
    zelle_business:{source:'user_supplied_qr',source_detail:'qr_present_not_stored',
      value:null},
    paypal_business:{source:'user_supplied_qr',source_detail:'qr_present_not_stored',
      value:null},
  };
  const methods={};
  for(const rail of METHODS){
    methods[rail]={
      rail,...values[rail],business_use_eligible:false,
      destination_verified:false,customer_visible:false,
      settlement_verified:false,state:'candidate_requires_business_and_identity_verification'
    };
  }
  const result={
    schema:CANDIDATE_SCHEMA,
    record_type:'operator_submitted_candidate_only',
    owner_approval:'explicit_private_intake',
    methods,
    all_destinations_private:true,
    business_eligibility_verified:false,
    provider_identity_verified:false,
    live_invoice_routing_enabled:false,
    authoritative_payment_receipt_verified:false,
    settlement_verified:false,
    version:1,
  };
  assertMerchantDestinationCandidates(result);
  return result;
}
export function assertMerchantDestinationCandidates(data){
  if(!sameKeys(data,K)||data.schema!==CANDIDATE_SCHEMA||
     data.record_type!=='operator_submitted_candidate_only'||
     data.owner_approval!=='explicit_private_intake'||
     !sameKeys(data.methods,METHODS)||
     data.all_destinations_private!==true||
     data.business_eligibility_verified!==false||
     data.provider_identity_verified!==false||
     data.live_invoice_routing_enabled!==false||
     data.authoritative_payment_receipt_verified!==false||
     data.settlement_verified!==false||data.version!==1){
    throw Error('merchant_destinations_not_verified_or_schema_invalid');
  }
  for(const rail of METHODS){
    const m=data.methods[rail];
    if(!sameKeys(m,M)||m.rail!==rail||m.business_use_eligible!==false||
       m.destination_verified!==false||m.customer_visible!==false||
       m.settlement_verified!==false||
       m.state!=='candidate_requires_business_and_identity_verification'){
      throw Error('unverified_destination_cannot_be_public_or_authorized');
    }
    if(rail==='cash_app_business'){
      if(m.source!=='user_supplied_link'||m.source_detail!=='cash_app_url'||
         typeof m.value!=='string'||!CASHAPP.test(m.value)){
        throw Error('cash_app_candidate_bad_format');
      }
    }else if(rail==='venmo_business'){
      if(m.source!=='user_supplied_handle'||m.source_detail!=='venmo_handle'||
         typeof m.value!=='string'||!VENMO.test(m.value)){
        throw Error('venmo_candidate_bad_format');
      }
    }else if(m.source!=='user_supplied_qr'||
             m.source_detail!=='qr_present_not_stored'||m.value!==null){
      throw Error('qr_candidate_must_not_store_private_data');
    }
  }
  return true;
}
function privateDirectory(dir){
  if(!path.isAbsolute(dir))throw Error('candidate_directory_absolute_required');
  let cursor=path.resolve(dir);
  while(cursor!==path.dirname(cursor)){
    if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink()){
      throw Error('candidate_symlink_ancestor_forbidden');
    }
    cursor=path.dirname(cursor);
  }
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const st=fs.lstatSync(dir);
  const uid=typeof process.getuid==='function'?process.getuid():null;
  if(st.isSymbolicLink()||!st.isDirectory()||(st.mode&0o077)!==0||
     (uid!==null&&st.uid!==uid)){
    throw Error('candidate_directory_not_private');
  }
}
export function writeMerchantDestinationCandidates(data,{file=DEFAULT_CANDIDATE_FILE}={}){
  assertMerchantDestinationCandidates(data);
  if(!path.isAbsolute(file))throw Error('candidate_file_absolute_required');
  privateDirectory(path.dirname(file));
  const flags=fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|
    (fs.constants.O_NOFOLLOW||0);
  // First intake only. Never overwrite an existing candidate vault or take
  // ownership of a separate merchant's already configured credentials.
  const temp=file+'.pending-'+randomUUID();
  let fd,committed=false;
  try{
    if(fs.existsSync(file))throw Error('merchant_candidates_already_exist_no_overwrite');
    fd=fs.openSync(temp,flags,0o600);
    fs.writeFileSync(fd,JSON.stringify(data,null,2)+'\n','utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);fd=undefined;
    // Serialize two simultaneous first-intake attempts via a private O_EXCL
    // publication lock. Leave any unexpected lock held for human review.
    const lock=file+'.lock';
    let lockFd;
    try{
      lockFd=fs.openSync(lock,flags,0o600);
      if(fs.existsSync(file))throw Error('merchant_candidates_already_exist_no_overwrite');
      fs.renameSync(temp,file);
      committed=true;
      const dfd=fs.openSync(path.dirname(file),fs.constants.O_RDONLY);
      try{fs.fsyncSync(dfd)}finally{fs.closeSync(dfd)}
    }finally{
      if(lockFd!==undefined){fs.closeSync(lockFd);fs.unlinkSync(lock)}
    }
  }finally{
    if(fd!==undefined)fs.closeSync(fd);
    if(!committed&&fs.existsSync(temp))fs.unlinkSync(temp);
  }
  return merchantCandidateStatus(data);
}
export function readMerchantDestinationCandidates({file=DEFAULT_CANDIDATE_FILE}={}){
  if(!path.isAbsolute(file))throw Error('candidate_file_absolute_required');
  if(!fs.existsSync(file))return null;
  const st=fs.lstatSync(file);
  const uid=typeof process.getuid==='function'?process.getuid():null;
  if(st.isSymbolicLink()||!st.isFile()||(st.mode&0o077)!==0||
    st.size>8192||(uid!==null&&st.uid!==uid)){
    throw Error('candidate_file_not_owner_private');
  }
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  assertMerchantDestinationCandidates(data);
  return data;
}
export function merchantCandidateStatus(data){
  if(data!==null)assertMerchantDestinationCandidates(data);
  return {
    schema:'evercraft.payments.merchant-candidate-status.v1',
    candidate_record_stored:data!==null,
    candidate_methods:data?METHODS:[],
    qr_images_or_raw_zelle_phone_stored:false,
    cash_app_value_exposed:false,venmo_value_exposed:false,
    merchant_business_eligibility_verified:false,
    live_checkout_enabled:false,
    public_payment_instructions_enabled:false,
    paid_receipt_verified:false,
    next_gate:'verify_merchant_account_business_eligibility_and_destination_ownership'
  };
}
