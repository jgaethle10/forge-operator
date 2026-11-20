#!/usr/bin/env node
// Read-only local operator readiness snapshot for Harbor/Fallen. Never reads
// token bytes, sends network requests, configures user services, opens media,
// invokes Systemia workers, or claims a live signed Courier handoff.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {evaluateWingResidentConfig} from './install-resident.mjs';

export const OWNER_READINESS_SCHEMA='evercraft.wing-courier.owner-readiness.v1';
const HERE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SHA=/^[a-f0-9]{40}$/;
const fail=x=>{throw Error('wing_owner_readiness_'+x)};
function command(exec,file,args){
 try{
  const r=exec(file,args,{encoding:'utf8',timeout:4000,windowsHide:true});
  if(r?.status!==0||r?.error||typeof r.stdout!=='string')return null;
  return r.stdout.trim();
 }catch{return null}
}
function serviceState(text){
 if(typeof text!=='string'||text.length>1024)return 'UNVERIFIED';
 const entries=Object.fromEntries(text.split(/\r?\n/).map(line=>line.split('=',2))
   .filter(row=>row.length===2));
 if(entries.LoadState==='loaded'&&entries.ActiveState==='active')return 'ACTIVE_UNATTESTED';
 if(entries.LoadState==='loaded')return 'INSTALLED_NOT_ACTIVE';
 if(entries.LoadState==='not-found')return 'NOT_INSTALLED';
 return 'UNVERIFIED';
}

/**
 * Purely observational (with injected command and config adapters for tests).
 * Any private path from caller/config remains LOCAL and is never returned.
 * A Git commit hash is provenance metadata, NOT proof an owner reviewed it.
 */
export function observeOwnerReadiness({
 wing,configPath,
 sourceRoot=HERE,platform=process.platform,
 nodeMajor=Number(process.versions.node.split('.')[0]),
 uid=typeof process.getuid==='function'?process.getuid():null,
 exec=spawnSync,configEvaluator=evaluateWingResidentConfig
}={}){
 if(!['harbor','fallen'].includes(wing))fail('wing_required');
 const linux=platform==='linux',nodeReady=Number.isInteger(nodeMajor)&&nodeMajor>=22;
 const unprivileged=uid!==0;
 const service='evercraft-wing-courier-'+wing+'.service';
 const git=command(exec,'git',['-C',sourceRoot,'rev-parse','HEAD']);
 const clean=command(exec,'git',['-C',sourceRoot,'status','--porcelain']);
 const commit=SHA.test(git||'')?git:null;
 // Exact local unit state is observational only and is not cryptographic proof
 // that a specific binary or owner-side configuration is trustworthy.
 const unit=linux?command(exec,'systemctl',['--user','show',service,
  '--property=LoadState','--property=ActiveState','--no-pager']):null;
 const systemdState=serviceState(unit);
 let config='NOT_SUPPLIED';
 if(configPath!==undefined&&configPath!==null){
  if(typeof configPath!=='string'||!path.isAbsolute(configPath))
   config='HOLD_INVALID_PRIVATE_CONFIGURATION';
  else{
   try{
    const pre=configEvaluator({configPath,wingExpected:wing});
    config=pre?.readyForLocalActivation===true&&pre.wing===wing?
      'LOCAL_PRIVATE_PREFLIGHT_PASS':'HOLD_INVALID_PRIVATE_CONFIGURATION';
   }catch{config='HOLD_INVALID_PRIVATE_CONFIGURATION'}
  }
 }
 const readyForOperatorReview=linux&&nodeReady&&unprivileged&&commit!==null&&
   systemdState!=='UNVERIFIED'&&config==='LOCAL_PRIVATE_PREFLIGHT_PASS';
 return Object.freeze({
  schema:OWNER_READINESS_SCHEMA,
  wing,
  hostType:linux?'LINUX':'NON_LINUX',
  node22Plus:nodeReady,
  nonRootUser:unprivileged,
  canonicalSourceCommit:commit,
  checkoutClean:clean===null?'UNKNOWN':clean===''?'YES':'NO',
  sourceReviewedAndSignedByOwner:false,
  userServiceState:systemdState,
  ownerPrivateConfig:config,
  status:readyForOperatorReview?'LOCAL_REVIEW_CANDIDATE_ONLY':'HOLD_FOR_PRIVATE_SETUP',
  nextGate:config!=='LOCAL_PRIVATE_PREFLIGHT_PASS'?
   'OWNER_PRIVATE_RECEIVER_CONFIG_AND_KEY_ENROLLMENT':
   'SEPARATE_AUTHENTICATED_COURIER_INBOX_CANARY',
  localPrivatePathsPublished:false,
  tokensReadByThisTool:false,
  // When --config is supplied, canonical local preflight parses private
  // signing/decryption keys in memory to validate their *type*; it never
  // includes the bytes or paths in this public-safe output.
  signingKeysReadByThisTool:configPath!==undefined&&configPath!==null,
  signingKeysPublished:false,
  outboundNetworkRequested:false,
  serviceMutationPerformed:false,
  customerFilesMoved:false,
  realSignedCustodyReceipt:false,
  workerExecutionAuthorized:false,
  customerContactAuthorized:false,
  paymentAuthorized:false
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 const w=args.indexOf('--wing'),c=args.indexOf('--config');
 const wing=w>=0?args[w+1]:null,configPath=c>=0?args[c+1]:undefined;
 if(args.some((x,i)=>x.startsWith('--')&&!['--wing','--config'].includes(x))||
    !['harbor','fallen'].includes(wing)){
  console.error('HOLD: usage --wing harbor|fallen [--config <existing-private-configuration>]');
  process.exitCode=2;
 }else{
  // No network or service modifications from this entry point, ever.
  try{console.log(JSON.stringify(observeOwnerReadiness({wing,configPath}),null,2))}
  catch{console.error('HOLD: wing_owner_readiness_unavailable');process.exitCode=2}
 }
}
