#!/usr/bin/env node
// Owner-only submission command. NOT installed in GitHub Actions or a cron.
// Every privileged file is supplied by the admitted owner, mode 0600,
// outside the source checkout. There is no dry-run that silently writes.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runSignedDraftPrPublisher} from './kaidance-signed-draft-pr.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
function flag(key){const i=process.argv.indexOf(key);return i<0?'':process.argv[i+1]||''}
const required=['--private-dir','--review','--candidate','--permit','--trusted-key','--github-token'];
if(required.some(x=>!flag(x))){
 console.error(JSON.stringify({schema:'evercraft.kaidance.signed-draft-pr-cli.v1',
  ok:false,state:'hold_missing_owner_private_inputs',writes:0}));
 process.exitCode=2;
}else{
 runSignedDraftPrPublisher({
  root,privateDir:path.resolve(flag('--private-dir')),
  reviewFile:path.resolve(flag('--review')),
  candidateFile:path.resolve(flag('--candidate')),
  permitFile:path.resolve(flag('--permit')),
  trustKeyFile:path.resolve(flag('--trusted-key')),
  tokenFile:path.resolve(flag('--github-token'))
 }).then(out=>{
  console.log(JSON.stringify({schema:'evercraft.kaidance.signed-draft-pr-cli.v1',
   ok:out.provider_readback_present,state:out.state,
   goal_key:out.goal_key,independent_provider_reconciliation_required:true,
   direct_main_writes:0,merge_actions:0}));
  if(!out.provider_readback_present)process.exitCode=2;
 }).catch(error=>{
  console.error(JSON.stringify({schema:'evercraft.kaidance.signed-draft-pr-cli.v1',
   ok:false,state:'hold_reconcile_before_retry',
   reason:String(error?.message||error).slice(0,120),
   remote_effect_unknown:true,automatic_replay_allowed:false}));
  process.exitCode=2;
 });
}
