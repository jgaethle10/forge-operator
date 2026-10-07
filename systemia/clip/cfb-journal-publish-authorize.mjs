#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EvercraftPassport } from '../passport/passport.mjs';

const SUBJECT_REF='system:cfb-clip-publisher';
const PRODUCT='evercraft-home';
const SCOPE='home.clip.publish';
const RESOURCE_REF='journal-series:cfb-power-rankings';

function clean(value){ return String(value??'').trim(); }
function arg(name,fallback=''){
  const index=process.argv.indexOf(name);
  return index>=0?clean(process.argv[index+1]):fallback;
}

export const CFB_CLIP_AUTHORITY_RECEIPT_SCHEMA='evercraft.clip.operator-authority.v1';

export function validateCfbClipAuthorityReceipt(input){
  const receipt=structuredClone(input||{});
  if(receipt.schema!==CFB_CLIP_AUTHORITY_RECEIPT_SCHEMA) throw new Error('cfb_clip_authority_receipt_schema_invalid');
  if(receipt.authorized!==true) throw new Error('cfb_clip_authority_receipt_not_authorized');
  if(clean(receipt.authority_state)!=='manual_authorized') throw new Error('cfb_clip_authority_state_invalid');
  if(clean(receipt.subject_ref)!==SUBJECT_REF) throw new Error('cfb_clip_authority_subject_invalid');
  if(clean(receipt.product)!==PRODUCT) throw new Error('cfb_clip_authority_product_invalid');

  const scopes=Array.isArray(receipt.scopes)?receipt.scopes.map(clean).filter(Boolean):[];
  if(scopes.length!==1||scopes[0]!==SCOPE) throw new Error('cfb_clip_authority_scope_invalid');

  const resources=Array.isArray(receipt.resource_refs)?receipt.resource_refs.map(clean).filter(Boolean):[];
  if(resources.length!==1||resources[0]!==RESOURCE_REF) throw new Error('cfb_clip_authority_resource_invalid');

  const excluded=(receipt.excluded_brand_keys||[]).map(value=>clean(value).toLowerCase()).filter(Boolean);
  if(!excluded.includes('rnb-chicken-and-soul')) throw new Error('cfb_clip_authority_rnb_exclusion_required');

  const startsAt=new Date(receipt.starts_at);
  const endsAt=new Date(receipt.ends_at);
  if(!Number.isFinite(startsAt.getTime())||!Number.isFinite(endsAt.getTime())||startsAt>=endsAt){
    throw new Error('cfb_clip_authority_window_invalid');
  }

  const authorityReceiptRef=clean(receipt.authority_receipt_ref);
  if(!authorityReceiptRef) throw new Error('cfb_clip_authority_receipt_ref_required');

  return {
    ...receipt,
    authority_receipt_ref:authorityReceiptRef,
    issuer_ref:clean(receipt.issuer_ref)||'authority:evercraft-operator',
    subject_ref:SUBJECT_REF,
    product:PRODUCT,
    scopes:[SCOPE],
    resource_refs:[RESOURCE_REF],
    excluded_brand_keys:[...new Set(excluded)].sort(),
    starts_at:startsAt.toISOString(),
    ends_at:endsAt.toISOString(),
  };
}

export function authorizeCfbJournalResidentFromReceipt({passport,receipt}={}){
  const verified=validateCfbClipAuthorityReceipt(receipt);
  return authorizeCfbJournalResident({
    passport,
    authorityReceiptRef:verified.authority_receipt_ref,
    startsAt:verified.starts_at,
    endsAt:verified.ends_at,
    issuerRef:verified.issuer_ref,
    subjectRef:verified.subject_ref,
  });
}

export function authorizeCfbJournalResident({
  passport,
  authorityReceiptRef,
  endsAt,
  startsAt=new Date().toISOString(),
  issuerRef='authority:evercraft-operator',
  subjectRef=SUBJECT_REF,
  grantId='grant_system_cfb_clip_publisher',
  idempotencyKey='grant:system:cfb-clip-publisher:v1',
}={}){
  if(!passport||typeof passport.issueGrant!=='function') throw new Error('cfb_clip_passport_required');
  if(!clean(authorityReceiptRef)) throw new Error('cfb_clip_authority_receipt_ref_required');
  if(!clean(endsAt)) throw new Error('cfb_clip_grant_end_required');

  const result=passport.issueGrant({
    grant_id:grantId,
    idempotency_key:idempotencyKey,
    authority_state:'manual_authorized',
    authority_receipt_ref:clean(authorityReceiptRef),
    subject_ref:clean(subjectRef)||SUBJECT_REF,
    issuer_ref:clean(issuerRef)||'authority:evercraft-operator',
    product:PRODUCT,
    scopes:[SCOPE],
    resource_refs:[RESOURCE_REF],
    starts_at:new Date(startsAt).toISOString(),
    ends_at:new Date(endsAt).toISOString(),
    max_delegation_depth:0,
    purpose:'Autonomously publish only the Evercraft College Football Power Rankings Journal series through Evercraft Clip.',
  });

  return {
    schema:'evercraft.clip.cfb-publish-authorization-receipt.v1',
    state:result.state,
    grant_id:result.grant.grant_id,
    subject_ref:result.grant.subject_ref,
    product:result.grant.product,
    scopes:result.grant.scopes,
    resource_refs:result.grant.resource_refs,
    starts_at:result.grant.starts_at,
    ends_at:result.grant.ends_at,
    authority_receipt_ref:result.grant.authority_receipt_ref,
    grant_receipt_hash:result.grant.receipt_hash,
    secret_material_returned:false,
  };
}

async function main(){
  const stateDir=arg('--passport-state-dir',process.env.EVERCRAFT_PASSPORT_STATE_DIR||'');
  const authorityReceiptRef=arg('--authority-receipt-ref');
  const endsAt=arg('--ends-at');
  const startsAt=arg('--starts-at',new Date().toISOString());
  const subjectRef=arg('--subject-ref',SUBJECT_REF);
  if(!stateDir) throw new Error('Usage requires --passport-state-dir or EVERCRAFT_PASSPORT_STATE_DIR');
  const passport=new EvercraftPassport({stateDir:path.resolve(stateDir)});
  const receipt=authorizeCfbJournalResident({
    passport,authorityReceiptRef,endsAt,startsAt,subjectRef
  });
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  await main();
}
