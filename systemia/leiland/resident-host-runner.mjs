#!/usr/bin/env node
// Opt-in Systemia resident wrapper for the existing Leiland read-only loopback host.
// No public route, publisher, private AI inference, or second heartbeat scheduler.
import path from 'node:path';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {startLeilandObservatory} from './owned-observatory-host.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SHA=/^[a-f0-9]{40}$/i;
export const RUNNER_SCHEMA='evercraft.leiland.systemia-resident.v1';

export function checkResidentSource({expectedSha,actualSha,staticRoot,publicationRoot,port}){
 if(typeof expectedSha!=='string'||!SHA.test(expectedSha)||expectedSha!==actualSha)
  throw Error('leiland_resident_release_sha_mismatch');
 const canonical=path.join(repoRoot,'public');
 if(staticRoot!==canonical||!fs.existsSync(canonical)||fs.realpathSync(canonical)!==canonical)
  throw Error('leiland_resident_canonical_source_required');
 if(typeof publicationRoot!=='string'||!path.isAbsolute(publicationRoot)||
  !fs.existsSync(publicationRoot)||fs.realpathSync(publicationRoot)!==publicationRoot||
  publicationRoot===canonical||publicationRoot.startsWith(canonical+path.sep))
  throw Error('leiland_resident_publication_root_invalid');
 if(!Number.isInteger(port)||port<0||port>65535)
  throw Error('leiland_resident_port_invalid');
 return Object.freeze({release_sha:expectedSha,port});
}
function parse(argv){
 const allowed=new Set(['--static-root','--publication-root','--release-sha','--port']);
 const result={};
 if(argv.length<6||argv.length>8||argv.length%2)throw Error('leiland_resident_arguments_invalid');
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i],value=argv[i+1];
  if(!allowed.has(key)||key in result||!value)throw Error('leiland_resident_arguments_invalid');
  result[key]=value;
 }
 if(!result['--static-root']||!result['--publication-root']||!result['--release-sha'])
  throw Error('leiland_resident_arguments_invalid');
 return result;
}
export async function startLeilandResident({argv=process.argv.slice(2),actualSha,
 startHost=startLeilandObservatory}={}){
 const a=parse(argv);
 const release=actualSha??execFileSync('git',['-C',repoRoot,'rev-parse','HEAD'],
  {encoding:'utf8',timeout:4000}).trim();
 const staticRoot=path.resolve(a['--static-root']);
 const publicationRoot=path.resolve(a['--publication-root']);
 const port=a['--port']===undefined?8795:Number(a['--port']);
 const identity=checkResidentSource({
  expectedSha:a['--release-sha'],actualSha:release,staticRoot,publicationRoot,port
 });
 const instance=await startHost({publicRoot:staticRoot,publicationRoot,releaseSha:identity.release_sha,port});
 return Object.freeze({instance,identity});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let running;
 try{
  running=await startLeilandResident();
  console.log(JSON.stringify({schema:RUNNER_SCHEMA,state:'local_resident_started',
   release_sha:running.identity.release_sha,local_origin:running.instance.origin,
   public_https_verified:false,live_inference_claim:false,publication_performed:false}));
  let closing=false;
  const stop=async()=>{
   if(closing)return;closing=true;
   try{await running.instance.close();process.exitCode=0}
   catch{process.exitCode=1}
  };
  process.once('SIGTERM',stop);
  process.once('SIGINT',stop);
 }catch(error){
  console.error('LEILAND_SYSTEMIA_RESIDENT_HELD:',
   /^[a-z][a-z0-9_]{2,100}$/.test(String(error.message))?error.message:'residency_unverified');
  process.exitCode=1;
 }
}
