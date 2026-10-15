import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DurableWorldStore} from './durable-store.mjs';
import {REAL_TICK_MS} from './engine.mjs';

function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function waitForReady(base,child){
  for(let i=0;i<70;i++){
    if(child.exitCode!==null)throw new Error('Spectator process exited early');
    try{const r=await fetch(base+'/api/health');if(r.ok)return await r.json();}catch{}
    await wait(50);
  }
  throw new Error('Timed out waiting for spectator server');
}
async function observe(base){
  const controller=new AbortController();
  const response=await fetch(base+'/api/events',{signal:controller.signal});
  assert.equal(response.status,200);
  const reader=response.body.getReader();
  const decoder=new TextDecoder();
  let buffer='';
  try{
    for(let i=0;i<12;i++){
      const {value,done}=await reader.read();
      if(done)throw new Error('SSE closed before initial snapshot');
      buffer+=decoder.decode(value,{stream:true});
      if(buffer.includes('\n\n')){
        const packet=buffer.split('\n\n')[0];
        const line=packet.split('\n').find(x=>x.startsWith('data: '));
        assert.ok(line,'missing snapshot payload');
        return JSON.parse(line.slice(6));
      }
    }
    throw new Error('No complete initial snapshot in SSE');
  }finally{
    controller.abort();
    try{await reader.cancel();}catch{}
  }
}
async function stop(child){
  if(child.exitCode!==null)return;
  const ended=new Promise(resolve=>child.once('exit',resolve));
  child.kill('SIGTERM');
  await Promise.race([ended,wait(2000)]);
  if(child.exitCode===null)child.kill('SIGKILL');
}
test('independent SSE observers agree and reconnect after restart', {timeout:20000}, async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'window-observers-'));
  const now=Date.now(),start=now-2*REAL_TICK_MS;
  const seed=new DurableWorldStore(dir,{now:()=>start});
  seed.tick(start+REAL_TICK_MS);
  seed.tick(start+2*REAL_TICK_MS);
  const port=18000+Math.floor(Math.random()*28000);
  const url='http://127.0.0.1:'+port;
  const boot=()=>spawn(process.execPath,['server.mjs'],{
    cwd:new URL('.',import.meta.url),
    env:{...process.env,PORT:String(port),WINDOW_DATA_DIR:dir},
    stdio:'ignore'
  });
  let child=boot();
  try{
    await waitForReady(url,child);
    const [a,b]=await Promise.all([observe(url),observe(url)]);
    assert.deepEqual(a,b);
    assert.equal(a.actors.length,12);
    assert.equal(a.tick,2);
    const before=a.tick;
    await stop(child);
    child=boot();
    await waitForReady(url,child);
    const c=await observe(url);
    assert.equal(c.tick,before);
    assert.deepEqual(c.actors,a.actors);
  }finally{
    await stop(child);
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
