#!/usr/bin/env node
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {EvercraftPassport} from '../passport/passport.mjs';

const SUBJECT_REF='system:space-dudz-clip-publisher';
const PRODUCT='evercraft-home';
const SCOPE='home.clip.publish';
const RESOURCE_REF='brand:space-dudz';
const clean=value=>String(value??'').trim();

export function validateSpaceDudzClipAuthorityReceipt(input){
  const receipt=structuredClone(input||{});
  if(receipt.schema!=='evercraft.clip.operator-authority.v1') throw new Error('space_dudz_authority_schema_invalid');
  if(receipt.authorized!==true||clean(receipt.authority_state)!=='manual_authorized') throw new Error('space_dudz_authority_not_authorized');
  if(clean(receipt.subject_ref)!==SUBJECT_REF||clean(receipt.product)!==PRODUCT) throw new Error('space_dudz_authority_identity_invalid');
  if(JSON.stringify(receipt.scopes)!==JSON.stringify([SCOPE])) throw new Error('space_dudz_authority_scope_invalid');
  if(JSON.stringify(receipt.resource_refs)!==JSON.stringify([RESOURCE_REF])) throw new Error('space_dudz_authority_resource_invalid');
  const excluded=(receipt.excluded_brand_keys||[]).map(x=>clean(x).toLowerCase());
  if(!excluded.includes('rnb-chicken-and-soul')) throw new Error('space_dudz_authority_rnb_exclusion_required');
  const starts=new Date(receipt.starts_at),ends=new Date(receipt.ends_at);
  if(!Number.isFinite(starts.getTime())||!Number.isFinite(ends.getTime())||starts>=ends) throw new Error('space_dudz_authority_window_invalid');
  if(!clean(receipt.authority_receipt_ref)) throw new Error('space_dudz_authority_receipt_ref_required');
  return {...receipt,starts_at:starts.toISOString(),ends_at:ends.toISOString(),excluded_brand_keys:[...new Set(excluded)].sort()};
}

export function authorizeSpaceDudzResidentFromReceipt({passport,receipt}={}){
  const verified=validateSpaceDudzClipAuthorityReceipt(receipt);
  const result=passport.issueGrant({
    grant_id:'grant_system_space_dudz_clip_publisher',
    idempotency_key:'grant:system:space-dudz-clip-publisher:v1',
    authority_state:'manual_authorized',
    authority_receipt_ref:verified.authority_receipt_ref,
    subject_ref:SUBJECT_REF,
    issuer_ref:clean(verified.issuer_ref)||'authority:evercraft-operator',
    product:PRODUCT,
    scopes:[SCOPE],
    resource_refs:[RESOURCE_REF],
    starts_at:verified.starts_at,
    ends_at:verified.ends_at,
    max_delegation_depth:0,
    purpose:'Autonomously publish only Space Dudz campaign candidates through Evercraft Clip.',
  });
  return {
    schema:'evercraft.clip.space-dudz-publish-authorization-receipt.v1',
    state:result.state,
    grant_id:result.grant.grant_id,
    subject_ref:result.grant.subject_ref,
    scopes:result.grant.scopes,
    resource_refs:result.grant.resource_refs,
    starts_at:result.grant.starts_at,
    ends_at:result.grant.ends_at,
    authority_receipt_ref:result.grant.authority_receipt_ref,
    grant_receipt_hash:result.grant.receipt_hash,
    secret_material_returned:false,
  };
}
