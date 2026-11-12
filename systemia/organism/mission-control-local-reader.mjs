// Bounded, explicit-source, read-only local observer snapshot builder.
// Never promotes local goal/NodeSeed reports to remote attestation, payment or authority.
import path from 'node:path';
import {lstat,readFile} from 'node:fs/promises';
import {readGoalState} from './goal-store.mjs';
import {projectGoalStates} from './mission-control-projection.mjs';
import {projectLocalHealthWatch} from './mission-control-node-watch.mjs';

const SCHEMA='evercraft.systemia.operator-mission-snapshot.v1';
const MAX_BYTES=1024*1024;
async function explicitSource(file){
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('only explicit absolute local input paths allowed');
 const meta=await lstat(file);
 if(!meta.isFile()||meta.isSymbolicLink()||meta.size<1||meta.size>MAX_BYTES)throw Error('local source is not a bounded regular file');
 return file;
}
export async function buildLocalMissionSnapshot({stateFiles=[],nodeWatches=[],now=Date.now()}={}){
 if(!Array.isArray(stateFiles)||!Array.isArray(nodeWatches)||stateFiles.length>80||nodeWatches.length>2)throw Error('source selection out of bounds');
 if(!stateFiles.length&&!nodeWatches.length)throw Error('explicit local source required');
 if(!Number.isFinite(now))throw Error('invalid observation clock');
 const selected=[...stateFiles,...nodeWatches.map(x=>x?.file)];
 if(selected.some(x=>typeof x!=='string')||new Set(selected).size!==selected.length)throw Error('missing or duplicate source');
 const states=[];
 for(const file of stateFiles){
  await explicitSource(file);
  states.push(await readGoalState(file));
 }
 const snapshot=states.length?projectGoalStates(states,{now}):{
  schema:SCHEMA,exported_at:new Date(now).toISOString(),missions:[],
  provenance:'LOCAL_OPERATOR_EXPORT_UNVERIFIED',
 };
 const keys=new Set();
 snapshot.nodes=[];
 for(const entry of nodeWatches){
  if(!entry||!['node001','node002'].includes(entry.nodeKey)||keys.has(entry.nodeKey))throw Error('invalid or duplicate node slot');
  keys.add(entry.nodeKey);
  const file=await explicitSource(entry.file);
  const contents=await readFile(file,'utf8');
  if(contents.length>262144)throw Error('local health watch exceeds bound');
  snapshot.nodes.push(projectLocalHealthWatch(JSON.parse(contents),{
   nodeKey:entry.nodeKey,expectedNodeId:entry.expectedNodeId,now
  }));
 }
 snapshot.notice='LOCAL SELF-REPORTED SOURCE. No authenticated remote status, payment, fulfillment, live worker, or authority attested.';
 if(JSON.stringify(snapshot).length>249000)throw Error('sanitized snapshot exceeds browser import contract');
 return snapshot;
}
