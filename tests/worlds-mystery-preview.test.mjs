import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

test('private mystery preview serves real Worlds and shuts down on request',async()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const child=spawn(process.execPath,['scripts/start-worlds-mystery-preview.mjs'],{
    cwd:root,stdio:['ignore','pipe','pipe']
  });
  let stderr='';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data',s=>{stderr+=s.slice(0,500);});
  const url=await new Promise((resolve,reject)=>{
    let buf='';
    const timer=setTimeout(()=>reject(Error('Preview did not start: '+stderr)),12000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',part=>{
      buf+=part;
      const m=buf.match(/http:\/\/127\.0\.0\.1:(\d+)\/worlds\//);
      if(m){clearTimeout(timer);resolve(m[0]);}
    });
    child.once('exit',code=>{
      clearTimeout(timer);reject(Error('Private preview terminated early: '+code+' '+stderr));
    });
  }).catch(err=>{child.kill('SIGTERM');throw err;});
  try {
    assert.match(url,/^http:\/\/127\.0\.0\.1:\d+\/worlds\/$/);
    assert.equal((await fetch(url)).status,200);
    assert.equal((await fetch(url+'app.mjs')).status,200);
    assert.equal((await fetch(url+'mystery-walk.mjs')).status,200);
    assert.equal((await fetch(url.replace('/worlds/','/the-window/mystery.mjs'))).status,200);
    assert.equal((await fetch(url.replace('/worlds/','/the-window/index.html'))).status,404);
  } finally {
    if(child.exitCode===null&&!child.killed)child.kill('SIGTERM');
    if(child.exitCode===null)await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(resolve,3000))]);
    if(child.exitCode===null)child.kill('SIGKILL');
  }
});
