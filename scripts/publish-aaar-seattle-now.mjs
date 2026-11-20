#!/usr/bin/env node
// Reviewed Seattle Sky Passport 1.2 one-asset release on the EXISTING owned Penguin Worlds vault.
// No server restart, repo reset, Journal edits, DNS or edge changes.
// Run only on the actual Penguin host after fetching approved GitHub main.
// This temporarily updates ONE tracked page; source checkout reconciliation
// is required when the regular Fabric updater's dirty-Journal hold is resolved.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const SCHEMA='evercraft.aaar.single-asset-release.v1';
const REPO='jgaethle10/forge-operator';
const PIN='274f9ff0fd08ab51576cb6f0c6ad2b23eabe831f';
const RELEASE='public/worlds/flight/index.html';
const EXPECTED='c2a680c20dac6602f977f57b8640c31c9c3a68a4317abb732092af41edc8d23c';
const ALLOWED_OLD='4914c2eef58750031169469b3884692035b93fb1d2e1ece3a7d6f2802c609134';
const ORIGIN='https://worlds.systemiacommandcenters.com';
const apply=process.argv.includes('--apply');
const hash=x=>createHash('sha256').update(x).digest('hex');
const cmd=(name,args,opts={})=>{
 const r=spawnSync(name,args,{cwd:process.cwd(),timeout:15000,maxBuffer:1024*1024,...opts});
 if(r.error||r.status!==0)throw Error('command_failed_'+name+'_'+args.slice(0,3).join('_')+'_status_'+r.status);
 return r.stdout;
};
const get=async u=>{
 const response=await fetch(u,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(7000)});
 if(response.status!==200)throw Error('http_'+response.status);
 return Buffer.from(await response.arrayBuffer());
};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

