#!/usr/bin/env node
// Explicit local-only Systemia snapshot exporter. No network, automatic scan or dispatch.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpath,writeFile} from 'node:fs/promises';
import {buildLocalMissionSnapshot} from './mission-control-local-reader.mjs';

function parseArgs(argv){
 const stateFiles=[],node={node001:{},node002:{}};let out='';
 const usage='Usage: [--state /absolute/goal.json] [--node001-watch /absolute/health-watch.json --node001-id expected-id] [--node001-attestation /absolute/attest.json --node001-public-key /absolute/owner-pinned.pem --node001-nonce-file /absolute/challenge.txt --node001-id expected-id] --out /absolute/new-snapshot.json';
 for(let i=0;i<argv.length;i++){
  const key=argv[i],value=argv[++i];
  if(!value||value.startsWith('--'))throw Error(usage);
  if(key==='--state')stateFiles.push(value);
  else if(key==='--out'&&!out)out=value;
  else if(/^--node00[12]-(watch|id|attestation|public-key|nonce-file)$/.test(key)){
   const [,nodeKey,field]=key.match(/^--(node00[12])-(watch|id|attestation|public-key|nonce-file)$/);
   if(node[nodeKey][field])throw Error('Duplicate node parameter');
   node[nodeKey][field]=value;
  }else throw Error(usage);
 }
 const nodeWatches=[],nodeIdentityProofs=[];
 for(const [nodeKey,params] of Object.entries(node)){
  if(params.watch&&!params.id)throw Error('Node watch requires pinned ID');
  if(params.watch)nodeWatches.push({nodeKey,file:params.watch,expectedNodeId:params.id});
  const identitySelected=Boolean(params.attestation||params['public-key']||params['nonce-file']);
  if(identitySelected){
   if(!params.id||!params.attestation||!params['public-key']||!params['nonce-file'])throw Error('Identity proof requires node ID, attestation, public key and nonce-file');
   nodeIdentityProofs.push({nodeKey,file:params.attestation,
    keyFile:params['public-key'],nonceFile:params['nonce-file'],expectedNodeId:params.id});
  }
  if(params.id&&!params.watch&&!identitySelected)throw Error('Node ID without explicit source');
 }
 if(!out||!stateFiles.length&&!nodeWatches.length&&!nodeIdentityProofs.length)throw Error(usage);
 return {stateFiles,nodeWatches,nodeIdentityProofs,out};
}
async function main(argv){
 const {stateFiles,nodeWatches,nodeIdentityProofs,out}=parseArgs(argv);
 const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
 const output=path.resolve(out);
 const parent=await realpath(path.dirname(output));
 if(parent===root||parent.startsWith(root+path.sep))throw Error('Export output must be outside the source repository');
 const sources=[...stateFiles,...nodeWatches.map(x=>x.file),...nodeIdentityProofs.flatMap(x=>[x.file,x.keyFile,x.nonceFile])];
 if(sources.some(file=>path.resolve(file)===output))throw Error('Refusing to overwrite source file');
 const snapshot=await buildLocalMissionSnapshot({stateFiles,nodeWatches,nodeIdentityProofs});
 await writeFile(output,JSON.stringify(snapshot,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
 process.stdout.write('Local Systemia snapshot: '+snapshot.missions.length+' goal(s), '+snapshot.nodes.length+' node(s), '+snapshot.identity_checks.length+' pinned identity check(s). No remote status attested.\n');
}
main(process.argv.slice(2)).catch(error=>{process.stderr.write('MISSION_EXPORT_HELD: '+error.message+'\n');process.exitCode=1;});
