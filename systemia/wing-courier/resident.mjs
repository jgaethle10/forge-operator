#!/usr/bin/env node
// Evercraft Wing Courier resident. Outbound-only pull and Passport-gated inert intake.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pollWingInbox} from './client.mjs';
import {hashFileSync} from './envelope.mjs';
import {offerVerifiedWingReceiptToSystemia} from './intake-bridge.mjs';
import {stageOneCompanyGoalCandidate} from '../one-company/goal-checkpoint.mjs';
const ID=/^[a-f0-9]{32}$/;
const HEX=/^[a-f0-9]{64}$/;
function fail(s){throw Error('wing_resident_'+s)}
function readConfig(file){
 const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))fail('config_not_private');
 const cfg=JSON.parse(fs.readFileSync(file,'utf8'));
 for(const x of ['baseUrl','receiveTokenFile','wing','destinationDir','receiverPrivateKeyFile','receiverSigningKeyFile'])
  if(!cfg[x])fail('config_'+x+'_missing');
 if(!cfg.senderVerifyPublicKeys||typeof cfg.senderVerifyPublicKeys!=='object')fail('trusted_senders_missing');
 if(cfg.goalStateDir){
  if(cfg.wing!=='fallen'||!cfg.passportStateDir||!cfg.intakeStateDir)
   fail('goal_checkpoint_requires_fallen_passport_intake');
  const g=fs.lstatSync(cfg.goalStateDir);
  if(!g.isDirectory()||g.isSymbolicLink()||(g.mode&0o077)!==0||
    (typeof process.getuid==='function'&&g.uid!==process.getuid()))
   fail('goal_checkpoint_private_directory_required');
 }
 return cfg;
}
function receiptFiles(root){
 if(!path.isAbsolute(root))fail('root_not_absolute');
 const entries=[];
 for(const name of fs.readdirSync(root)){
  if(!ID.test(name))continue;
  const dir=path.join(root,name),st=fs.lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink())continue;
  const receipt=path.join(dir,'receipt.json');
  if(!fs.existsSync(receipt))continue;
  const rs=fs.lstatSync(receipt);
  if(!rs.isFile()||rs.isSymbolicLink()||(rs.mode&0o077))continue;
  entries.push({dir,receipt});
 }
 return entries;
}
// A previously authenticated receipt can sit on disk while Passport is unavailable.
// Re-check its exact private byte custody on EVERY admission retry, not only when
// it first arrived. A changed/missing/symlinked asset must never become an Intake candidate.
// This is local integrity revalidation, not a substitute for the original signature
// verification at import or separate Passport admission.
function verifyCustodyForIntake({dir,receipt,wing}){
 const ds=fs.lstatSync(dir);
 if(!ds.isDirectory()||ds.isSymbolicLink()||(ds.mode&0o077))fail('custody_directory_not_private');
 if(receipt?.schema!=='evercraft.systemia.wing-receive-receipt.v1'||
  receipt.state!=='AUTHENTICATED_BYTES_RECEIVED'||receipt.privateCustodyVerified!==true||
  !ID.test(receipt.id||'')||path.basename(dir)!==receipt.id||
  receipt.toWing!==wing||!HEX.test(receipt.ciphertextSha256||'')||
  !Array.isArray(receipt.assets)||!receipt.assets.length||receipt.assets.length>100)
  fail('custody_identity_invalid');
 const allowed=new Set(['receipt.json']);
 const folded=new Set();
 for(const asset of receipt.assets){
  const name=asset?.filename;
  if(typeof name!=='string'||!name||name!==path.basename(name)||
   name.startsWith('.')||name.includes('/')||name.includes('\\')||
   folded.has(name.toLowerCase())||!HEX.test(asset.sha256||'')||
   !Number.isSafeInteger(asset.bytes)||asset.bytes<1)
   fail('custody_asset_manifest_invalid');
  folded.add(name.toLowerCase());
  const file=path.join(dir,name),st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size!==asset.bytes)
   fail('custody_asset_not_private_or_changed');
  if(hashFileSync(file)!==asset.sha256)fail('custody_asset_digest_changed');
  allowed.add(name);
 }
 if(fs.readdirSync(dir).some(name=>!allowed.has(name)))
  fail('custody_unexpected_files');
 return receipt;
}
export async function cycle({config,admit=true}={}){
 const pull=await pollWingInbox({baseUrl:config.baseUrl,tokenFile:config.receiveTokenFile,
  wing:config.wing,destinationDir:config.destinationDir,
  receiverPrivateKeyFile:config.receiverPrivateKeyFile,
  receiverSigningKeyFile:config.receiverSigningKeyFile,
  senderVerifyPublicKeys:config.senderVerifyPublicKeys});
 const admission={attempted:0,offered:0,pending:0,errors:[]};
 if(admit && config.intakeStateDir && config.passportStateDir){
  for(const {dir,receipt} of receiptFiles(config.destinationDir)){
   const ack=path.join(dir,'intake-offer.json');
   if(fs.existsSync(ack))continue;
   admission.attempted++;
   try{
    const record=verifyCustodyForIntake({dir,wing:config.wing,
     receipt:JSON.parse(fs.readFileSync(receipt,'utf8'))});
    const result=offerVerifiedWingReceiptToSystemia({
     receipt:record,intakeStateDir:config.intakeStateDir,
     passportStateDir:config.passportStateDir,adapterActorRef:config.adapterActorRef});
    // An owner must explicitly configure a private goal directory. This
    // creates a durable HELD mission plan, not a Saban lease or job.
    if(config.goalStateDir){
     if(config.wing!=='fallen'||!result.oneCompanyPlan)
      fail('goal_checkpoint_requires_verified_fallen_media');
     result.goalCheckpoint=stageOneCompanyGoalCandidate({
      handoff:result,privateGoalDir:config.goalStateDir
     });
    }
    fs.writeFileSync(ack,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
    admission.offered++;
   }catch(e){
    admission.pending++;
    admission.errors.push(e?.message||'intake_error');
   }
  }
 }
 return {schema:'evercraft.wing-courier.resident-cycle.v1',wing:config.wing,
  received:pull.received,held:pull.results.filter(x=>x.state==='HELD'||x.state==='HELD_UNKNOWN_SENDER').length,
  intake:admission,productionAuthorized:false,paymentAuthorized:false,customerSendAuthorized:false};
}
export async function runResident({configFile,once=false,intervalMs=30000,onCycle}={}){
 const config=readConfig(configFile);
 if(!Number.isInteger(intervalMs)||intervalMs<5000||intervalMs>3600000)fail('interval_range');
 let running=true;process.once('SIGINT',()=>{running=false});process.once('SIGTERM',()=>{running=false});
 do{
  try{
   const result=await cycle({config});
   onCycle?.(result);
  }catch(e){
   onCycle?.({schema:'evercraft.wing-courier.resident-cycle.v1',wing:config.wing,
    state:'HELD',error:e?.message||'poll_failed',customerSendAuthorized:false});
  }
  if(once)break;
  await new Promise(resolve=>setTimeout(resolve,intervalMs));
 }while(running);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const configFile=process.argv[2];
 if(!configFile){console.error('usage: node resident.mjs <private-config.json> [--once]');process.exitCode=2}
 else runResident({configFile,once:process.argv.includes('--once'),onCycle:row=>{
  console.log(JSON.stringify(row));
 }}).catch(e=>{console.error(e?.message||'wing_resident_error');process.exitCode=2});
}
