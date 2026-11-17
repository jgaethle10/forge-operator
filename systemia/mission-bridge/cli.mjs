#!/usr/bin/env node
// Deterministic, fail-closed mission queue consumer for an authorized GitHub
// source revision. No arbitrary scripts, URLs, paths, secrets or shell.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {admitMissionRequest,runMissionRequest} from './bridge.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const REL='systemia/mission-bridge/requests/';
const ID=/^[a-z][a-z0-9-]{8,63}$/;
const OUT=path.join(ROOT,'artifacts','systemia-mission-bridge');
function missionFile(id){
  if(!ID.test(String(id||'')))throw Error('mission_id_invalid');
  return path.join(ROOT,REL,id+'.json');
}
export function readQueuedMission(id){
  const file=missionFile(id);
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>4096)throw Error('mission_file_not_regular_or_too_large');
  const request=JSON.parse(fs.readFileSync(file,'utf8'));
  if(request.mission_id!==id)throw Error('mission_filename_id_mismatch');
  return request;
}
export function changedMissionIds({git=execFileSync}={}){
  const changed=String(git('git',['diff','--name-only','HEAD^','HEAD','--',REL],{
    cwd:ROOT,encoding:'utf8',timeout:20000
  })).trim().split('\n').filter(Boolean);
  const ids=new Set();
  for(const filename of changed){
    if(!filename.startsWith(REL)||!filename.endsWith('.json'))continue;
    const id=filename.slice(REL.length,-5);
    if(!ID.test(id))throw Error('unapproved_mission_filename_changed');
    ids.add(id);
  }
  if(ids.size>8)throw Error('mission_batch_limit_exceeded');
  return [...ids].sort();
}
function save(name,value){
  fs.mkdirSync(OUT,{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(OUT,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
}
async function main(){
  const arg=process.argv[2],value=process.argv[3];
  let ids=[];
  if(arg==='--changed')ids=changedMissionIds();
  else if(arg==='--request')ids=[value];
  else if(arg==='--plan')ids=[value];
  else throw Error('usage: mission-bridge/cli.mjs --changed | --request mission-id | --plan mission-id');
  if(ids.length>8)throw Error('mission_batch_limit_exceeded');
  const receipts=[];
  for(const id of ids){
    const input=readQueuedMission(id);
    const admitted=admitMissionRequest(input);
    if(arg==='--plan'){
      receipts.push({...admitted,source_only:true,network_called:false});
      continue;
    }
    const observation=await runMissionRequest(input,{rootDir:ROOT});
    save(id+'.json',observation);
    receipts.push({mission_id:id,state:observation.state,diagnosis:observation.diagnosis,
      route:observation.route,receipt:id+'.json'});
  }
  const incomplete=receipts.filter(r=>r.state==='observation_incomplete').length;
  const result={schema:'evercraft.systemia.chat-mission-batch.v1',
    status:arg==='--plan'?'plan_only':!ids.length?'no_new_mission':
      incomplete?'incomplete_observation':'observations_recorded',
    total:receipts.length,incomplete,receipts,
    claims_external_execution:false,mutation_performed:false};
  if(arg!=='--plan')save('summary.json',result);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  const summary=process.env.GITHUB_STEP_SUMMARY;
  if(summary)fs.appendFileSync(summary,
    '## Systemia Mission Bridge\n\nMissions inspected: '+ids.length+
    '\n\nObserved incomplete: '+incomplete+
    '\n\nExecution was read-only. GitHub receipt is not authority for payments, deployments or remote node execution.\n');
  if(incomplete)process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{
    console.error('SYSTEMIA_MISSION_HOLD '+String(error?.message||error).slice(0,150));
    process.exitCode=1;
  });
}
