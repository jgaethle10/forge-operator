#!/usr/bin/env node
// Evercraft Wing Courier: owner-local PRIVATE broker enrollment.
// DRY RUN by default. Never connects to network, starts services or exposes credentials.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateWingBrokerConfig} from './install-broker.mjs';

export const ENROLLMENT_SCHEMA='evercraft.wing-courier.private-broker-enrollment.v1';
const FP=/^[a-f0-9]{64}$/i;
const fail=code=>{throw Error('wing_enrollment_'+code);};

function walkNoSymlinks(input){
  if(typeof input!=='string'||!path.isAbsolute(input))fail('absolute_path_required');
  let current=path.resolve(input);
  while(true){
    const stat=fs.lstatSync(current);
    if(stat.isSymbolicLink())fail('symlinked_component');
    const parent=path.dirname(current);
    if(parent===current)break;
    current=parent;
  }
}
function ownedPrivateParent(root){
  if(typeof root!=='string'||!path.isAbsolute(root)||root==='/')fail('private_root_invalid');
  const target=path.resolve(root),parent=path.dirname(target);
  // Systemd broker installer must be able to accept every generated path.
  if(/[\s%\u0000-\u001f\\;"'\x60$&|<>#]/.test(target))fail('unsafe_broker_config_path');
  walkNoSymlinks(parent);
  const st=fs.lstatSync(parent);
  if(!st.isDirectory()||(st.mode&0o077)!==0||
     (typeof process.getuid==='function'&&st.uid!==process.getuid()))
    fail('private_parent_not_owner_only');
  if(fs.existsSync(target))fail('destination_already_exists');
  return {target,parent};
}
function trustedEd25519Public(file,expectedFingerprint){
  if(typeof file!=='string'||!path.isAbsolute(file))fail('public_key_absolute_path_required');
  walkNoSymlinks(file);
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.nlink!==1||(st.mode&0o022)!==0)fail('public_key_file_unsafe');
  if(st.size<40||st.size>4096)fail('public_key_size_invalid');
  const pem=fs.readFileSync(file,'utf8');
  if(!/^-----BEGIN PUBLIC KEY-----\r?\n/.test(pem)||!/\n-----END PUBLIC KEY-----\r?\n?$/.test(pem))
    fail('public_key_pem_required');
  let key;
  try{key=crypto.createPublicKey(pem)}catch{fail('public_key_invalid')}
  if(key.asymmetricKeyType!=='ed25519')fail('ack_public_key_not_ed25519');
  const digest=crypto.createHash('sha256').update(key.export({format:'der',type:'spki'})).digest('hex');
  if(!FP.test(expectedFingerprint||'')||digest!==expectedFingerprint.toLowerCase())
    fail('trusted_key_fingerprint_mismatch');
  return {pem,fingerprint:digest};
}
function writeSecret(file,token){
  fs.writeFileSync(file,token+'\n',{mode:0o600,flag:'wx'});
}
function ensureNodeAndUser(){
  if(Number(process.versions.node.split('.')[0])<22)fail('node22_required');
  if(typeof process.getuid==='function'&&process.getuid()===0)fail('root_forbidden');
}
/**
 * Explicit trusted public-fingerprint admission. Key fingerprints must be
 * independently verified from each wing, not supplied by untrusted content.
 *
 * Returns ONLY non-secret status and public key hashes.
 * Does not deliver tokens to the wings, register a sender, start broker/Fabric,
 * grant Passport, or touch real customer media.
 */
export function prepareOwnerBrokerEnrollment({
  root,harborSignPublicFile,harborFingerprint,
  fallenSignPublicFile,fallenFingerprint,
  provision=false,confirmOwnedHost=false
}={}){
  ensureNodeAndUser();
  const {target,parent}=ownedPrivateParent(root);
  const harbor=trustedEd25519Public(harborSignPublicFile,harborFingerprint);
  const fallen=trustedEd25519Public(fallenSignPublicFile,fallenFingerprint);
  if(harbor.fingerprint===fallen.fingerprint)fail('receiver_signers_not_distinct');
  const report={
    schema:ENROLLMENT_SCHEMA,
    mode:'DRY_RUN',privateBrokerConfigPrepared:false,
    intendedPort:8851,intendedHost:'127.0.0.1',
    wings:['harbor','fallen'],distinctSignerKeys:true,
    publicKeyFingerprints:{harbor:harbor.fingerprint,fallen:fallen.fingerprint},
    localTokensCreated:0,secretMaterialReturned:false,
    brokerStarted:false,fabricRouteActivated:false,externalSenderCredentialDelivered:false,
    fallenRecipientX25519Enrolled:false,liveTransferVerified:false,
    customerMediaTouched:false,paymentAuthorityGranted:false
  };
  if(!provision)return report;
  if(!confirmOwnedHost)fail('owner_host_confirmation_required');
  const staging=fs.mkdtempSync(path.join(parent,'.wing-enrollment-'));
  fs.chmodSync(staging,0o700);
  let committed=false;
  try{
    const secretDir=path.join(staging,'secrets');
    const trustDir=path.join(staging,'trusted');
    const stateDir=path.join(staging,'state');
    for(const d of [secretDir,trustDir,stateDir])fs.mkdirSync(d,{mode:0o700});
    const tokens=new Set();
    const wings=[];
    for(const row of [{wing:'harbor',key:harbor,to:'fallen'},{wing:'fallen',key:fallen,to:'harbor'}]){
      const tokenFiles={};
      for(const role of ['send','receive']){
        const file=row.wing+'.'+role+'.token';
        let token;
        do{token=crypto.randomBytes(48).toString('base64url')}while(tokens.has(token));
        tokens.add(token);
        writeSecret(path.join(secretDir,file),token);
        tokenFiles[role]=path.join(target,'secrets',file);
      }
      const publicName=row.wing+'.sign.pub';
      fs.writeFileSync(path.join(trustDir,publicName),row.key.pem,{mode:0o600,flag:'wx'});
      wings.push({
        wing:row.wing,sendTokenFile:tokenFiles.send,receiveTokenFile:tokenFiles.receive,
        ackVerifyPublicKeyFile:path.join(target,'trusted',publicName),
        allowedDestinations:[row.to]
      });
    }
    const cfg={stateDir:path.join(target,'state'),port:8851,wings};
    fs.writeFileSync(path.join(staging,'broker.json'),JSON.stringify(cfg,null,2)+'\n',
      {mode:0o600,flag:'wx'});
    if(fs.existsSync(target))fail('destination_race');
    fs.renameSync(staging,target);
    committed=true;
    const proof=evaluateWingBrokerConfig({configPath:path.join(target,'broker.json')});
    if(!proof.readyForOwnedLocalActivation||proof.separateTokens!==4)
      fail('broker_config_postcheck_failed');
    return {...report,mode:'PRIVATE_CONFIG_PROVISIONED_NO_SERVICE',
      privateBrokerConfigPrepared:true,localTokensCreated:4,
      privateStorageChecked:true,brokerInstallerDryRunVerified:true};
  }finally{
    if(!committed){
      // Only the uniquely named temporary staging directory is ours to clean.
      // Never delete an existing target, keys, state or another operator's work.
      fs.rmSync(staging,{force:true,recursive:true});
    }
  }
}
function readCli(argv){
  const flags=new Set(['--root','--harbor-sign-pub','--harbor-fingerprint',
    '--fallen-sign-pub','--fallen-fingerprint']);
  const switches=new Set(['--provision','--confirm-owned-host']);
  const obj={};
  for(let i=0;i<argv.length;i++){
    const k=argv[i];
    if(switches.has(k)){if(obj[k])fail('duplicate_option');obj[k]=true;continue}
    if(!flags.has(k)||obj[k]!==undefined||i+1>=argv.length||
      argv[i+1].startsWith('--'))fail('invalid_cli_option');
    obj[k]=argv[++i];
  }
  for(const flag of flags)if(typeof obj[flag]!=='string')fail('missing_required_option');
  return {root:obj['--root'],harborSignPublicFile:obj['--harbor-sign-pub'],
    harborFingerprint:obj['--harbor-fingerprint'],fallenSignPublicFile:obj['--fallen-sign-pub'],
    fallenFingerprint:obj['--fallen-fingerprint'],provision:!!obj['--provision'],
    confirmOwnedHost:!!obj['--confirm-owned-host']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(prepareOwnerBrokerEnrollment(readCli(process.argv.slice(2)))))}
  catch{console.error('HOLD: wing_enrollment_private_preflight_failed');process.exitCode=2}
}
