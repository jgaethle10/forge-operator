#!/usr/bin/env node
/**
 * Local-only source freshness guard, executed before each resident EO-001 QA.
 * Fail closed on source drift or a modified tracked checkout. Does not fetch,
 * authorize, run models, change services, or access private evidence.
 */
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export function verifyLocalSourcePin({root,expectedPin,run=spawnSync}={}){
  if(!/^[a-f0-9]{40}$/.test(expectedPin||''))return {ok:false,reason:'PIN_MISSING'};
  const head=run('git',['-C',root,'rev-parse','--verify','HEAD'],
    {encoding:'utf8',timeout:4000,maxBuffer:4096});
  if(head.error||head.status!==0||String(head.stdout||'').trim()!==expectedPin)
    return {ok:false,reason:'SOURCE_DRIFT'};
  const changes=run('git',['-C',root,'status','--porcelain','--untracked-files=no'],
    {encoding:'utf8',timeout:4000,maxBuffer:4096});
  if(changes.error||changes.status!==0||String(changes.stdout||'').trim())
    return {ok:false,reason:'TRACKED_SOURCE_CHANGED'};
  return {ok:true,state:'PINNED_SOURCE_UNCHANGED'};
}
if(import.meta.url===pathToFileURL(path.resolve(process.argv[1]||'')).href){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const result=verifyLocalSourcePin({root,expectedPin:process.argv[2]});
  process.stdout.write(JSON.stringify(result)+'\n');
  if(!result.ok)process.exitCode=2;
}