let temp=null;
try{
 if(os.hostname()!=='penguin'||process.getuid?.()===0)throw Error('must_run_as_regular_user_on_penguin');
 const repoRoot=await fs.realpath(process.cwd());
 if(!await fs.stat(path.join(repoRoot,'.git')).then(s=>s.isDirectory()).catch(()=>false))throw Error('must_run_from_forge_checkout_root');
 const remote=String(cmd('git',['-C',repoRoot,'remote','get-url','origin'],{encoding:'utf8'})).trim();
 if(!/^(https:\/\/github\.com\/|git@github\.com:)jgaethle10\/forge-operator(\.git)?$/.test(remote))throw Error('untrusted_checkout_remote');
 cmd('git',['-C',repoRoot,'merge-base','--is-ancestor',PIN,'refs/remotes/origin/main']);
 const source=cmd('git',['-C',repoRoot,'show',PIN+':'+RELEASE]);
 if(hash(source)!==EXPECTED||!source.toString('utf8').includes('aaar-seattle-geography')||
    !source.toString('utf8').includes('Space Needle'))throw Error('pinned_seattle_source_validation_failed');

 if(String(cmd('systemctl',['--user','is-active','evercraft-worlds-vault.service'],{encoding:'utf8'})).trim()!=='active')throw Error('worlds_vault_inactive');
 const units=String(cmd('systemctl',['--user','cat','evercraft-worlds-vault.service'],{encoding:'utf8'}));
 const execs=[...units.matchAll(/^ExecStart=(.+)$/gm)].map(m=>m[1]).filter(Boolean);
 if(!execs.length)throw Error('worlds_unit_execstart_missing');
 const args=execs.at(-1).trim().split(/\s+/);
 const flag=name=>args[args.indexOf('--'+name)+1]||'';
 if(!args.some(v=>v.endsWith('/systemia/worlds/worlds-vault-runtime.mjs'))||
   flag('host')!=='127.0.0.1'||flag('port')!=='8788')
   throw Error('worlds_unit_not_expected_loopback_runtime');
 const publicRoot=await fs.realpath(flag('public-root'));
 if(!publicRoot.startsWith(os.homedir()+path.sep)||
   !publicRoot.endsWith('/public'))throw Error('worlds_public_root_unexpected');
 const target=path.join(publicRoot,'worlds/flight/index.html');
 const parent=await fs.realpath(path.dirname(target));
 if(parent!==path.join(publicRoot,'worlds/flight'))throw Error('worlds_asset_parent_symlinked');
 const stat=await fs.lstat(target);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid())throw Error('flight_asset_owner_or_type_unexpected');
 const previous=await fs.readFile(target);
 const priorHash=hash(previous);
 if(priorHash!==ALLOWED_OLD&&priorHash!==EXPECTED)throw Error('unknown_local_flight_revision_hold_'+priorHash);
 const health=JSON.parse((await get('http://127.0.0.1:8788/worlds/api/health')).toString('utf8'));
 if(health.ok!==true||health.schema!=='evercraft.worlds.vault.v1'||
    health.mode!=='owned-durable-vault')throw Error('owned_worlds_health_mismatch');
 const loopbackBefore=await get('http://127.0.0.1:8788/worlds/flight/');
 if(hash(loopbackBefore)!==priorHash)throw Error('actual_vault_not_serving_the_checked_file_hold');

 const status={schema:SCHEMA,mode:apply?'apply':'dry_run',
  expected_sha256:EXPECTED,previous_sha256:priorHash,
  source_commit:PIN,validated_git_authority:true,validated_owned_loopback:true,
  affected_path:'worlds/flight/index.html',journal_touched:false,
  server_restarted:false,dns_or_edge_modified:false,
  source_checkout_reconciliation_pending:priorHash!==EXPECTED};
 if(!apply||priorHash===EXPECTED){console.log(JSON.stringify({...status,state:priorHash===EXPECTED?'already_current':'ready_for_apply'},null,2));process.exit(0);}

 const vaultState=path.join(os.homedir(),'.local/state/evercraft/aaar-flight-asset-releases');
 await fs.mkdir(vaultState,{recursive:true,mode:0o700});
 const backup=path.join(vaultState,'before-'+priorHash+'-'+randomBytes(4).toString('hex')+'.html');
 await fs.writeFile(backup,previous,{flag:'wx',mode:0o600});
 temp=path.join(parent,'.aaar-release-'+randomBytes(8).toString('hex')+'.tmp');
 await fs.writeFile(temp,source,{flag:'wx',mode:stat.mode&0o777});
 await fs.rename(temp,target);temp=null;
 let localHash;
 try{localHash=hash(await get('http://127.0.0.1:8788/worlds/flight/'));}
 catch{localHash='local_unreachable';}
 if(localHash!==EXPECTED){
   const restore=path.join(parent,'.aaar-restore-'+randomBytes(8).toString('hex')+'.tmp');
   await fs.writeFile(restore,previous,{flag:'wx',mode:stat.mode&0o777});
   await fs.rename(restore,target);
   throw Error('local_readback_failed_rolled_back_'+localHash);
 }
 let publicHash='not_verified',externalError='';
 for(let i=0;i<5;i++){
   try{
     publicHash=hash(await get(ORIGIN+'/worlds/flight/'));
     if(publicHash===EXPECTED)break;
   }catch(e){externalError=String(e.message).slice(0,90);}
   if(i<4)await delay(1000);
 }
 const receipt={...status,state:publicHash===EXPECTED?'public_verified':'local_updated_public_unverified',
  observed_at_utc:new Date().toISOString(),local_hash:localHash,
  public_hash:publicHash,public_verified:publicHash===EXPECTED,
  link:ORIGIN+'/worlds/flight/#seattle',backup_created:true,
  external_error:externalError||null};
 const receiptFile=path.join(vaultState,'release-'+randomBytes(8).toString('hex')+'.json');
 await fs.writeFile(receiptFile,JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify(receipt,null,2));
 if(!receipt.public_verified)process.exitCode=2;
}catch(e){
 console.error(JSON.stringify({schema:SCHEMA,state:'HOLD',reason:String(e.message).slice(0,230),no_checkout_reset:true},null,2));
 process.exitCode=1;
}finally{
 if(temp)await fs.rm(temp,{force:true}).catch(()=>{});
}
