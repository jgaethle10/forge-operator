#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  emptyCfbClipResidentState,
  runCfbJournalPublishCycle,
} from './cfb-journal-resident.mjs';

function arg(name,fallback=null){
  const index=process.argv.indexOf(name);
  return index>=0&&process.argv[index+1]?process.argv[index+1]:fallback;
}
function has(name){ return process.argv.includes(name); }
function readJson(file,fallback){
  if(!fs.existsSync(file)) return fallback;
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}
  catch{return fallback;}
}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  const temp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(temp,file);
}

const repoRoot=path.resolve(arg('--repo-root',process.env.SYSTEMIA_WORKSPACE_ROOT||'.'));
const journalRoot=path.resolve(arg('--journal-root',path.join(repoRoot,'public','journal')));
const credentialStateDir=path.resolve(arg('--credential-state-dir',process.env.EVERCRAFT_CREDENTIAL_STATE_DIR||path.join(process.env.EVERCRAFT_IDENTITY_STATE_DIR||repoRoot,'provider-credentials')));
const stateDir=path.resolve(arg('--state-dir',process.env.SYSTEMIA_CFB_CLIP_STATE_DIR||'artifacts/cfb-clip-resident'));
const intervalMs=Math.max(30000,Number(arg('--interval-ms',process.env.SYSTEMIA_CFB_CLIP_INTERVAL_MS||300000)));
const once=has('--once');
const stateFile=path.join(stateDir,'state.json');
let state=readJson(stateFile,emptyCfbClipResidentState());
let running=true;
let cycleRunning=false;

async function cycle(){
  if(cycleRunning) return;
  cycleRunning=true;
  try{
    const result=await runCfbJournalPublishCycle({
      journalRoot,
      credentialStateDir,
      inputState:state,
      now:()=>new Date().toISOString(),
      maxPublishesPerCycle:1,
    });
    state=result.state;
    atomicJson(stateFile,state);
    atomicJson(path.join(stateDir,'latest.json'),result.snapshot);
    process.stdout.write(JSON.stringify({ok:true,...result.snapshot})+'\n');
  }catch(error){
    process.stderr.write(JSON.stringify({
      ok:false,
      at:new Date().toISOString(),
      error:String(error?.stack||error?.message||error),
    })+'\n');
    if(once) process.exitCode=1;
  }finally{
    cycleRunning=false;
  }
}

await cycle();
if(!once){
  const timer=setInterval(()=>{if(running) cycle();},intervalMs);
  const stop=async()=>{
    if(!running) return;
    running=false;
    clearInterval(timer);
    while(cycleRunning) await new Promise(resolve=>setTimeout(resolve,25));
    process.exit(0);
  };
  process.on('SIGINT',stop);
  process.on('SIGTERM',stop);
  await new Promise(()=>{});
}
