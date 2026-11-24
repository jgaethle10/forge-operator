#!/usr/bin/env node
/**
 * Crash-recoverable, private lease journal for future one-shot broker canaries.
 * This module does not create a lease, submit a job, or activate a broker.
 * Its only network operation is a narrowly scoped, authenticated lease RELEASE.
 *
 * Safety invariant: record lease credentials durably BEFORE POST /v1/jobs.
 * Then release by lease ID, regardless of whether service/job responses arrive.
 * Uncertain release stays on manual hold; never report a successful teardown.
 */
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';

const SCHEMA='evercraft.yard.shadow-broker-lease-journal.v1';
const JOURNAL='lease-journal.json';
const VALID_PHASES=new Set([
  'created','lease_recorded','submission_uncertain','manual_hold','released',
]);
const O=fs.constants;
const NODE=/^[A-Za-z0-9._-]{1,128}$/;
const SHA=/^[a-f0-9]{64}$/;
const BROKER_WORKLOAD='systemia.remote-capacity-broker.v1';
const RECEIPT_FIELDS=[
  'schema','node_id','seq','type','at','previous_hash',
  'lease_id','workload_class','receipt_hash',
];

function requireOk(ok,reason){
  if(!ok)throw Error('shadow_lease_'+reason);
}
function validateOrigin(origin){
  const url=new URL(String(origin||''));
  requireOk(
    url.protocol==='http:' &&
    url.hostname==='127.0.0.1' &&
    /^\d+$/.test(url.port) &&
    Number(url.port)>=1 &&
    Number(url.port)<=65535 &&
    !url.username && !url.password &&
    (url.pathname==='/'||url.pathname==='') &&
    !url.search && !url.hash,
    'origin_must_be_exact_loopback'
  );
  return url.origin;
}
function validateLease(lease){
  requireOk(
    /^[A-Za-z0-9_-]{5,128}$/.test(String(lease?.lease_id||'')) &&
    /^[a-f0-9]{48,128}$/i.test(String(lease?.token||'')),
    'invalid_lease_identity'
  );
  const expiry=Date.parse(String(lease.expires_at||''));
  const remaining=expiry-Date.now();
  requireOk(Number.isFinite(expiry)&&remaining>0&&remaining<=120_000,
    'lease_expiry_outside_one_shot_boundary');
}
function safeDir(directory){
  const stat=fs.lstatSync(directory);
  requireOk(stat.isDirectory()&&!stat.isSymbolicLink(),'unsafe_directory');
  requireOk((stat.mode&0o077)===0,'private_directory_permissions_required');
}
function readPrivate(dir){
  safeDir(dir);
  const name=path.join(dir,JOURNAL);
  const fd=fs.openSync(name,O.O_RDONLY|O.O_NOFOLLOW);
  try{
    const stat=fs.fstatSync(fd);
    requireOk(stat.isFile()&&stat.nlink===1&&stat.size<=16384&&
      (stat.mode&0o077)===0,'unsafe_journal_file');
    const state=JSON.parse(fs.readFileSync(fd,'utf8'));
    requireOk(
      state.schema===SCHEMA &&
      VALID_PHASES.has(state.phase) &&
      NODE.test(String(state.expected_node_id||'')) &&
      state.origin===validateOrigin(state.origin),
      'journal_content_invalid');
    return state;
  }finally{fs.closeSync(fd);}
}
function durableWrite(dir,body){
  safeDir(dir);
  const target=path.join(dir,JOURNAL);
  if(fs.existsSync(target))readPrivate(dir);
  const tmp=path.join(dir,'.journal-'+randomBytes(12).toString('hex'));
  const fd=fs.openSync(tmp,O.O_CREAT|O.O_EXCL|O.O_WRONLY|O.O_NOFOLLOW,0o600);
  try{
    fs.writeFileSync(fd,JSON.stringify(body,null,2)+'\n');
    fs.fsyncSync(fd);
  }finally{fs.closeSync(fd);}
  try{
    fs.renameSync(tmp,target);
    const dfd=fs.openSync(dir,O.O_RDONLY|O.O_DIRECTORY|O.O_NOFOLLOW);
    try{fs.fsyncSync(dfd)}finally{fs.closeSync(dfd)}
  }finally{
    if(fs.existsSync(tmp))fs.unlinkSync(tmp);
  }
}
export function createShadowLeaseJournal({parent,origin,expectedNodeId}={}){
  requireOk(typeof parent==='string'&&parent.length>0,'parent_required');
  safeDir(parent);
  const endpoint=validateOrigin(origin);
  requireOk(NODE.test(String(expectedNodeId||'')),'expected_node_id_required');
  const dir=fs.mkdtempSync(path.join(parent,'shadow-canary-'));
  fs.chmodSync(dir,0o700);
  durableWrite(dir,{
    schema:SCHEMA,
    phase:'created',
    origin:endpoint,
    expected_node_id:expectedNodeId,
    lease:null,
    submission_attempted:false,
    cleanup:'not_started',
    updated_at:new Date().toISOString(),
  });
  return dir;
}
export function recordShadowLease({dir,lease}={}){
  const state=readPrivate(dir);
  requireOk(state.phase==='created'&&!state.lease,'lease_already_recorded');
  validateLease(lease);
  const next={
    ...state,
    phase:'lease_recorded',
    lease:{
      lease_id:lease.lease_id,
      token:lease.token,
      expires_at:lease.expires_at,
    },
    updated_at:new Date().toISOString(),
  };
  durableWrite(dir,next);
  return {ok:true,phase:next.phase,lease_secret_logged:false};
}
export function recordShadowSubmissionIntent({dir}={}){
  const state=readPrivate(dir);
  requireOk(state.phase==='lease_recorded'&&state.lease,
    'submission_requires_recorded_lease');
  // The caller must persist this transition BEFORE sending POST /v1/jobs.
  const next={
    ...state,
    phase:'submission_uncertain',
    submission_attempted:true,
    updated_at:new Date().toISOString(),
  };
  durableWrite(dir,next);
  return {ok:true,phase:next.phase};
}
export function inspectShadowLeaseJournal({dir}={}){
  const state=readPrivate(dir);
  return {
    schema:SCHEMA,phase:state.phase,
    lease_recorded:Boolean(state.lease),
    submission_attempted:state.submission_attempted===true,
    cleanup:state.cleanup,
    expires_at:state.lease?.expires_at||null,
    secrets_printed:false,
  };
}
function validateReleaseProof(proof,state){
  if(!proof||typeof proof!=='object'||Array.isArray(proof)||
     Object.keys(proof).length!==RECEIPT_FIELDS.length||
     RECEIPT_FIELDS.some(k=>!Object.hasOwn(proof,k))||
     proof.schema!=='evercraft.compute.receipt.v1'||
     proof.type!=='capacity.lease.released'||
     proof.node_id!==state.expected_node_id||
     proof.lease_id!==state.lease?.lease_id||
     proof.workload_class!==BROKER_WORKLOAD||
     !Number.isSafeInteger(proof.seq)||proof.seq<1||
     !Number.isFinite(Date.parse(String(proof.at||'')))||
     !(proof.previous_hash==='GENESIS'||
       SHA.test(String(proof.previous_hash||'')))||
     !SHA.test(String(proof.receipt_hash||''))) return false;
  const {receipt_hash:hash,...body}=proof;
  const digest=createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return digest===hash;
}

