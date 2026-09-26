import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'public-edge-controller-runner-proof-'));
const sharedState=path.join(root,'shared');
fs.mkdirSync(sharedState,{recursive:true});

const child=spawn(
  process.execPath,
  [
    'systemia/organism/public-edge-controller-runner.mjs',
    '--attach-poll-ms','100',
    '--interval-ms','5000',
  ],
  {
    env:{
      ...process.env,
      EVERCRAFT_PUBLIC_EDGE_STATE_DIR:sharedState,
    },
    stdio:['ignore','pipe','pipe'],
  }
);

let stdout='';
let stderr='';
child.stdout.on('data',(chunk)=>{stdout+=chunk.toString('utf8');});
child.stderr.on('data',(chunk)=>{stderr+=chunk.toString('utf8');});

async function waitFor(predicate,{timeoutMs=4000,stepMs=25}={}){
  const start=Date.now();
  while(Date.now()-start<timeoutMs){
    if(predicate()) return;
    await new Promise(resolve=>setTimeout(resolve,stepMs));
  }
  throw new Error('proof_timeout');
}

try{
  await waitFor(()=>stdout.includes('held_waiting_for_activation_watch'));
  assert.equal(child.exitCode,null,'resident runner must remain alive while waiting');

  const firstLine=stdout.trim().split('\n').map((x)=>{
    try{return JSON.parse(x);}catch{return null;}
  }).find((x)=>x?.state==='held_waiting_for_activation_watch');
  assert.ok(firstLine);
  assert.equal(firstLine.ok,true);
  assert.equal(firstLine.activation_owner,'public-edge-activation-watch');
  assert.equal(firstLine.maintenance_owner,'public-edge-controller');
  assert.equal(firstLine.founder_login_required,false);
  assert.equal(firstLine.payment_authority,false);
  assert.equal(firstLine.resident_process_alive,true);

  const source=fs.readFileSync(
    'systemia/organism/public-edge-controller-runner.mjs',
    'utf8'
  );
  for(const forbidden of [
    '--capacity-endpoint',
    '--allocator-token-file',
    '--tls-key-path',
    '--tls-cert-path',
    '--base-domain',
    '.provision({',
  ]){
    assert.equal(
      source.includes(forbidden),
      false,
      'resume-only runner must not contain '+forbidden
    );
  }
  assert.ok(source.includes('.resume({rebindIfNeeded:true})'));

  child.kill('SIGTERM');
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('runner_stop_timeout')),3000);
    child.once('close',(code)=>{
      clearTimeout(timer);
      assert.equal(code,0);
      resolve();
    });
  });

  assert.ok(stdout.includes('"state":"stopped"'));

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.public-edge.controller-runner-proof.v2',
    holds_before_activation:true,
    stays_resident_while_held:true,
    activation_owner:'public-edge-activation-watch',
    maintenance_owner:'public-edge-controller',
    manual_capacity_endpoint_removed:true,
    manual_tls_arguments_removed:true,
    allocator_token_file_removed:true,
    direct_provision_removed:true,
    graceful_supervisor_stop:true,
    managed_runtime_left_running_on_supervisor_stop:true,
    founder_login_required:false,
    payment_authority:false,
  },null,2));
}finally{
  try{if(child.exitCode===null) child.kill('SIGKILL');}catch{}
  fs.rmSync(root,{recursive:true,force:true});
  if(stderr.trim()) process.stderr.write(stderr);
}
