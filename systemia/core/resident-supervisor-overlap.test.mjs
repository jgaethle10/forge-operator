import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {SystemiaCoreResidentSupervisor} from './resident-supervisor.mjs';

test('slow cycle retains ownership through repeated overlapping ticks',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'systemia-overlap-'));
 let supervisor;
 const children=[];
 try{
  fs.writeFileSync(path.join(root,'worker.mjs'),'');
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({schema:'evercraft.systemia.workflow-manifest.v1',workflow_key:'overlap-proof',cadence_seconds:1}));
  const configPath=path.join(root,'config.json');
  fs.writeFileSync(configPath,JSON.stringify({schema:'evercraft.systemia.resident-supervisor-config.v1',services:[{service_key:'overlap-proof',mode:'cycle',manifest:'manifest.json',executable:'worker.mjs',cadence_seconds:1}]}));
  supervisor=new SystemiaCoreResidentSupervisor({repoRoot:root,configPath,stateDir:path.join(root,'state'),spawnImpl:()=>{
   const child=new EventEmitter();
   child.stdout=new EventEmitter();child.stderr=new EventEmitter();
   child.kill=()=>{queueMicrotask(()=>child.emit('close',0));return true;};
   children.push(child);return child;
  }});
  supervisor.start();
  await new Promise(resolve=>setTimeout(resolve,3250));
  assert.equal(children.length,1);
  const live=supervisor.health().services[0];
  assert.equal(live.status,'running');
  assert.equal(live.run_count,1);
  assert.equal(live.hold_reason,'previous_cycle_still_running');
  const receipts=fs.readFileSync(path.join(root,'state','receipts.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(receipts.filter(r=>r.type==='cycle.held').length>=2);
  children[0].emit('close',0);
  assert.equal(supervisor.health().services[0].status,'idle');
  await new Promise(resolve=>setTimeout(resolve,1100));
  assert.equal(children.length,2);
 }finally{
  await supervisor?.stop();
  fs.rmSync(root,{recursive:true,force:true});
 }
});