/**
 * Attest only a finalized private journal. This verifies a locally stored,
 * hash-consistent NodeSeed receipt and the journal's secret erasure. It is
 * NOT a signed origin attestation and cannot prove the resident is stopped;
 * independent NodeSeed/DNS process observation is still mandatory.
 */
export function inspectShadowLeaseReleaseEvidence({dir,expectedNodeId}={}){
  const state=readPrivate(dir);
  const erased=Boolean(state.lease&&
    !Object.hasOwn(state.lease,'token')&&
    !Object.hasOwn(state.lease,'allocator_token'));
  const phaseOk=state.phase==='released'&&
    state.cleanup==='confirmed_lease_release';
  const nodeMatches=typeof expectedNodeId==='string'&&
    expectedNodeId.length>0&&expectedNodeId===state.expected_node_id;
  const valid=phaseOk&&erased&&nodeMatches&&
    validateReleaseProof(state.release_receipt,state);
  return {
    schema:'evercraft.yard.shadow-broker-release-attestation.v1',
    ok:valid,
    journal_phase:state.phase,
    release_receipt_verified:valid,
    receipt_integrity_only_not_signed:true,
    node_id:valid?state.expected_node_id:null,
    workload_class:valid?BROKER_WORKLOAD:null,
    secret_token_erased:erased,
    manual_reconciliation_required:!valid,
    automatic_job_retry_allowed:false,
    broker_activation_authorized:false,
  };
}

export async function releaseShadowLease({dir,request=fetch}={}){
  let state=readPrivate(dir);
  if(state.phase==='released'){
    return {ok:true,already_released:true,phase:'released'};
  }
  requireOk(state.lease&&['lease_recorded','submission_uncertain','manual_hold']
    .includes(state.phase),'no_recoverable_lease');

  // A lost POST /v1/jobs response does NOT matter: releasing the containing
  // lease stops every service attached to it on NodeSeed.
  const url=state.origin+'/v1/leases/'+
    encodeURIComponent(state.lease.lease_id)+'/release';
  try{
    const response=await request(url,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({token:state.lease.token}),
      signal:AbortSignal.timeout(4000),
    });
    if(!response.ok)throw Error('lease_release_non_success');
    const receipt=await response.json();
    const proof=receipt.receipt;
    if(receipt.ok!==true || !validateReleaseProof(proof,state))
      throw Error('lease_release_receipt_invalid_or_hash_mismatch');

    durableWrite(dir,{
      ...state,
      phase:'released',
      lease:{lease_id:state.lease.lease_id,expires_at:state.lease.expires_at},
      release_receipt:proof,
      cleanup:'confirmed_lease_release',
      updated_at:new Date().toISOString(),
    });
    return {
      ok:true,phase:'released',stopped_via_lease_release:true,
      receipt_present:true,
      lease_secret_logged:false,
    };
  }catch{
    // Even a timed-out release might have succeeded remotely. Do not
    // assume success, remove evidence, retry a job, or adopt the lease.
    state=readPrivate(dir);
    durableWrite(dir,{
      ...state,phase:'manual_hold',cleanup:'release_outcome_uncertain',
      updated_at:new Date().toISOString(),
    });
    return {
      ok:false,phase:'manual_hold',
      manual_reconciliation_required:true,
      no_automatic_job_retry:true,
      lease_secret_logged:false,
    };
  }
}
