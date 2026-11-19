#!/usr/bin/env node
// Operator-only source custody control. Never a customer send, payment, or Studio release.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createYardRelayLineageRemote } from '../lineage/http-remote.mjs';
import {
  stageHarborEncryptedHandoff, pushHarborEncryptedHandoff,
  receiveHarborEncryptedHandoff
} from './harbor-private-lineage-handoff.mjs';

const eq=(a,b)=>a===b;
const hex=b=>crypto.createHash('sha256').update(b).digest('hex');
function fail(code){throw new Error('harbor_operator_'+code);}
function safePath(p){
  if(typeof p!=='string'||!path.isAbsolute(p))fail('absolute_private_path_required');
  return path.resolve(p);
}
function privateRegular(file,maxBytes=32*1024){
  const p=safePath(file),s=fs.lstatSync(p);
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>maxBytes||(s.mode&0o077)!==0)
    fail('private_file_permissions_or_type_invalid');
  return p;
}
export function loadPrivateOperatorConfig(file){
  const p=privateRegular(file);
  const c=JSON.parse(fs.readFileSync(p,'utf8'));
  if(!c||typeof c!=='object'||Array.isArray(c))fail('private_config_invalid');
  return c;
}
export function generateRecipientKeyFiles({privateKeyPath,publicKeyPath}){
  const prv=safePath(privateKeyPath),pub=safePath(publicKeyPath);
  if(prv===pub)fail('key_paths_collide');
  for(const p of [prv,pub]){
    const parent=fs.lstatSync(path.dirname(p));
    if(!parent.isDirectory()||parent.isSymbolicLink()||(parent.mode&0o077)!==0)
      fail('key_directory_not_private');
    if(fs.existsSync(p))fail('refuse_key_overwrite');
  }
  const keys=crypto.generateKeyPairSync('x25519');
  const privatePem=keys.privateKey.export({format:'pem',type:'pkcs8'}).toString();
  const publicPem=keys.publicKey.export({format:'pem',type:'spki'}).toString();
  const fingerprint=hex(keys.publicKey.export({format:'der',type:'spki'}));
  try {
    fs.writeFileSync(prv,privatePem,{flag:'wx',mode:0o600});
    fs.writeFileSync(pub,publicPem,{flag:'wx',mode:0o600});
  } catch(e){
    try{if(fs.existsSync(prv)&&!fs.existsSync(pub))fs.unlinkSync(prv);}catch{}
    throw e;
  }
  return {
    schema:'evercraft.fallen.recipient-key-identity.v1',
    publicKeySha256:fingerprint,
    privateKeyMaterialExported:false,
    jobAuthorityGranted:false,
    trustState:'CREATED_NOT_OWNER_ATTESTED'
  };
}
export function readPinnedRelay({relayUrl},env=process.env){
  const approved=String(env.EVERCRAFT_OWNER_APPROVED_LINEAGE_RELAY_URL||'');
  const tokenFile=String(env.EVERCRAFT_LINEAGE_RELAY_TOKEN_FILE||'');
  if(!approved||!relayUrl||!eq(approved,relayUrl))fail('relay_not_owner_pinned');
  let u;
  try{u=new URL(relayUrl);}catch{fail('relay_url_invalid');}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||!u.hostname)
    fail('relay_https_only');
  const p=privateRegular(tokenFile,4096);
  const token=fs.readFileSync(p,'utf8').trim();
  if(token.length<16||/\s/.test(token))fail('relay_token_invalid');
  return createYardRelayLineageRemote({
    relayUrl,
    tokenProvider:()=> {
      const current=fs.readFileSync(privateRegular(p,4096),'utf8').trim();
      if(current.length<16||/\s/.test(current))fail('relay_token_revoked_or_invalid');
      return current;
    }
  });
}
export async function runHarborLineageOperator(mode,config,env=process.env){
  if(!config||typeof config!=='object')fail('config_required');
  if(mode==='keygen')return generateRecipientKeyFiles(config);
  if(mode==='stage'){
    const publicKeyPem=fs.readFileSync(safePath(config.recipientPublicKeyPath),'utf8');
    return stageHarborEncryptedHandoff({
      manifestPath:config.manifestPath,assetsDir:config.assetsDir,
      storeDir:config.storeDir,packagePath:config.packagePath,
      jobRef:config.jobRef,recipientPublicKeyPem:publicKeyPem,
      recipientPublicKeyFingerprint:config.recipientPublicKeyFingerprint
    });
  }
  if(mode==='send'){
    const remote=readPinnedRelay(config,env);
    return pushHarborEncryptedHandoff({
      packagePath:config.packagePath,storeDir:config.storeDir,remote
    });
  }
  if(mode==='receive'){
    const remote=readPinnedRelay(config,env);
    const recipientPrivateKeyPem=fs.readFileSync(
      privateRegular(config.recipientPrivateKeyPath,4096),'utf8');
    return receiveHarborEncryptedHandoff({
      packagePath:config.packagePath,storeDir:config.storeDir,remote,
      recipientPrivateKeyPem,outputDir:config.outputDir,
      operatorRef:config.operatorRef,expectedJobRef:config.expectedJobRef
    });
  }
  fail('unsupported_mode');
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [,,mode,configPath]=process.argv;
  try{
    if(!['keygen','stage','send','receive'].includes(mode)||!configPath||process.argv.length!==4)
      fail('usage_mode_and_private_config');
    const result=await runHarborLineageOperator(mode,loadPrivateOperatorConfig(configPath));
    // Never print private files, owner credentials, customer filenames or asset hashes.
    console.log(JSON.stringify({
      state:result.status||result.trustState,
      objectCount:result.objectCount||null,
      sourceAssetCount:result.sourceAssetCount||result.assetCount||null,
      transportAuthority:false,
      productionAuthority:false,
      customerDeliveryAuthority:false
    }));
  }catch(error){
    const code=String(error?.message||'operator_failed');
    console.error(/^harbor_(operator|fallen|import)_[a-z0-9_]+$/.test(code)
      ? code : 'harbor_operator_execution_failed');
    process.exitCode=2;
  }
}
