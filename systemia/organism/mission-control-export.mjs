#!/usr/bin/env node
// Operator-selected local sources only: no network calls, service restarts, dispatch or payment.
// Snapshot output is a SELF-REPORTED observation, never a signed claim or authenticated remote feed.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpath,readFile,stat,writeFile} from 'node:fs/promises';
import {readGoalState} from './goal-store.mjs';
import {projectGoalStates} from './mission-control-projection.mjs';
import {projectLocalHealthWatch} from './mission-control-node-watch.mjs';

const SCHEMA='evercraft.systemia.operator-mission-snapshot.v1';
async function readBoundedJson(filename){
 const full=path.resolve(filename);
 const s=await stat(full);
 if(!s.isFile()||s.size>262144)throw Error('Node watch file is not a regular bounded file');
 const contents=await readFile(full,'utf8');
 if(contents.length>262144)throw Error('Node watch JSON exceeds size limit');
 return JSON.parse(contents);
}
async function main(argv){
 const files=[],watch={node001:{},node002:{}};let out='';
 const usage='Usage: --state /private/goal.json [--state ...] [--node001-watch /private/health-watch.json --node001-id expected-id] [--node002-watch /private/health-watch.json --node002-id expected-id] --out /private/snapshot.json';
 for(let i=0;i<argv.length;i++){
  const key=argv[i],value=argv[++i];
  if(!value||value.startsWith('--'))throw Error(usage);
  if(key==='--state')files.push(value);
  else if(key==='--out'&&!out)out=value;
  else if(/^--node00[12]-(watch|id)$/.test(key)){
   const match=key.match(/^--(node00[12])-(watch|id)$/);
   if(watch[match[1]][match[2]])throw Error('Duplicate node argument rejected');
   watch[match[1]][match[2]]=value;
  }else throw Error(usage);
 }
 const watches=Object.entries(watch).filter(([,x])=>x.watch||x.id);
 if(!out||files.length>80||!files.length&&!watches.length||watches.some(([,w])=>!w.watch||!w.id))throw Error(usage);
 const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
 const output=path.resolve(out);
 const parent=await realpath(path.dirname(output));
 if(parent===root||parent.startsWith(root+path.sep))throw Error('Refusing export inside source repository');
 if(files.some(p=>path.resolve(p)===output)||watches.some(([,w])=>path.resolve(w.watch)===output))throw Error('Refusing to overwrite a source');
 const now=Date.now();
 const states=[];
 for(const file of files)states.push(await readGoalState(file));
 const snapshot=states.length?projectGoalStates(states,{now}):{
  schema:SCHEMA,exported_at:new Date(now).toISOString(),missions:[],
  provenance:'LOCAL_OPERATOR_EXPORT_UNVERIFIED',
 };
 snapshot.nodes=[];
 for(const [nodeKey,params] of watches){
  const watchRecord=await readBoundedJson(params.watch);
  snapshot.nodes.push(projectLocalHealthWatch(watchRecord,{nodeKey,expectedNodeId:params.id,now}));
 }
 snapshot.notice='Local self-reported goal/node observations, NOT authenticated live node status, external route readiness, payment, delivery or execution authorization.';
 await writeFile(output,JSON.stringify(snapshot,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
 process.stdout.write('Local snapshot written: '+snapshot.missions.length+' goal(s), '+snapshot.nodes.length+' node watch(es). No remote health attested.\n');
}
main(process.argv.slice(2)).catch(err=>{process.stderr.write('MISSION_EXPORT_HELD: '+err.message+'\n');process.exitCode=1;});
