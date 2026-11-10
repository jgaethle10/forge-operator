#!/usr/bin/env node
// Offline, explicit human operator signing for an already reviewed Gravity release.
// Never generates a production authorization automatically or handles provider keys.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createAttestationPayload, signAttestation} from '../lineage/signatures.mjs';
import {buildGravityClipFallbackRequest, gravityReleaseDigest} from './journal-clip-gravity.mjs';

const clean=value=>String(value??'').trim();
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const SUBJECT_TYPE='journal-clip-gravity-release';

export function signGravityRelease({
  release,
  privateKey,
  operatorId,
  keyId,
  now=new Date(),
}={}){
  if(!privateKey) throw new Error('gravity_sign_private_key_required');
  if(!clean(operatorId)||!clean(keyId)) throw new Error('gravity_sign_operator_and_key_id_required');
  if(release?.operator_attestation) throw new Error('gravity_sign_release_already_attested');
  if(release?.schema!=='evercraft.journal.clip-gravity-release.v1'||!clean(release.story_id)){
    throw new Error('gravity_sign_release_schema_invalid');
  }
  const at=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(at.getTime())) throw new Error('gravity_sign_time_invalid');
  const payload=createAttestationPayload({
    subjectType:SUBJECT_TYPE,
    subjectId:release.story_id,
    actor:{type:'human',id:clean(operatorId)},
    keyId:clean(keyId),
    issuedAt:at.toISOString(),
    claims:{
      release_sha256:gravityReleaseDigest(release),
      destination:'facebook-page',
      copy_sha256:sha256(clean(release.approved_copy)),
      authorization_ref:clean(release.distribution_approval?.authorization_ref),
    },
  });
  const signed={...structuredClone(release),operator_attestation:signAttestation(payload,privateKey)};
  // Strong final check also verifies public-safety rules, freshness, source lineage,
  // scope, and that the signature can be independently verified.
  buildGravityClipFallbackRequest(signed,{
    now:at,
    trustedPublicKey:crypto.createPublicKey(privateKey),
  });
  return signed;
}

export function readProtectedOperatorPrivateKey(file){
  if(!clean(file)) throw new Error('gravity_sign_private_key_file_required');
  const target=path.resolve(file);
  const stat=fs.lstatSync(target);
  if(!stat.isFile()||(stat.mode&0o077)!==0) throw new Error('gravity_sign_private_key_permissions_unsafe');
  return fs.readFileSync(target,'utf8');
}

function arg(name){
  const index=process.argv.indexOf(name);
  return index>=0&&process.argv[index+1]?clean(process.argv[index+1]):'';
}
async function main(){
  const input=arg('--input');
  const output=arg('--output');
  const storyId=arg('--story-id');
  const operatorId=arg('--operator-id');
  const keyId=arg('--key-id');
  const keyFile=arg('--private-key-file');
  if(!input||!output||!storyId||!operatorId||!keyId||!keyFile||
      !process.argv.includes('--i-have-reviewed-evidence-and-copy')){
    throw new Error('Usage: journal-clip-gravity-sign.mjs --input <approved-unsigned.json> --output <signed.json> --story-id <exact-id> --operator-id <human-id> --key-id <trusted-key-id> --private-key-file <0600-private-key.pem> --i-have-reviewed-evidence-and-copy');
  }
  if(path.resolve(input)===path.resolve(output)) throw new Error('gravity_sign_refuse_input_overwrite');
  const release=JSON.parse(fs.readFileSync(path.resolve(input),'utf8'));
  if(release.story_id!==storyId) throw new Error('gravity_sign_story_id_confirmation_mismatch');
  const key=readProtectedOperatorPrivateKey(keyFile);
  const signed=signGravityRelease({release,privateKey:key,operatorId,keyId});
  // Exclusive create: never silently overwrite another signed release.
  fs.writeFileSync(path.resolve(output),JSON.stringify(signed,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({
    schema:'evercraft.journal.clip-gravity-sign-result.v1',
    result:'signed_release_written',
    story_id:signed.story_id,
    output:path.resolve(output),
    key_id:keyId,
    signature_algorithm:'Ed25519',
    provider_published:false,
    next_action:'Separate resident dry run and explicit manual --fire after provider readiness.',
  },null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  await main();
}
