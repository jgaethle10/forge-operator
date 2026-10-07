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
